import { describe, expect, it } from 'vitest';
import { findOrphanedAttachments, removeOrphanedAttachmentsFromData } from './attachment-cleanup';
import type { AppData } from './types';

const buildData = (): AppData => ({
    tasks: [],
    projects: [],
    areas: [],
    settings: {},
});

describe('findOrphanedAttachments', () => {
    it('detects deleted attachments', () => {
        const data = buildData();
        data.tasks.push({
            id: 't1',
            title: 'Task',
            status: 'inbox',
            contexts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: [
                {
                    id: 'a1',
                    kind: 'file',
                    title: 'file',
                    uri: '/tmp/file',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: new Date().toISOString(),
                },
            ],
        });

        const orphaned = findOrphanedAttachments(data);
        expect(orphaned.map((a) => a.id)).toEqual(['a1']);
    });

    it('detects attachments on deleted tasks', () => {
        const data = buildData();
        data.tasks.push({
            id: 't1',
            title: 'Task',
            status: 'done',
            contexts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: new Date().toISOString(),
            attachments: [
                {
                    id: 'a1',
                    kind: 'file',
                    title: 'file',
                    uri: '/tmp/file',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ],
        });

        const orphaned = findOrphanedAttachments(data);
        expect(orphaned.map((a) => a.id)).toEqual(['a1']);
    });

    it('keeps attachments referenced by active tasks', () => {
        const data = buildData();
        data.tasks.push({
            id: 't1',
            title: 'Task',
            status: 'inbox',
            contexts: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: [
                {
                    id: 'a1',
                    kind: 'file',
                    title: 'file',
                    uri: '/tmp/file',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ],
        });

        const orphaned = findOrphanedAttachments(data);
        expect(orphaned).toHaveLength(0);
    });
});

describe('removeOrphanedAttachmentsFromData', () => {
    it('removes orphaned attachments from tasks and projects', () => {
        const data: AppData = {
            tasks: [
                {
                    id: 't1',
                    title: 'Task',
                    status: 'done',
                    contexts: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: new Date().toISOString(),
                    attachments: [
                        {
                            id: 'a1',
                            kind: 'file',
                            title: 'file',
                            uri: '/tmp/file',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                },
            ],
            projects: [
                {
                    id: 'p1',
                    title: 'Project',
                    status: 'active',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    attachments: [
                        {
                            id: 'a2',
                            kind: 'file',
                            title: 'file2',
                            uri: '/tmp/file2',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            deletedAt: new Date().toISOString(),
                        },
                    ],
                },
            ],
            areas: [],
            settings: {},
        };

        const cleaned = removeOrphanedAttachmentsFromData(data);
        expect(cleaned.tasks[0].attachments).toHaveLength(0);
        expect(cleaned.projects[0].attachments).toHaveLength(0);
    });
});
