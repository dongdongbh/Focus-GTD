import type { FormEvent, RefObject } from 'react';
import type { Area, Project } from '@mindwtr/core';
import { Mic, Plus } from 'lucide-react';
import { TaskInput } from '../../Task/TaskInput';

type ListQuickAddProps = {
    t: (key: string) => string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: FormEvent) => void;
    onOpenAudio: () => void;
    onCreateProject: (title: string) => Promise<string | null>;
    inputRef: RefObject<HTMLInputElement | null>;
    projects: Project[];
    areas: Area[];
    contexts: string[];
    onResetCopilot: () => void;
};

export function ListQuickAdd({
    t,
    value,
    onChange,
    onSubmit,
    onOpenAudio,
    onCreateProject,
    inputRef,
    projects,
    areas,
    contexts,
    onResetCopilot,
}: ListQuickAddProps) {
    return (
        <form onSubmit={onSubmit} className="relative">
            <TaskInput
                inputRef={inputRef}
                value={value}
                projects={projects}
                contexts={contexts}
                areas={areas}
                onCreateProject={onCreateProject}
                onChange={(next) => {
                    onChange(next);
                    onResetCopilot();
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        inputRef.current?.blur();
                    }
                }}
                placeholder={`${t('nav.addTask')}... ${t('quickAdd.example')}`}
                className="w-full bg-card border border-border rounded-lg py-3 pl-4 pr-20 shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onOpenAudio}
                    className="p-1.5 bg-muted/60 text-muted-foreground rounded-md hover:bg-muted transition-colors"
                    aria-label={t('quickAdd.audioCaptureLabel')}
                >
                    <Mic className="w-4 h-4" />
                </button>
                <button
                    type="submit"
                    disabled={!value.trim()}
                    className="p-1.5 bg-primary text-primary-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                    aria-label={t('common.add')}
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>
        </form>
    );
}
