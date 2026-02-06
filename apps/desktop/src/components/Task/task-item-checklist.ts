import { generateUUID, type Task } from '@mindwtr/core';

const normalizeChecklistKey = (value: string): string => value.trim().toLowerCase();

export const mergeMarkdownChecklist = (
    markdownItems: { title: string; isCompleted: boolean }[],
    checklist: Task['checklist'],
): Task['checklist'] => {
    const current = checklist || [];
    const remainingByTitle = new Map<string, { id: string; title: string; isCompleted: boolean }[]>();
    for (const item of current) {
        if (!item?.title) continue;
        const key = normalizeChecklistKey(item.title);
        const bucket = remainingByTitle.get(key);
        if (bucket) {
            bucket.push(item);
        } else {
            remainingByTitle.set(key, [item]);
        }
    }

    const usedIds = new Set<string>();
    const merged: NonNullable<Task['checklist']> = [];
    for (const item of markdownItems) {
        const key = normalizeChecklistKey(item.title);
        const bucket = remainingByTitle.get(key) || [];
        const reusable = bucket.find((entry) => !usedIds.has(entry.id));
        if (reusable) {
            usedIds.add(reusable.id);
        }
        merged.push({
            id: reusable?.id ?? generateUUID(),
            title: item.title,
            isCompleted: item.isCompleted,
        });
    }

    for (const item of current) {
        if (!item?.id || usedIds.has(item.id)) continue;
        merged.push(item);
    }

    return merged;
};
