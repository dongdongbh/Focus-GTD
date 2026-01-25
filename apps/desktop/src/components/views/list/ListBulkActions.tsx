import type { TaskStatus } from '@mindwtr/core';

type ListBulkActionsProps = {
    selectionCount: number;
    onMoveToStatus: (status: TaskStatus) => void;
    onAddTag: () => void;
    onDelete: () => void;
    t: (key: string) => string;
};

const BULK_STATUS_OPTIONS: TaskStatus[] = ['inbox', 'next', 'waiting', 'someday', 'reference', 'done'];

export function ListBulkActions({
    selectionCount,
    onMoveToStatus,
    onAddTag,
    onDelete,
    t,
}: ListBulkActionsProps) {
    if (selectionCount === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
            <span className="text-sm text-muted-foreground">
                {selectionCount} {t('bulk.selected')}
            </span>
            <div className="flex items-center gap-2">
                {BULK_STATUS_OPTIONS.map((status) => (
                    <button
                        key={status}
                        onClick={() => onMoveToStatus(status)}
                        className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors"
                        aria-label={t(`status.${status}`)}
                    >
                        {t(`status.${status}`)}
                    </button>
                ))}
            </div>
            <button
                onClick={onAddTag}
                className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors"
                aria-label={t('bulk.addTag')}
            >
                {t('bulk.addTag')}
            </button>
            <button
                onClick={onDelete}
                className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                aria-label={t('bulk.delete')}
            >
                {t('bulk.delete')}
            </button>
        </div>
    );
}
