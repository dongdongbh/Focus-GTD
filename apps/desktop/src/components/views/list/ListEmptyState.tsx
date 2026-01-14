type EmptyState = {
    title: string;
    body: string;
    action: string;
};

type ListEmptyStateProps = {
    hasFilters: boolean;
    emptyState: EmptyState;
    onAddTask: () => void;
    t: (key: string) => string;
};

export function ListEmptyState({ hasFilters, emptyState, onAddTask, t }: ListEmptyStateProps) {
    return (
        <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-3">
            {hasFilters ? (
                <p>{t('filters.noMatch')}</p>
            ) : (
                <>
                    <div className="text-base font-medium text-foreground">{emptyState.title}</div>
                    <p className="text-sm text-muted-foreground">{emptyState.body}</p>
                    <button
                        type="button"
                        onClick={onAddTask}
                        className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        {emptyState.action}
                    </button>
                </>
            )}
        </div>
    );
}
