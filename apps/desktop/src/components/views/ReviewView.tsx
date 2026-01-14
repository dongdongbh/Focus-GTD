import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { ReviewHeader } from './review/ReviewHeader';
import { ReviewFiltersBar } from './review/ReviewFiltersBar';
import { ReviewBulkActions } from './review/ReviewBulkActions';
import { ReviewTaskList } from './review/ReviewTaskList';
import { DailyReviewGuideModal } from './review/DailyReviewModal';
import { WeeklyReviewGuideModal } from './review/WeeklyReviewModal';

import { sortTasksBy, useTaskStore, type Project, type Task, type TaskStatus, type TaskSortBy } from '@mindwtr/core';

import { PromptModal } from '../PromptModal';
import { useLanguage } from '../../contexts/language-context';

export function ReviewView() {
    const { tasks, projects, settings, batchMoveTasks, batchDeleteTasks, batchUpdateTasks } = useTaskStore();
    const { t } = useLanguage();
    const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
    const [selectionMode, setSelectionMode] = useState(false);
    const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
    const [tagPromptOpen, setTagPromptOpen] = useState(false);
    const [tagPromptIds, setTagPromptIds] = useState<string[]>([]);
    const [showGuide, setShowGuide] = useState(false);
    const [showDailyGuide, setShowDailyGuide] = useState(false);
    const [moveToStatus, setMoveToStatus] = useState<TaskStatus | ''>('');

    const sortBy = (settings?.taskSortBy ?? 'default') as TaskSortBy;

    const projectMap = useMemo(() => {
        return projects.reduce((acc, project) => {
            acc[project.id] = project;
            return acc;
        }, {} as Record<string, Project>);
    }, [projects]);

    const tasksById = useMemo(() => {
        return tasks.reduce((acc, task) => {
            acc[task.id] = task;
            return acc;
        }, {} as Record<string, Task>);
    }, [tasks]);

    const activeTasks = useMemo(() => {
        return tasks.filter((t) => !t.deletedAt);
    }, [tasks]);

    const statusOptions: TaskStatus[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

    const statusCounts = useMemo(() => {
        const counts: Record<string, number> = { all: activeTasks.length };
        for (const status of statusOptions) {
            counts[status] = activeTasks.filter((t) => t.status === status).length;
        }
        return counts;
    }, [activeTasks]);

    const filteredTasks = useMemo(() => {
        const list = filterStatus === 'all' ? activeTasks : activeTasks.filter((t) => t.status === filterStatus);
        return sortTasksBy(list, sortBy);
    }, [activeTasks, filterStatus, sortBy]);

    const selectedIdsArray = useMemo(() => Array.from(multiSelectedIds), [multiSelectedIds]);

    const bulkStatuses: TaskStatus[] = ['inbox', 'next', 'waiting', 'someday', 'done'];

    const exitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        setMultiSelectedIds(new Set());
    }, []);

    useEffect(() => {
        exitSelectionMode();
    }, [filterStatus, exitSelectionMode]);

    const toggleMultiSelect = useCallback((taskId: string) => {
        if (!selectionMode) setSelectionMode(true);
        setMultiSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    }, [selectionMode]);

    const handleBatchMove = useCallback(async (newStatus: TaskStatus) => {
        if (selectedIdsArray.length === 0) return;
        await batchMoveTasks(selectedIdsArray, newStatus);
        setMoveToStatus('');
        exitSelectionMode();
    }, [batchMoveTasks, selectedIdsArray, exitSelectionMode]);

    const handleBatchDelete = useCallback(async () => {
        if (selectedIdsArray.length === 0) return;
        await batchDeleteTasks(selectedIdsArray);
        exitSelectionMode();
    }, [batchDeleteTasks, selectedIdsArray, exitSelectionMode]);

    const handleBatchAddTag = useCallback(async () => {
        if (selectedIdsArray.length === 0) return;
        setTagPromptIds(selectedIdsArray);
        setTagPromptOpen(true);
    }, [batchUpdateTasks, selectedIdsArray, tasksById, t, exitSelectionMode]);

    return (
        <ErrorBoundary>
            <div className="space-y-6">
                <ReviewHeader
                    title={t('review.title')}
                    taskCountLabel={`${filteredTasks.length} ${t('common.tasks')}`}
                    selectionMode={selectionMode}
                    onToggleSelection={() => {
                        if (selectionMode) exitSelectionMode();
                        else setSelectionMode(true);
                    }}
                    onShowDailyGuide={() => setShowDailyGuide(true)}
                    onShowGuide={() => setShowGuide(true)}
                    labels={{
                        select: t('bulk.select'),
                        exitSelect: t('bulk.exitSelect'),
                        dailyReview: t('dailyReview.title'),
                        weeklyReview: t('review.openGuide'),
                    }}
                />

            <ReviewFiltersBar
                filterStatus={filterStatus}
                statusOptions={statusOptions}
                statusCounts={statusCounts}
                onSelect={setFilterStatus}
                t={t}
            />

            {selectionMode && (
                <ReviewBulkActions
                    selectionCount={selectedIdsArray.length}
                    moveToStatus={moveToStatus}
                    onMoveToStatus={handleBatchMove}
                    onChangeMoveToStatus={setMoveToStatus}
                    onAddTag={handleBatchAddTag}
                    onDelete={handleBatchDelete}
                    statusOptions={bulkStatuses}
                    t={t}
                />
            )}

            <ReviewTaskList
                tasks={filteredTasks}
                projectMap={projectMap}
                selectionMode={selectionMode}
                multiSelectedIds={multiSelectedIds}
                onToggleSelect={toggleMultiSelect}
                t={t}
            />

            {showGuide && (
                <WeeklyReviewGuideModal onClose={() => setShowGuide(false)} />
            )}

            {showDailyGuide && (
                <DailyReviewGuideModal onClose={() => setShowDailyGuide(false)} />
            )}
        </div>
        <PromptModal
            isOpen={tagPromptOpen}
            title={t('bulk.addTag')}
            description={t('bulk.addTag')}
            placeholder="#tag"
            defaultValue=""
            confirmLabel={t('common.save')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setTagPromptOpen(false)}
            onConfirm={async (value) => {
                const input = value.trim();
                if (!input) return;
                const tag = input.startsWith('#') ? input : `#${input}`;
                await batchUpdateTasks(tagPromptIds.map((id) => {
                    const task = tasksById[id];
                    const existingTags = task?.tags || [];
                    const nextTags = Array.from(new Set([...existingTags, tag]));
                    return { id, updates: { tags: nextTags } };
                }));
                setTagPromptOpen(false);
                exitSelectionMode();
            }}
        />
        </ErrorBoundary>
    );
}
