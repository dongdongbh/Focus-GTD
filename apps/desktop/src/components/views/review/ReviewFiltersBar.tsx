import type { TaskStatus } from '@mindwtr/core';
import { cn } from '../../../lib/utils';

type ReviewFiltersBarProps = {
    filterStatus: TaskStatus | 'all';
    statusOptions: TaskStatus[];
    statusCounts: Record<string, number>;
    onSelect: (status: TaskStatus | 'all') => void;
    t: (key: string) => string;
};

export function ReviewFiltersBar({
    filterStatus,
    statusOptions,
    statusCounts,
    onSelect,
    t,
}: ReviewFiltersBarProps) {
    return (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
                onClick={() => onSelect('all')}
                className={cn(
                    "px-3 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap shrink-0",
                    filterStatus === 'all'
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
            >
                {t('common.all')} ({statusCounts.all})
            </button>
            {statusOptions.map((status) => (
                <button
                    key={status}
                    onClick={() => onSelect(status)}
                    className={cn(
                        "px-3 py-1.5 text-sm rounded-full border transition-colors whitespace-nowrap shrink-0",
                        filterStatus === status
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    )}
                >
                    {t(`status.${status}`)} ({statusCounts[status]})
                </button>
            ))}
        </div>
    );
}
