import type { AppData, Attachment } from './types';

export interface CleanupResult {
    orphanedCount: number;
    cleanedIds: string[];
    errors: Array<{ id: string; error: string }>;
}

export function findOrphanedAttachments(appData: AppData): Attachment[] {
    const allAttachments = new Map<string, Attachment>();
    const activeReferenceIds = new Set<string>();

    for (const task of appData.tasks) {
        const taskDeleted = Boolean(task.deletedAt);
        for (const attachment of task.attachments || []) {
            allAttachments.set(attachment.id, attachment);
            if (!taskDeleted && !attachment.deletedAt) {
                activeReferenceIds.add(attachment.id);
            }
        }
    }

    for (const project of appData.projects) {
        const projectDeleted = Boolean(project.deletedAt);
        for (const attachment of project.attachments || []) {
            allAttachments.set(attachment.id, attachment);
            if (!projectDeleted && !attachment.deletedAt) {
                activeReferenceIds.add(attachment.id);
            }
        }
    }

    return Array.from(allAttachments.values()).filter(
        (attachment) => attachment.deletedAt || !activeReferenceIds.has(attachment.id)
    );
}

export function removeOrphanedAttachmentsFromData(appData: AppData): AppData {
    const orphanedIds = new Set(findOrphanedAttachments(appData).map((attachment) => attachment.id));

    if (orphanedIds.size === 0) return appData;

    return {
        ...appData,
        tasks: appData.tasks.map((task) => ({
            ...task,
            attachments: task.attachments?.filter((attachment) => !orphanedIds.has(attachment.id)),
        })),
        projects: appData.projects.map((project) => ({
            ...project,
            attachments: project.attachments?.filter((attachment) => !orphanedIds.has(attachment.id)),
        })),
    };
}
