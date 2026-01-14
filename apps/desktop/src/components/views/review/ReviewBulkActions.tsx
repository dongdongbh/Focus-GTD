import type { TaskStatus } from '@mindwtr/core';

type ReviewBulkActionsProps = {
    selectionCount: number;
    moveToStatus: TaskStatus | '';
    onMoveToStatus: (status: TaskStatus) => Promise<void> | void;
    onChangeMoveToStatus: (status: TaskStatus) => void;
    onAddTag: () => void;
    onDelete: () => void;
    statusOptions: TaskStatus[];
    t: (key: string) => string;
};

export function ReviewBulkActions({
    selectionCount,
    moveToStatus,
    onMoveToStatus,
    onChangeMoveToStatus,
    onAddTag,
    onDelete,
    statusOptions,
    t,
}: ReviewBulkActionsProps) {
    if (selectionCount === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                    {selectionCount} {t('bulk.selected')}
                </span>
                <div className="flex items-center gap-2">
                    <label htmlFor="review-bulk-move" className="text-xs text-muted-foreground">
                        {t('bulk.moveTo')}
                    </label>
                    <select
                        id="review-bulk-move"
                        value={moveToStatus}
                        onChange={async (e) => {
                            const nextStatus = e.target.value as TaskStatus;
                            onChangeMoveToStatus(nextStatus);
                            await onMoveToStatus(nextStatus);
                        }}
                        className="text-xs bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="" disabled>
                            {t('bulk.moveTo')}
                        </option>
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {t(`status.${status}`)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={onAddTag}
                    className="text-xs px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors"
                >
                    {t('bulk.addTag')}
                </button>
                <button
                    onClick={onDelete}
                    className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                    {t('bulk.delete')}
                </button>
            </div>
        </div>
    );
}
