import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { addDays } from 'date-fns';
import { safeParseDate } from './date';
import { useTaskStore, flushPendingSave, setStorageAdapter } from './store';
import type { StorageAdapter } from './storage';

describe('TaskStore', () => {
    let mockStorage: StorageAdapter;

    beforeEach(() => {
        // Create fresh mock storage for each test
        mockStorage = {
            getData: vi.fn().mockResolvedValue({ tasks: [], projects: [], sections: [], areas: [], settings: {} }),
            saveData: vi.fn().mockResolvedValue(undefined),
        };
        setStorageAdapter(mockStorage);
        useTaskStore.setState({
            tasks: [],
            projects: [],
            sections: [],
            areas: [],
            settings: {},
            _allTasks: [],
            _allProjects: [],
            _allSections: [],
            _allAreas: [],
        });
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should add a task', () => {
        const { addTask } = useTaskStore.getState();
        addTask('New Task');

        const { tasks } = useTaskStore.getState();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].title).toBe('New Task');
        expect(tasks[0].status).toBe('inbox');
    });

    it('should update a task', () => {
        const { addTask, updateTask } = useTaskStore.getState();
        addTask('Task to Update');

        const task = useTaskStore.getState().tasks[0];
        updateTask(task.id, { title: 'Updated Task', status: 'next' });

        const updatedTask = useTaskStore.getState().tasks[0];
        expect(updatedTask.title).toBe('Updated Task');
        expect(updatedTask.status).toBe('next');
    });

    it('should clear action fields when a task becomes reference', () => {
        const { addTask, updateTask } = useTaskStore.getState();
        addTask('Reference Task', {
            status: 'next',
            startTime: '2025-01-01T08:00:00.000Z',
            dueDate: '2025-01-01T09:00:00.000Z',
            reviewAt: '2025-01-02T09:00:00.000Z',
            recurrence: 'daily',
            priority: 'high',
            timeEstimate: '30min',
            checklist: [{ id: 'c1', title: 'Subtask', isCompleted: false }],
            isFocusedToday: true,
            pushCount: 2,
        });

        const task = useTaskStore.getState().tasks[0];
        updateTask(task.id, { status: 'reference' });

        const updatedTask = useTaskStore.getState()._allTasks.find(t => t.id === task.id)!;
        expect(updatedTask.status).toBe('reference');
        expect(updatedTask.startTime).toBeUndefined();
        expect(updatedTask.dueDate).toBeUndefined();
        expect(updatedTask.reviewAt).toBeUndefined();
        expect(updatedTask.recurrence).toBeUndefined();
        expect(updatedTask.priority).toBeUndefined();
        expect(updatedTask.timeEstimate).toBeUndefined();
        expect(updatedTask.checklist).toBeUndefined();
        expect(updatedTask.isFocusedToday).toBe(false);
        expect(updatedTask.pushCount).toBe(0);
    });

    it('should delete a task', () => {
        const { addTask, deleteTask } = useTaskStore.getState();
        addTask('Task to Delete');

        const task = useTaskStore.getState().tasks[0];
        deleteTask(task.id);

        const { tasks } = useTaskStore.getState();
        expect(tasks).toHaveLength(0);
    });

    it('should increment revision metadata when purging a task', () => {
        const { addTask, deleteTask, purgeTask } = useTaskStore.getState();
        addTask('Task to Purge');

        const task = useTaskStore.getState()._allTasks[0];
        deleteTask(task.id);
        const deleted = useTaskStore.getState()._allTasks.find((item) => item.id === task.id)!;
        const deletedRev = deleted.rev ?? 0;

        purgeTask(task.id);
        const purged = useTaskStore.getState()._allTasks.find((item) => item.id === task.id)!;
        expect(purged.purgedAt).toBeTruthy();
        expect((purged.rev ?? 0)).toBeGreaterThan(deletedRev);
        expect(typeof purged.revBy).toBe('string');
        expect((purged.revBy ?? '').length).toBeGreaterThan(0);
    });

    it('skips fetch while edits are in progress', async () => {
        const { lockEditing, unlockEditing, fetchData } = useTaskStore.getState();
        lockEditing();
        await fetchData({ silent: true });
        expect(mockStorage.getData).not.toHaveBeenCalled();
        unlockEditing();
    });

    it('purges expired tombstones during fetch even without sync', async () => {
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        mockStorage.getData = vi.fn().mockResolvedValue({
            tasks: [
                {
                    id: 't-old',
                    title: 'Old tombstone',
                    status: 'done',
                    tags: [],
                    contexts: [],
                    createdAt: '2025-01-01T00:00:00.000Z',
                    updatedAt: '2025-06-01T00:00:00.000Z',
                    deletedAt: '2025-06-01T00:00:00.000Z',
                    purgedAt: '2025-06-01T00:00:00.000Z',
                },
            ],
            projects: [],
            sections: [],
            areas: [],
            settings: {},
        });

        await useTaskStore.getState().fetchData({ silent: true });
        await flushPendingSave();

        expect(useTaskStore.getState()._allTasks).toHaveLength(0);
        expect((mockStorage.saveData as unknown as { mock: { calls: any[][] } }).mock.calls.length).toBeGreaterThan(0);
    });

    it('supports a basic task lifecycle', async () => {
        const { addTask, updateTask, moveTask } = useTaskStore.getState();
        addTask('Lifecycle Task');
        const taskId = useTaskStore.getState().tasks[0].id;

        updateTask(taskId, { title: 'Lifecycle Task Updated', status: 'next' });
        await moveTask(taskId, 'done');
        await moveTask(taskId, 'archived');

        const archived = useTaskStore.getState()._allTasks.find((task) => task.id === taskId);
        expect(archived?.status).toBe('archived');
        expect(archived?.title).toBe('Lifecycle Task Updated');
    });

    it('should coalesce saves and allow immediate flush', async () => {
        const { addTask } = useTaskStore.getState();

        // 1. Trigger a change
        addTask('Test Save');

        // 2. Flush pending save (should be safe even if already in-flight)
        await flushPendingSave();

        // Should have saved exactly once
        expect(mockStorage.saveData).toHaveBeenCalledTimes(1);
    });

    it('should persist the latest snapshot after rapid edits', async () => {
        const { addTask, addProject, updateTask } = useTaskStore.getState();

        addTask('Alpha');
        const taskId = useTaskStore.getState().tasks[0].id;
        const project = await addProject('Project Alpha', '#123456');
        expect(project).not.toBeNull();
        if (!project) return;

        updateTask(taskId, { title: 'Alpha Updated', projectId: project.id });
        await flushPendingSave();

        const saveCalls = (mockStorage.saveData as unknown as { mock: { calls: any[][] } }).mock.calls;
        const saved = saveCalls[saveCalls.length - 1]?.[0];
        expect(saved.projects).toHaveLength(1);
        expect(saved.tasks).toHaveLength(1);
        expect(saved.tasks[0].title).toBe('Alpha Updated');
        expect(saved.tasks[0].projectId).toBe(project.id);
    });

    it('should add a project', () => {
        const { addProject } = useTaskStore.getState();
        addProject('New Project', '#ff0000');

        const { projects } = useTaskStore.getState();
        expect(projects).toHaveLength(1);
        expect(projects[0].title).toBe('New Project');
        expect(projects[0].color).toBe('#ff0000');
    });

    it('should soft-delete areas and clear area references from projects/tasks', async () => {
        const { addArea, addProject, addTask, deleteArea } = useTaskStore.getState();
        const area = await addArea('Work');
        expect(area).not.toBeNull();
        if (!area) return;

        const project = await addProject('Area Project', '#123456', { areaId: area.id });
        expect(project).not.toBeNull();
        if (!project) return;
        addTask('Area Task', { areaId: area.id, status: 'next' });

        await deleteArea(area.id);

        const state = useTaskStore.getState();
        expect(state.areas).toHaveLength(0);
        const tombstone = state._allAreas.find((item) => item.id === area.id);
        expect(tombstone?.deletedAt).toBeTruthy();

        const updatedProject = state._allProjects.find((item) => item.id === project.id)!;
        expect(updatedProject.areaId).toBeUndefined();
        const updatedTask = state._allTasks.find((item) => item.title === 'Area Task')!;
        expect(updatedTask.areaId).toBeUndefined();
    });

    it('should move a project to someday without altering task status', () => {
        const { addProject, addTask, updateProject } = useTaskStore.getState();
        addProject('My Project', '#00ff00');

        const project = useTaskStore.getState().projects[0];
        addTask('Task 1', { status: 'next', projectId: project.id });
        addTask('Task 2', { status: 'waiting', projectId: project.id });

        updateProject(project.id, { status: 'someday' });

        const projectTasks = useTaskStore.getState()._allTasks.filter(t => t.projectId === project.id && !t.deletedAt);
        expect(projectTasks).toHaveLength(2);
        expect(projectTasks.map(t => t.status)).toEqual(['next', 'waiting']);
    });

    it('should archive a project and archive its active tasks', () => {
        const { addProject, addTask, updateProject } = useTaskStore.getState();
        addProject('Archived Project', '#123456');

        const project = useTaskStore.getState().projects[0];
        addTask('Task 1', { status: 'next', projectId: project.id });
        addTask('Task 2', { status: 'waiting', projectId: project.id });

        updateProject(project.id, { status: 'archived' });

        const projectTasks = useTaskStore.getState()._allTasks.filter(t => t.projectId === project.id && !t.deletedAt);
        expect(projectTasks).toHaveLength(2);
        expect(projectTasks.every(t => t.status === 'archived')).toBe(true);
    });

    it('should roll a recurring task when completed', () => {
        const { addTask, moveTask } = useTaskStore.getState();
        addTask('Daily Task', {
            status: 'next',
            recurrence: 'daily',
            dueDate: '2023-01-01T09:00',
        });

        const original = useTaskStore.getState().tasks[0];
        moveTask(original.id, 'done');

        const state = useTaskStore.getState();
        expect(state._allTasks).toHaveLength(2);

        const completed = state._allTasks.find(t => t.id === original.id)!;
        expect(completed.status).toBe('done');
        expect(completed.completedAt).toBeTruthy();

        const nextInstance = state._allTasks.find(t => t.id !== original.id)!;
        expect(nextInstance.status).toBe('next');
        expect(nextInstance.recurrence).toBe('daily');
        expect(nextInstance.dueDate).toBe('2023-01-02T09:00');
    });

    it('should roll a fluid recurring task from completion date', () => {
        const { addTask, updateTask, moveTask } = useTaskStore.getState();
        addTask('Fluid Task', {
            status: 'next',
            recurrence: { rule: 'daily', strategy: 'fluid' },
            dueDate: '2023-01-01T09:00',
        });

        const original = useTaskStore.getState().tasks[0];
        updateTask(original.id, { dueDate: '2023-01-05T09:00' });
        moveTask(original.id, 'done');

        const state = useTaskStore.getState();
        const completed = state._allTasks.find(t => t.id === original.id)!;
        const nextInstance = state._allTasks.find(t => t.id !== original.id)!;

        expect(completed.completedAt).toBeTruthy();
        const completedAt = completed.completedAt!;
        const base = safeParseDate(completedAt) ?? new Date(completedAt);
        const expectedNext = addDays(base, 1).toISOString();
        expect(nextInstance.dueDate).toBe(expectedNext);
    });

    it('should increment pushCount when dueDate is pushed later', () => {
        const { addTask, updateTask } = useTaskStore.getState();
        addTask('Push Count', {
            status: 'next',
            dueDate: '2025-01-01T09:00:00.000Z',
        });

        const task = useTaskStore.getState().tasks[0];
        updateTask(task.id, { dueDate: '2025-01-02T09:00:00.000Z' });

        const updated = useTaskStore.getState()._allTasks.find(t => t.id === task.id)!;
        expect(updated.pushCount).toBe(1);

        updateTask(task.id, { dueDate: '2024-12-31T09:00:00.000Z' });
        const updatedEarlier = useTaskStore.getState()._allTasks.find(t => t.id === task.id)!;
        expect(updatedEarlier.pushCount).toBe(1);
    });

    describe('Sections', () => {
        it('should create, update, and delete sections with auto-ordering', async () => {
            const { addProject, addSection, updateSection, deleteSection, addTask } = useTaskStore.getState();
            const project = await addProject('Section Project', '#123456');
            expect(project).not.toBeNull();
            if (!project) return;

            const first = await addSection(project.id, 'Phase 1');
            const second = await addSection(project.id, 'Phase 2');

            expect(first).not.toBeNull();
            expect(second).not.toBeNull();
            expect(first?.order).toBe(0);
            expect(second?.order).toBe(1);

            if (!first) return;
            await updateSection(first.id, { title: 'Updated Phase' });
            const updated = useTaskStore.getState().sections.find((section) => section.id === first.id);
            expect(updated?.title).toBe('Updated Phase');

            await addTask('Section Task', { projectId: project.id, sectionId: first.id, status: 'next' });
            const task = useTaskStore.getState()._allTasks.find((item) => item.title === 'Section Task')!;
            expect(task.sectionId).toBe(first.id);

            await deleteSection(first.id);
            const clearedTask = useTaskStore.getState()._allTasks.find((item) => item.id === task.id)!;
            expect(clearedTask.sectionId).toBeUndefined();
            expect(useTaskStore.getState().sections.find((section) => section.id === first.id)).toBeUndefined();
        });

        it('should not create sections without a valid project or title', async () => {
            const { addProject, addSection } = useTaskStore.getState();
            const invalid = await addSection('missing-project', 'Section');
            expect(invalid).toBeNull();

            const project = await addProject('Valid Project', '#abcdef');
            expect(project).not.toBeNull();
            if (!project) return;
            const blank = await addSection(project.id, '   ');
            expect(blank).toBeNull();
            expect(useTaskStore.getState().sections).toHaveLength(0);
        });

        it('should clear sectionId when task moves to another project', async () => {
            const { addProject, addSection, addTask, updateTask } = useTaskStore.getState();
            const projectA = await addProject('Project A', '#111111');
            const projectB = await addProject('Project B', '#222222');
            expect(projectA).not.toBeNull();
            expect(projectB).not.toBeNull();
            if (!projectA || !projectB) return;
            const sectionA = await addSection(projectA.id, 'Section A');
            if (!sectionA) return;

            await addTask('Movable Task', { projectId: projectA.id, sectionId: sectionA.id, status: 'next' });
            const task = useTaskStore.getState()._allTasks.find((item) => item.title === 'Movable Task')!;
            expect(task.sectionId).toBe(sectionA.id);

            await updateTask(task.id, { projectId: projectB.id });
            const updated = useTaskStore.getState()._allTasks.find((item) => item.id === task.id)!;
            expect(updated.projectId).toBe(projectB.id);
            expect(updated.sectionId).toBeUndefined();
        });

        it('should clear sectionId when deleting a project', async () => {
            const { addProject, addSection, addTask, deleteProject } = useTaskStore.getState();
            const project = await addProject('Delete Project', '#333333');
            expect(project).not.toBeNull();
            if (!project) return;
            const section = await addSection(project.id, 'Cleanup');
            if (!section) return;

            await addTask('Project Task', { projectId: project.id, sectionId: section.id, status: 'next' });
            const task = useTaskStore.getState()._allTasks.find((item) => item.title === 'Project Task')!;
            expect(task.sectionId).toBe(section.id);

            await deleteProject(project.id);
            const deletedTask = useTaskStore.getState()._allTasks.find((item) => item.id === task.id)!;
            expect(deletedTask.deletedAt).toBeTruthy();
            expect(deletedTask.sectionId).toBeUndefined();
        });
    });
});
