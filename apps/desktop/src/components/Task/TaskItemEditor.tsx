import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { hasTimeComponent, safeFormatDate, safeParseDate, resolveTextDirection, type Area, type ClarifyResponse, type Project, type Section, type TaskEditorFieldId, type TextDirection, type TimeEstimate } from '@mindwtr/core';
import { AreaSelector } from '../ui/AreaSelector';
import { ProjectSelector } from '../ui/ProjectSelector';
import { SectionSelector } from '../ui/SectionSelector';
import { TaskInput } from './TaskInput';

interface TaskItemEditorProps {
    t: (key: string) => string;
    editTitle: string;
    setEditTitle: (value: string) => void;
    resetCopilotDraft: () => void;
    aiEnabled: boolean;
    isAIWorking: boolean;
    handleAIClarify: () => void;
    handleAIBreakdown: () => void;
    copilotSuggestion: { context?: string; timeEstimate?: TimeEstimate; tags?: string[] } | null;
    copilotApplied: boolean;
    applyCopilotSuggestion: () => void;
    copilotContext?: string;
    copilotEstimate?: TimeEstimate;
    copilotTags: string[];
    timeEstimatesEnabled: boolean;
    aiError: string | null;
    aiBreakdownSteps: string[] | null;
    onAddBreakdownSteps: () => void;
    onDismissBreakdown: () => void;
    aiClarifyResponse: ClarifyResponse | null;
    onSelectClarifyOption: (action: string) => void;
    onApplyAISuggestion: () => void;
    onDismissClarify: () => void;
    projects: Project[];
    sections: Section[];
    areas: Area[];
    editProjectId: string;
    setEditProjectId: (value: string) => void;
    editSectionId: string;
    setEditSectionId: (value: string) => void;
    editAreaId: string;
    setEditAreaId: (value: string) => void;
    onCreateProject: (title: string) => Promise<string | null>;
    onCreateArea?: (name: string) => Promise<string | null>;
    onCreateSection?: (title: string) => Promise<string | null>;
    showProjectField: boolean;
    showAreaField: boolean;
    showSectionField: boolean;
    showDueDate: boolean;
    editDueDate: string;
    setEditDueDate: (value: string) => void;
    alwaysFields: TaskEditorFieldId[];
    schedulingFields: TaskEditorFieldId[];
    organizationFields: TaskEditorFieldId[];
    detailsFields: TaskEditorFieldId[];
    sectionCounts: {
        scheduling: number;
        organization: number;
        details: number;
    };
    renderField: (fieldId: TaskEditorFieldId) => ReactNode;
    editLocation: string;
    setEditLocation: (value: string) => void;
    editTextDirection: TextDirection | undefined;
    inputContexts: string[];
    onDuplicateTask: () => void;
    onCancel: () => void;
    onSubmit: (e: FormEvent) => void;
}

export function TaskItemEditor({
    t,
    editTitle,
    setEditTitle,
    resetCopilotDraft,
    aiEnabled,
    isAIWorking,
    handleAIClarify,
    handleAIBreakdown,
    copilotSuggestion,
    copilotApplied,
    applyCopilotSuggestion,
    copilotContext,
    copilotEstimate,
    copilotTags,
    timeEstimatesEnabled,
    aiError,
    aiBreakdownSteps,
    onAddBreakdownSteps,
    onDismissBreakdown,
    aiClarifyResponse,
    onSelectClarifyOption,
    onApplyAISuggestion,
    onDismissClarify,
    projects,
    sections,
    areas,
    editProjectId,
    setEditProjectId,
    editSectionId,
    setEditSectionId,
    editAreaId,
    setEditAreaId,
    onCreateProject,
    onCreateArea,
    onCreateSection,
    showProjectField,
    showAreaField,
    showSectionField,
    showDueDate,
    editDueDate,
    setEditDueDate,
    alwaysFields,
    schedulingFields,
    organizationFields,
    detailsFields,
    sectionCounts,
    renderField,
    editLocation,
    setEditLocation,
    editTextDirection,
    inputContexts,
    onDuplicateTask,
    onCancel,
    onSubmit,
}: TaskItemEditorProps) {
    const dueHasTime = hasTimeComponent(editDueDate);
    const dueParsed = editDueDate ? safeParseDate(editDueDate) : null;
    const dueDateValue = dueParsed ? safeFormatDate(dueParsed, 'yyyy-MM-dd') : '';
    const dueTimeValue = dueHasTime && dueParsed ? safeFormatDate(dueParsed, 'HH:mm') : '';
    const titleDirection = resolveTextDirection(editTitle, editTextDirection);

    const handleDueDateChange = (value: string) => {
        if (!value) {
            setEditDueDate('');
            return;
        }
        if (dueHasTime && dueTimeValue) {
            setEditDueDate(`${value}T${dueTimeValue}`);
            return;
        }
        setEditDueDate(value);
    };

    const handleDueTimeChange = (value: string) => {
        if (!value) {
            if (dueDateValue) setEditDueDate(dueDateValue);
            else setEditDueDate('');
            return;
        }
        const datePart = dueDateValue || safeFormatDate(new Date(), 'yyyy-MM-dd');
        setEditDueDate(`${datePart}T${value}`);
    };

    const sortedAreas = [...areas].sort((a, b) => {
        const aOrder = Number.isFinite(a.order) ? a.order : 0;
        const bOrder = Number.isFinite(b.order) ? b.order : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
    });
    const [schedulingOpen, setSchedulingOpen] = useState(sectionCounts.scheduling > 0);
    const [organizationOpen, setOrganizationOpen] = useState(sectionCounts.organization > 0);
    const [detailsOpen, setDetailsOpen] = useState(
        sectionCounts.details > 0 || detailsFields.includes('description') || detailsFields.includes('checklist')
    );
    const [aiMenuOpen, setAiMenuOpen] = useState(false);
    const aiMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!aiMenuOpen) return;
        const handleClick = (event: MouseEvent) => {
            if (!aiMenuRef.current) return;
            if (aiMenuRef.current.contains(event.target as Node)) return;
            setAiMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [aiMenuOpen]);
    return (
        <form
            onSubmit={onSubmit}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    onCancel();
                    return;
                }
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    const form = event.currentTarget as HTMLFormElement;
                    if (typeof form.requestSubmit === 'function') {
                        form.requestSubmit();
                    } else {
                        onSubmit(event as unknown as FormEvent);
                    }
                }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col gap-3 max-h-[80vh]"
        >
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                <div className="flex items-start gap-2">
                    <TaskInput
                        autoFocus
                        value={editTitle}
                        onChange={(value) => {
                            setEditTitle(value);
                            resetCopilotDraft();
                        }}
                        projects={projects}
                        contexts={inputContexts}
                        areas={areas}
                        onCreateProject={onCreateProject}
                        placeholder={t('taskEdit.titleLabel')}
                        className="w-full bg-transparent border-b border-primary/50 p-1 text-base font-medium focus:ring-0 focus:border-primary outline-none"
                        containerClassName="flex-1 min-w-0"
                        dir={titleDirection}
                    />
                    {aiEnabled && (
                        <div className="relative" ref={aiMenuRef}>
                            <button
                                type="button"
                                onClick={() => setAiMenuOpen((prev) => !prev)}
                                aria-label={t('taskEdit.aiAssistant') || 'AI assistant'}
                                aria-expanded={aiMenuOpen}
                                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                <Sparkles className="w-4 h-4" />
                            </button>
                            {aiMenuOpen && (
                                <div className="absolute right-0 mt-2 w-44 rounded-md border border-border bg-card shadow-lg overflow-hidden z-10">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAiMenuOpen(false);
                                            handleAIClarify();
                                        }}
                                        disabled={isAIWorking}
                                        aria-busy={isAIWorking}
                                        className="w-full text-left text-xs px-3 py-2 hover:bg-muted/60 transition-colors disabled:opacity-60 flex items-center gap-2"
                                    >
                                        {isAIWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {t('taskEdit.aiClarify')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setAiMenuOpen(false);
                                            handleAIBreakdown();
                                        }}
                                        disabled={isAIWorking}
                                        aria-busy={isAIWorking}
                                        className="w-full text-left text-xs px-3 py-2 hover:bg-muted/60 transition-colors disabled:opacity-60 flex items-center gap-2"
                                    >
                                        {isAIWorking && <Loader2 className="w-3 h-3 animate-spin" />}
                                        {t('taskEdit.aiBreakdown')}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            {aiEnabled && copilotSuggestion && !copilotApplied && (
                <button
                    type="button"
                    onClick={applyCopilotSuggestion}
                    className="text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground hover:bg-muted/60 transition-colors text-left"
                >
                    ✨ {t('copilot.suggested')}{' '}
                    {copilotSuggestion.context ? `${copilotSuggestion.context} ` : ''}
                    {timeEstimatesEnabled && copilotSuggestion.timeEstimate ? `${copilotSuggestion.timeEstimate}` : ''}
                    {copilotSuggestion.tags?.length ? copilotSuggestion.tags.join(' ') : ''}
                    <span className="ml-2 text-muted-foreground/70">{t('copilot.applyHint')}</span>
                </button>
            )}
            {aiEnabled && copilotApplied && (
                <div className="text-xs px-2 py-1 rounded bg-muted/30 border border-border text-muted-foreground">
                    ✅ {t('copilot.applied')}{' '}
                    {copilotContext ? `${copilotContext} ` : ''}
                    {timeEstimatesEnabled && copilotEstimate ? `${copilotEstimate}` : ''}
                    {copilotTags.length ? copilotTags.join(' ') : ''}
                </div>
            )}
            {aiEnabled && aiError && (
                <div className="text-xs text-muted-foreground border border-border rounded-md p-2 bg-muted/20 break-words whitespace-pre-wrap">
                    {aiError}
                </div>
            )}
            {aiEnabled && aiBreakdownSteps && (
                <div className="border border-border rounded-md p-2 space-y-2 text-xs">
                    <div className="text-muted-foreground">{t('ai.breakdownTitle')}</div>
                    <div className="space-y-1">
                        {aiBreakdownSteps.map((step, index) => (
                            <div key={`${step}-${index}`} className="text-foreground">
                                {index + 1}. {step}
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onAddBreakdownSteps}
                            className="px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                            {t('ai.addSteps')}
                        </button>
                        <button
                            type="button"
                            onClick={onDismissBreakdown}
                            className="px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}
            {aiEnabled && aiClarifyResponse && (
                <div className="border border-border rounded-md p-2 space-y-2 text-xs">
                    <div className="text-muted-foreground">{aiClarifyResponse.question}</div>
                    <div className="flex flex-wrap gap-2">
                        {aiClarifyResponse.options.map((option) => (
                            <button
                                key={option.label}
                                type="button"
                                onClick={() => onSelectClarifyOption(option.action)}
                                className="px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors"
                            >
                                {option.label}
                            </button>
                        ))}
                        {aiClarifyResponse.suggestedAction?.title && (
                            <button
                                type="button"
                                onClick={onApplyAISuggestion}
                                className="px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                                {t('ai.applySuggestion')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onDismissClarify}
                            className="px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-4">
                {showProjectField && (
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <label className="text-xs text-muted-foreground font-medium">{t('projects.title')}</label>
                        <ProjectSelector
                            projects={projects}
                            value={editProjectId}
                            onChange={setEditProjectId}
                            onCreateProject={onCreateProject}
                            placeholder={t('taskEdit.noProjectOption')}
                            noProjectLabel={t('taskEdit.noProjectOption')}
                            className="w-full"
                        />
                    </div>
                )}
                {showSectionField && (
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <label className="text-xs text-muted-foreground font-medium">{t('taskEdit.sectionLabel')}</label>
                        <SectionSelector
                            sections={sections}
                            value={editSectionId}
                            onChange={setEditSectionId}
                            onCreateSection={onCreateSection}
                            placeholder={t('taskEdit.noSectionOption')}
                            noSectionLabel={t('taskEdit.noSectionOption')}
                            className="w-full"
                        />
                    </div>
                )}
                {showAreaField && (
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <label className="text-xs text-muted-foreground font-medium">{t('taskEdit.areaLabel')}</label>
                        <AreaSelector
                            areas={sortedAreas}
                            value={editAreaId}
                            onChange={setEditAreaId}
                            onCreateArea={onCreateArea}
                            placeholder={t('taskEdit.noAreaOption')}
                            noAreaLabel={t('taskEdit.noAreaOption')}
                            className="w-full"
                        />
                    </div>
                )}
                {showDueDate && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">{t('taskEdit.dueDateLabel')}</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                aria-label={t('task.aria.dueDate')}
                                value={dueDateValue}
                                onChange={(e) => handleDueDateChange(e.target.value)}
                                className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                            />
                            <input
                                type="time"
                                aria-label={t('task.aria.dueTime')}
                                value={dueTimeValue}
                                onChange={(e) => handleDueTimeChange(e.target.value)}
                                className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground"
                            />
                        </div>
                    </div>
                )}
            </div>
            {alwaysFields.length > 0 && (
                <div className="space-y-3">
                    {alwaysFields.map((fieldId) => (
                        <div key={fieldId}>{renderField(fieldId)}</div>
                    ))}
                </div>
            )}
            <div className="space-y-3">
                <div className="border-t border-border pt-3">
                    <button
                        type="button"
                        onClick={() => setSchedulingOpen((prev) => !prev)}
                        className="w-full flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                        aria-expanded={schedulingOpen}
                    >
                        <span className="flex items-center gap-2">
                            {t('taskEdit.scheduling')}
                            {sectionCounts.scheduling > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {sectionCounts.scheduling}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px]">{schedulingOpen ? '▾' : '▸'}</span>
                    </button>
                    {schedulingOpen && (
                        <div className="mt-3 space-y-3">
                            {schedulingFields.length === 0 ? (
                                <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                    {t('taskEdit.schedulingEmpty')}
                                </div>
                            ) : (
                                schedulingFields.map((fieldId) => (
                                    <div key={fieldId}>{renderField(fieldId)}</div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="border-t border-border pt-3">
                    <button
                        type="button"
                        onClick={() => setOrganizationOpen((prev) => !prev)}
                        className="w-full flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                        aria-expanded={organizationOpen}
                    >
                        <span className="flex items-center gap-2">
                            {t('taskEdit.organization')}
                            {sectionCounts.organization > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {sectionCounts.organization}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px]">{organizationOpen ? '▾' : '▸'}</span>
                    </button>
                    {organizationOpen && (
                        <div className="mt-3 space-y-3">
                            {organizationFields.length === 0 ? (
                                <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                    {t('taskEdit.organizationEmpty')}
                                </div>
                            ) : (
                                organizationFields.map((fieldId) => (
                                    <div key={fieldId}>{renderField(fieldId)}</div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="border-t border-border pt-3">
                    <button
                        type="button"
                        onClick={() => setDetailsOpen((prev) => !prev)}
                        className="w-full flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground font-semibold"
                        aria-expanded={detailsOpen}
                    >
                        <span className="flex items-center gap-2">
                            {t('taskEdit.details')}
                            {sectionCounts.details > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                    {sectionCounts.details}
                                </span>
                            )}
                        </span>
                        <span className="text-[10px]">{detailsOpen ? '▾' : '▸'}</span>
                    </button>
                    {detailsOpen && (
                        <div className="mt-3 space-y-3">
                            {detailsFields.length === 0 ? (
                                <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                                    {t('taskEdit.detailsEmpty')}
                                </div>
                            ) : (
                                detailsFields.map((fieldId) => (
                                    <div key={fieldId}>{renderField(fieldId)}</div>
                                ))
                            )}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-muted-foreground font-medium">{t('taskEdit.locationLabel')}</label>
                                <input
                                    type="text"
                                    aria-label={t('task.aria.location')}
                                    value={editLocation}
                                    onChange={(e) => setEditLocation(e.target.value)}
                                    placeholder={t('taskEdit.locationPlaceholder')}
                                    className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground placeholder:text-muted-foreground"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            </div>
            <div className="flex gap-2 pt-1">
                <button
                    type="button"
                    onClick={onDuplicateTask}
                    className="text-xs px-3 py-1.5 rounded bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
                >
                    {t('taskEdit.duplicateTask')}
                </button>
                <button
                    type="submit"
                    className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:bg-primary/90"
                >
                    {t('common.save')}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded hover:bg-muted/80"
                >
                    {t('common.cancel')}
                </button>
            </div>
        </form>
    );
}
