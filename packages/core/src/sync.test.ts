import { describe, it, expect } from 'vitest';
import { mergeAppData, mergeAppDataWithStats, filterDeleted, appendSyncHistory, performSyncCycle } from './sync';
import { AppData, Task, Project, Attachment, Section } from './types';

describe('Sync Logic', () => {
    const createMockTask = (id: string, updatedAt: string, deletedAt?: string): Task => ({
        id,
        title: `Task ${id}`,
        status: 'inbox',
        updatedAt,
        createdAt: '2023-01-01T00:00:00.000Z',
        tags: [],
        contexts: [],
        deletedAt
    });

    const createMockProject = (id: string, updatedAt: string, deletedAt?: string): Project => ({
        id,
        title: `Project ${id}`,
        status: 'active',
        color: '#000000',
        tagIds: [],
        updatedAt,
        createdAt: '2023-01-01T00:00:00.000Z',
        deletedAt
    });

    const createMockSection = (id: string, projectId: string, updatedAt: string, deletedAt?: string): Section => ({
        id,
        projectId,
        title: `Section ${id}`,
        description: '',
        order: 0,
        isCollapsed: false,
        updatedAt,
        createdAt: '2023-01-01T00:00:00.000Z',
        deletedAt
    });

    const mockAppData = (tasks: Task[] = [], projects: Project[] = [], sections: Section[] = []): AppData => ({
        tasks,
        projects,
        sections,
        areas: [],
        settings: {}
    });

    describe('mergeAppData', () => {
        it('should merge attachments across devices', () => {
            const localAttachment: Attachment = {
                id: 'att-local',
                kind: 'file',
                title: 'local.txt',
                uri: '/tmp/local.txt',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-02T00:00:00.000Z',
            };
            const incomingAttachment: Attachment = {
                id: 'att-incoming',
                kind: 'link',
                title: 'example',
                uri: 'https://example.com',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-02T00:00:00.000Z',
            };

            const localTask: Task = {
                ...createMockTask('1', '2023-01-02'),
                attachments: [localAttachment],
            };
            const incomingTask: Task = {
                ...createMockTask('1', '2023-01-03'), // incoming wins task conflict
                attachments: [incomingAttachment],
            };

            const merged = mergeAppData(mockAppData([localTask]), mockAppData([incomingTask]));

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].updatedAt).toBe('2023-01-03');
            expect((merged.tasks[0].attachments || []).map(a => a.id).sort()).toEqual(['att-incoming', 'att-local']);
        });

        it('should preserve local file uri when incoming wins', () => {
            const localAttachment: Attachment = {
                id: 'att-1',
                kind: 'file',
                title: 'doc.txt',
                uri: '/local/doc.txt',
                localStatus: 'available',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-02T00:00:00.000Z',
            };
            const incomingAttachment: Attachment = {
                id: 'att-1',
                kind: 'file',
                title: 'doc.txt',
                uri: '/incoming/doc.txt',
                cloudKey: 'attachments/att-1.txt',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-03T00:00:00.000Z',
            };

            const localTask: Task = {
                ...createMockTask('1', '2023-01-02'),
                attachments: [localAttachment],
            };
            const incomingTask: Task = {
                ...createMockTask('1', '2023-01-03'),
                attachments: [incomingAttachment],
            };

            const merged = mergeAppData(mockAppData([localTask]), mockAppData([incomingTask]));
            const attachment = merged.tasks[0].attachments?.find(a => a.id === 'att-1');

            expect(attachment?.uri).toBe('/local/doc.txt');
            expect(attachment?.localStatus).toBe('available');
            expect(attachment?.cloudKey).toBe('attachments/att-1.txt');
        });

        it('should retain local cloudKey when incoming lacks it', () => {
            const localAttachment: Attachment = {
                id: 'att-2',
                kind: 'file',
                title: 'note.txt',
                uri: '/local/note.txt',
                cloudKey: 'attachments/att-2.txt',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-02T00:00:00.000Z',
            };
            const incomingAttachment: Attachment = {
                id: 'att-2',
                kind: 'file',
                title: 'note.txt',
                uri: '',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-03T00:00:00.000Z',
            };

            const localTask: Task = {
                ...createMockTask('1', '2023-01-02'),
                attachments: [localAttachment],
            };
            const incomingTask: Task = {
                ...createMockTask('1', '2023-01-03'),
                attachments: [incomingAttachment],
            };

            const merged = mergeAppData(mockAppData([localTask]), mockAppData([incomingTask]));
            const attachment = merged.tasks[0].attachments?.find(a => a.id === 'att-2');

            expect(attachment?.cloudKey).toBe('attachments/att-2.txt');
        });

        it('should preserve attachment deletions using attachment timestamps', () => {
            const localAttachment: Attachment = {
                id: 'att-1',
                kind: 'file',
                title: 'local.txt',
                uri: '/tmp/local.txt',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-04T00:00:00.000Z',
                deletedAt: '2023-01-04T00:00:00.000Z',
            };
            const incomingAttachment: Attachment = {
                id: 'att-1',
                kind: 'file',
                title: 'local.txt',
                uri: '/tmp/local.txt',
                createdAt: '2023-01-01T00:00:00.000Z',
                updatedAt: '2023-01-02T00:00:00.000Z',
            };

            const localTask: Task = {
                ...createMockTask('1', '2023-01-03'),
                attachments: [localAttachment],
            };
            const incomingTask: Task = {
                ...createMockTask('1', '2023-01-03'),
                attachments: [incomingAttachment],
            };

            const merged = mergeAppData(mockAppData([localTask]), mockAppData([incomingTask]));
            const attachment = merged.tasks[0].attachments?.find(a => a.id === 'att-1');
            expect(attachment?.deletedAt).toBe('2023-01-04T00:00:00.000Z');
        });

        it('should merge unique items from both sources', () => {
            const local = mockAppData([createMockTask('1', '2023-01-01')]);
            const incoming = mockAppData([createMockTask('2', '2023-01-01')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(2);
            expect(merged.tasks.find(t => t.id === '1')).toBeDefined();
            expect(merged.tasks.find(t => t.id === '2')).toBeDefined();
        });

        it('should merge sections from both sources', () => {
            const local = mockAppData([], [], [createMockSection('s1', 'p1', '2023-01-01')]);
            const incoming = mockAppData([], [], [createMockSection('s2', 'p1', '2023-01-01')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.sections).toHaveLength(2);
            expect(merged.sections.find((s) => s.id === 's1')).toBeDefined();
            expect(merged.sections.find((s) => s.id === 's2')).toBeDefined();
        });

        it('should update section when incoming is newer', () => {
            const local = mockAppData([], [], [createMockSection('s1', 'p1', '2023-01-01')]);
            const incoming = mockAppData([], [], [createMockSection('s1', 'p1', '2023-01-02')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.sections).toHaveLength(1);
            expect(merged.sections[0].updatedAt).toBe('2023-01-02');
        });

        it('should preserve section deletion when incoming delete is newer', () => {
            const local = mockAppData([], [], [createMockSection('s1', 'p1', '2023-01-01')]);
            const incoming = mockAppData([], [], [createMockSection('s1', 'p1', '2023-01-02', '2023-01-02')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.sections).toHaveLength(1);
            expect(merged.sections[0].deletedAt).toBe('2023-01-02');
        });

        it('should update local item if incoming is newer', () => {
            const local = mockAppData([createMockTask('1', '2023-01-01')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-02')]); // Newer

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02');
        });

        it('should keep local item if local is newer', () => {
            const local = mockAppData([createMockTask('1', '2023-01-02')]); // Newer
            const incoming = mockAppData([createMockTask('1', '2023-01-01')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02');
        });

        it('should handle soft deletions correctly (incoming delete wins if newer)', () => {
            const local = mockAppData([createMockTask('1', '2023-01-01')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-02', '2023-01-02')]); // Deleted and Newer

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBe('2023-01-02');
        });

        it('should handle soft deletions correctly (local delete wins if newer)', () => {
            const local = mockAppData([createMockTask('1', '2023-01-02', '2023-01-02')]); // Deleted and Newer
            const incoming = mockAppData([createMockTask('1', '2023-01-01')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBe('2023-01-02');
        });

        it('prefers deletion when delete time is newer within skew threshold', () => {
            const local = mockAppData([createMockTask('1', '2023-01-02T00:00:00.000Z')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-02T00:04:00.000Z', '2023-01-02T00:04:00.000Z')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBe('2023-01-02T00:04:00.000Z');
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02T00:04:00.000Z');
        });

        it('uses strict last operation time for delete-vs-live conflicts', () => {
            const local = mockAppData([createMockTask('1', '2023-01-02T00:00:00.000Z', '2023-01-02T00:00:00.000Z')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-02T00:03:00.000Z')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBeUndefined();
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02T00:03:00.000Z');
        });

        it('uses strict last operation time for delete-vs-live conflicts with revisions', () => {
            const localTask = {
                ...createMockTask('1', '2023-01-02T00:00:00.000Z', '2023-01-02T00:00:00.000Z'),
                rev: 10,
                revBy: 'device-a',
            } satisfies Task;
            const incomingTask = {
                ...createMockTask('1', '2023-01-02T00:03:00.000Z'),
                rev: 9,
                revBy: 'device-b',
            } satisfies Task;
            const local = mockAppData([localTask]);
            const incoming = mockAppData([incomingTask]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBeUndefined();
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02T00:03:00.000Z');
        });

        it('prefers newer item when timestamps are within skew threshold', () => {
            const local = mockAppData([createMockTask('1', '2023-01-02T00:00:00.000Z')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-02T00:04:00.000Z')]);

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02T00:04:00.000Z');
        });

        it('should revive item if update is newer than deletion', () => {
            // This case implies "undo delete" or "re-edit" happened after delete on another device
            const local = mockAppData([createMockTask('1', '2023-01-01', '2023-01-01')]); // Deleted
            const incoming = mockAppData([createMockTask('1', '2023-01-02')]); // Undone/Edited later

            const merged = mergeAppData(local, incoming);

            expect(merged.tasks).toHaveLength(1);
            expect(merged.tasks[0].deletedAt).toBeUndefined();
            expect(merged.tasks[0].updatedAt).toBe('2023-01-02');
        });

        it('should preserve local settings regardless of incoming settings', () => {
            const local: AppData = { ...mockAppData(), settings: { theme: 'dark' } };
            const incoming: AppData = { ...mockAppData(), settings: { theme: 'light' } };

            const merged = mergeAppData(local, incoming);

            expect(merged.settings.theme).toBe('dark');
        });
    });

    describe('mergeAppDataWithStats', () => {
        it('should report conflicts and resolution counts', () => {
            const local = mockAppData([
                createMockTask('1', '2023-01-02'),
                createMockTask('2', '2023-01-01'),
            ]);
            const incoming = mockAppData([
                createMockTask('1', '2023-01-01'), // older -> local wins conflict
                createMockTask('3', '2023-01-01'), // incoming only
            ]);

            const result = mergeAppDataWithStats(local, incoming);

            expect(result.data.tasks).toHaveLength(3);
            expect(result.stats.tasks.localOnly).toBe(1);
            expect(result.stats.tasks.incomingOnly).toBe(1);
            expect(result.stats.tasks.conflicts).toBe(1);
            expect(result.stats.tasks.resolvedUsingLocal).toBeGreaterThan(0);
        });
    });

    describe('performSyncCycle', () => {
        it('returns conflict status when merge finds conflicts', async () => {
            const local = mockAppData([createMockTask('1', '2023-01-02')]);
            const incoming = mockAppData([createMockTask('1', '2023-01-01')]);

            const result = await performSyncCycle({
                readLocal: async () => local,
                readRemote: async () => incoming,
                writeLocal: async () => undefined,
                writeRemote: async () => undefined,
            });

            expect(result.status).toBe('conflict');
            expect(result.stats.tasks.conflicts).toBe(1);
        });

        it('fails before writes when merged data is invalid', async () => {
            let wroteLocal = false;
            let wroteRemote = false;
            const invalidIncoming: AppData = {
                tasks: [],
                projects: [
                    {
                        // Missing id on purpose to simulate corrupted remote payload.
                        title: 'Broken',
                        status: 'active',
                        color: '#000000',
                        order: 0,
                        tagIds: [],
                        createdAt: '2024-01-01T00:00:00.000Z',
                        updatedAt: '2024-01-01T00:00:00.000Z',
                    } as unknown as Project,
                ],
                sections: [],
                areas: [],
                settings: {},
            };

            await expect(performSyncCycle({
                readLocal: async () => mockAppData(),
                readRemote: async () => invalidIncoming,
                writeLocal: async () => {
                    wroteLocal = true;
                },
                writeRemote: async () => {
                    wroteRemote = true;
                },
            })).rejects.toThrow('Sync validation failed');
            expect(wroteLocal).toBe(false);
            expect(wroteRemote).toBe(false);
        });

        it('purges expired task tombstones and deleted attachment tombstones by default', async () => {
            let saved: AppData | null = null;
            const oldPurgedTask = {
                ...createMockTask('old-purged', '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'),
                purgedAt: '2025-06-01T00:00:00.000Z',
            } as Task;
            const oldDeletedTask = createMockTask('old-deleted', '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z');
            const taskWithDeletedAttachment = {
                ...createMockTask('with-deleted-attachment', '2025-12-20T00:00:00.000Z'),
                attachments: [{
                    id: 'att-old-deleted',
                    kind: 'file',
                    title: 'old.txt',
                    uri: '/tmp/old.txt',
                    createdAt: '2025-01-01T00:00:00.000Z',
                    updatedAt: '2025-01-01T00:00:00.000Z',
                    deletedAt: '2025-01-01T00:00:00.000Z',
                }],
            } as Task;

            await performSyncCycle({
                readLocal: async () => mockAppData([oldPurgedTask, oldDeletedTask, taskWithDeletedAttachment]),
                readRemote: async () => null,
                writeLocal: async (data) => {
                    saved = data;
                },
                writeRemote: async () => undefined,
                now: () => '2026-01-01T00:00:00.000Z',
            });

            expect(saved).not.toBeNull();
            expect(saved!.tasks.some((task) => task.id === 'old-purged')).toBe(false);
            expect(saved!.tasks.some((task) => task.id === 'old-deleted')).toBe(true);
            const keptTask = saved!.tasks.find((task) => task.id === 'with-deleted-attachment');
            expect(keptTask).toBeTruthy();
            expect(keptTask!.attachments).toBeUndefined();
        });

        it('respects custom tombstone retention window', async () => {
            let saved: AppData | null = null;
            const oldPurgedTask = {
                ...createMockTask('old-purged', '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'),
                purgedAt: '2025-06-01T00:00:00.000Z',
            } as Task;

            await performSyncCycle({
                readLocal: async () => mockAppData([oldPurgedTask]),
                readRemote: async () => null,
                writeLocal: async (data) => {
                    saved = data;
                },
                writeRemote: async () => undefined,
                now: () => '2026-01-01T00:00:00.000Z',
                tombstoneRetentionDays: 220,
            });

            expect(saved).not.toBeNull();
            expect(saved!.tasks.some((task) => task.id === 'old-purged')).toBe(true);
        });
    });

    describe('appendSyncHistory', () => {
        it('drops invalid entries and respects limits', () => {
            const entry = {
                at: '2024-01-01T00:00:00.000Z',
                status: 'success',
                conflicts: 0,
                conflictIds: [],
                maxClockSkewMs: 0,
                timestampAdjustments: 0,
            } as const;
            const settings: AppData['settings'] = {
                lastSyncHistory: [
                    entry,
                    { invalid: true } as any,
                ],
            };

            const next = appendSyncHistory(settings, {
                ...entry,
                at: '2024-01-02T00:00:00.000Z',
            }, 2);

            expect(next).toHaveLength(2);
            expect(next[0].at).toBe('2024-01-02T00:00:00.000Z');
            expect(next[1].at).toBe('2024-01-01T00:00:00.000Z');
        });
    });

    describe('filterDeleted', () => {
        it('should filter out items with deletedAt set', () => {
            const tasks = [
                createMockTask('1', '2023-01-01'),
                createMockTask('2', '2023-01-01', '2023-01-01')
            ];

            const filtered = filterDeleted(tasks);

            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe('1');
        });
    });
});
