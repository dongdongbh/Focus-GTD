import { Archive as ArchiveIcon, ListOrdered, RotateCcw, Trash2 } from 'lucide-react';
import type { Project } from '@mindwtr/core';
import { cn } from '../../../lib/utils';

type ProjectProgress = {
    total: number;
    doneCount: number;
    remainingCount: number;
};

type ProjectDetailsHeaderProps = {
    project: Project;
    projectColor: string;
    editTitle: string;
    onEditTitleChange: (value: string) => void;
    onCommitTitle: () => void;
    onResetTitle: () => void;
    onToggleSequential: () => void;
    onChangeStatus: (status: Project['status']) => void;
    onArchive: () => Promise<void> | void;
    onReactivate: () => void;
    onDelete: () => Promise<void> | void;
    projectProgress?: ProjectProgress | null;
    t: (key: string) => string;
};

export function ProjectDetailsHeader({
    project,
    projectColor,
    editTitle,
    onEditTitleChange,
    onCommitTitle,
    onResetTitle,
    onToggleSequential,
    onChangeStatus,
    onArchive,
    onReactivate,
    onDelete,
    projectProgress,
    t,
}: ProjectDetailsHeaderProps) {
    return (
        <header className="mb-6 space-y-3">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span
                        className="w-3 h-3 rounded-full border border-border"
                        style={{ backgroundColor: projectColor }}
                        aria-hidden="true"
                    />
                    <div className="flex flex-col min-w-0">
                        <input
                            value={editTitle}
                            onChange={(e) => onEditTitleChange(e.target.value)}
                            onBlur={onCommitTitle}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    (e.currentTarget as HTMLInputElement).blur();
                                } else if (e.key === 'Escape') {
                                    onResetTitle();
                                    (e.currentTarget as HTMLInputElement).blur();
                                }
                            }}
                            className="text-2xl font-bold truncate bg-transparent border-b border-transparent focus:border-border focus:outline-none w-full"
                            aria-label={t('projects.title')}
                        />
                        {project.tagIds && project.tagIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                                {project.tagIds.map((tag) => (
                                    <span
                                        key={tag}
                                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        {projectProgress && projectProgress.total > 0 && (
                            <div className="text-xs text-muted-foreground">
                                {t('status.done')}: {projectProgress.doneCount} / {projectProgress.remainingCount} {t('process.remaining')}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {project.status === 'archived' ? (
                        <button
                            type="button"
                            onClick={onReactivate}
                            className="flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                        >
                            <RotateCcw className="w-4 h-4" />
                            {t('projects.reactivate')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onArchive}
                            className="flex items-center gap-1 px-3 h-8 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground transition-colors whitespace-nowrap"
                        >
                            <ArchiveIcon className="w-4 h-4" />
                            {t('projects.archive')}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onDelete}
                        className="text-destructive hover:bg-destructive/10 h-8 w-8 rounded-md transition-colors flex items-center justify-center"
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={onToggleSequential}
                        className={cn(
                            "flex items-center gap-2 px-3 h-8 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                            project.isSequential
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        )}
                        title={project.isSequential ? t('projects.sequentialTooltip') : t('projects.parallelTooltip')}
                        aria-label={project.isSequential ? t('projects.sequential') : t('projects.parallel')}
                    >
                        <ListOrdered className="w-4 h-4" />
                        {project.isSequential ? t('projects.sequential') : t('projects.parallel')}
                    </button>
                    <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {t('projects.statusLabel')}
                        </span>
                        <select
                            value={project.status}
                            onChange={(e) => onChangeStatus(e.target.value as Project['status'])}
                            className="h-8 text-xs bg-muted/50 border border-border rounded px-2 text-foreground"
                            disabled={project.status === 'archived'}
                        >
                            <option value="active">{t('status.active')}</option>
                            <option value="waiting">{t('status.waiting')}</option>
                            <option value="someday">{t('status.someday')}</option>
                        </select>
                    </div>
                </div>
            </div>
        </header>
    );
}
