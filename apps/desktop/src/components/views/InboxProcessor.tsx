import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { safeParseDate, safeFormatDate, hasTimeComponent, type AppData, type Area, type Project, type Task } from '@mindwtr/core';

import { InboxProcessingWizard, type ProcessingStep } from '../InboxProcessingWizard';
import { resolveAreaFilter, taskMatchesAreaFilter } from '../../lib/area-filter';

type InboxProcessorProps = {
    t: (key: string) => string;
    isInbox: boolean;
    tasks: Task[];
    projects: Project[];
    areas: Area[];
    settings?: AppData['settings'];
    addProject: (title: string, color: string) => Promise<Project | null>;
    updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
    deleteTask: (id: string) => Promise<void>;
    allContexts: string[];
    isProcessing: boolean;
    setIsProcessing: (value: boolean) => void;
};

export function InboxProcessor({
    t,
    isInbox,
    tasks,
    projects,
    areas,
    settings,
    addProject,
    updateTask,
    deleteTask,
    allContexts,
    isProcessing,
    setIsProcessing,
}: InboxProcessorProps) {
    const [processingTask, setProcessingTask] = useState<Task | null>(null);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>('actionable');
    const [stepHistory, setStepHistory] = useState<ProcessingStep[]>([]);
    const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [delegateWho, setDelegateWho] = useState('');
    const [delegateFollowUp, setDelegateFollowUp] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [processingTitle, setProcessingTitle] = useState('');
    const [processingDescription, setProcessingDescription] = useState('');
    const [convertToProject, setConvertToProject] = useState(false);
    const [projectTitleDraft, setProjectTitleDraft] = useState('');
    const [nextActionDraft, setNextActionDraft] = useState('');
    const [customContext, setCustomContext] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleTimeDraft, setScheduleTimeDraft] = useState('');
    const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

    const inboxProcessing = settings?.gtd?.inboxProcessing ?? {};
    const twoMinuteFirst = inboxProcessing.twoMinuteFirst === true;
    const projectFirst = inboxProcessing.projectFirst === true;
    const scheduleEnabled = inboxProcessing.scheduleEnabled !== false;

    const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
    const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
    const resolvedAreaFilter = useMemo(
        () => resolveAreaFilter(settings?.filters?.areaId, areas),
        [settings?.filters?.areaId, areas],
    );
    const matchesAreaFilter = useCallback(
        (task: Task) => taskMatchesAreaFilter(task, resolvedAreaFilter, projectMap, areaById),
        [resolvedAreaFilter, projectMap, areaById],
    );

    const filteredProjects = useMemo(() => {
        if (!projectSearch.trim()) return projects;
        const query = projectSearch.trim().toLowerCase();
        return projects.filter((project) => project.title.toLowerCase().includes(query));
    }, [projects, projectSearch]);

    const hasExactProjectMatch = useMemo(() => {
        if (!projectSearch.trim()) return false;
        const query = projectSearch.trim().toLowerCase();
        return projects.some((project) => project.title.toLowerCase() === query);
    }, [projects, projectSearch]);

    const inboxCount = useMemo(() => (
        tasks.filter((task) => {
            if (task.status !== 'inbox' || task.deletedAt) return false;
            const start = safeParseDate(task.startTime);
            if (start && start > new Date()) return false;
            if (!matchesAreaFilter(task)) return false;
            return true;
        }).length
    ), [tasks, matchesAreaFilter]);

    const remainingInboxCount = useMemo(
        () => tasks.filter((task) => task.status === 'inbox' && !skippedIds.has(task.id) && matchesAreaFilter(task)).length,
        [tasks, skippedIds, matchesAreaFilter]
    );

    useEffect(() => {
        if (isProcessing) return;
        setProcessingTask(null);
        setProcessingStep('actionable');
        setStepHistory([]);
        setSelectedContexts([]);
        setSelectedTags([]);
        setDelegateWho('');
        setDelegateFollowUp('');
        setProjectSearch('');
        setProcessingTitle('');
        setProcessingDescription('');
        setConvertToProject(false);
        setProjectTitleDraft('');
        setNextActionDraft('');
        setCustomContext('');
        setSelectedProjectId(null);
        setScheduleDate('');
        setScheduleTime('');
        setScheduleTimeDraft('');
        setSkippedIds(new Set());
    }, [isProcessing]);

    const hydrateProcessingTask = useCallback((task: Task) => {
        setProcessingTask(task);
        setProcessingStep('refine');
        setStepHistory([]);
        setSelectedContexts(task.contexts ?? []);
        setSelectedTags(task.tags ?? []);
        setCustomContext('');
        setProjectSearch('');
        setProcessingTitle(task.title);
        setProcessingDescription(task.description || '');
        setConvertToProject(false);
        setProjectTitleDraft(task.title);
        setNextActionDraft('');
        setSelectedProjectId(task.projectId ?? null);
        const parsedStart = task.startTime ? safeParseDate(task.startTime) : null;
        const dateValue = parsedStart ? safeFormatDate(parsedStart, 'yyyy-MM-dd') : '';
        const timeValue = parsedStart && task.startTime && hasTimeComponent(task.startTime)
            ? safeFormatDate(parsedStart, 'HH:mm')
            : '';
        setScheduleDate(dateValue);
        setScheduleTime(timeValue);
        setScheduleTimeDraft(timeValue);
    }, []);

    const startProcessing = useCallback(() => {
        const inboxTasks = tasks.filter((task) => task.status === 'inbox' && matchesAreaFilter(task));
        if (inboxTasks.length === 0) return;
        hydrateProcessingTask(inboxTasks[0]);
        setIsProcessing(true);
    }, [tasks, hydrateProcessingTask, setIsProcessing, matchesAreaFilter]);

    const processNext = useCallback(() => {
        const currentTaskId = processingTask?.id;
        const inboxTasks = tasks.filter((task) =>
            task.status === 'inbox'
            && task.id !== currentTaskId
            && !skippedIds.has(task.id)
            && matchesAreaFilter(task)
        );
        if (inboxTasks.length > 0) {
            hydrateProcessingTask(inboxTasks[0]);
            return;
        }
        setIsProcessing(false);
        setProcessingTask(null);
        setSelectedContexts([]);
    }, [hydrateProcessingTask, processingTask?.id, tasks, setIsProcessing, skippedIds, matchesAreaFilter]);

    const handleSkip = useCallback(() => {
        if (processingTask) {
            setSkippedIds((prev) => {
                const next = new Set(prev);
                next.add(processingTask.id);
                return next;
            });
        }
        processNext();
    }, [processNext, processingTask]);

    const applyProcessingEdits = useCallback((updates: Partial<Task>) => {
        if (!processingTask) return;
        const trimmedTitle = processingTitle.trim();
        const title = trimmedTitle.length > 0 ? trimmedTitle : processingTask.title;
        const description = processingDescription.trim();
        updateTask(processingTask.id, {
            title,
            description: description.length > 0 ? description : undefined,
            ...updates,
        });
    }, [processingDescription, processingTask, processingTitle, updateTask]);

    const handleNotActionable = useCallback((action: 'trash' | 'someday' | 'reference') => {
        if (!processingTask) return;
        if (action === 'trash') {
            deleteTask(processingTask.id);
        } else if (action === 'someday') {
            applyProcessingEdits({ status: 'someday' });
        } else {
            applyProcessingEdits({ status: 'reference' });
        }
        processNext();
    }, [applyProcessingEdits, deleteTask, processNext, processingTask]);

    const goToStep = useCallback((nextStep: ProcessingStep) => {
        setStepHistory((prev) => [...prev, processingStep]);
        setProcessingStep(nextStep);
    }, [processingStep]);

    const goBack = useCallback(() => {
        setStepHistory((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const last = next.pop();
            if (last) setProcessingStep(last);
            return next;
        });
    }, []);

    const handleActionable = () => goToStep(twoMinuteFirst ? 'decide' : 'twomin');

    const handleTwoMinDone = () => {
        if (processingTask) {
            applyProcessingEdits({ status: 'done' });
        }
        processNext();
    };

    const handleTwoMinNo = () => goToStep(twoMinuteFirst ? 'actionable' : 'decide');

    const handleDelegate = () => {
        setDelegateWho('');
        setDelegateFollowUp('');
        goToStep('delegate');
    };

    const handleConfirmWaiting = () => {
        if (processingTask) {
            const baseDescription = processingDescription.trim() || processingTask.description || '';
            const who = delegateWho.trim();
            const waitingLine = who ? `Waiting for: ${who}` : '';
            const nextDescription = [baseDescription, waitingLine]
                .map((line) => line.trim())
                .filter(Boolean)
                .join('\n');
            const followUpIso = delegateFollowUp
                ? new Date(`${delegateFollowUp}T09:00:00`).toISOString()
                : undefined;
            const scheduleUpdate = (scheduleEnabled && scheduleDate)
                ? { startTime: scheduleTime ? `${scheduleDate}T${scheduleTime}` : scheduleDate }
                : {};
            applyProcessingEdits({
                status: 'waiting',
                description: nextDescription.length > 0 ? nextDescription : undefined,
                reviewAt: followUpIso,
                ...scheduleUpdate,
            });
        }
        setDelegateWho('');
        setDelegateFollowUp('');
        processNext();
    };

    const handleDelegateBack = () => {
        goBack();
    };

    const handleSendDelegateRequest = () => {
        if (!processingTask) return;
        const title = processingTitle.trim() || processingTask.title;
        const baseDescription = processingDescription.trim() || processingTask.description || '';
        const who = delegateWho.trim();
        const greeting = who ? `Hi ${who},` : 'Hi,';
        const bodyParts = [
            greeting,
            '',
            `Could you please handle: ${title}`,
            baseDescription ? `\nDetails:\n${baseDescription}` : '',
            '',
            'Thanks!',
        ];
        const body = bodyParts.join('\n');
        const subject = `Delegation: ${title}`;
        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto);
    };

    const handleDefer = () => {
        setSelectedContexts(processingTask?.contexts ?? []);
        setSelectedTags(processingTask?.tags ?? []);
        goToStep('context');
    };

    const toggleTag = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
        );
    };

    const toggleContext = (ctx: string) => {
        if (ctx.startsWith('#')) {
            toggleTag(ctx);
            return;
        }
        setSelectedContexts((prev) =>
            prev.includes(ctx) ? prev.filter((item) => item !== ctx) : [...prev, ctx]
        );
    };

    const addCustomContext = () => {
        const trimmed = customContext.trim();
        if (!trimmed) return;
        const raw = trimmed.replace(/^@/, '');
        if (raw.startsWith('#')) {
            const tag = `#${raw.replace(/^#+/, '').trim()}`;
            if (tag.length > 1 && !selectedTags.includes(tag)) {
                setSelectedTags((prev) => [...prev, tag]);
            }
            setCustomContext('');
            return;
        }
        const ctx = `@${raw.replace(/^@/, '').trim()}`;
        if (ctx.length > 1 && !selectedContexts.includes(ctx)) {
            setSelectedContexts((prev) => [...prev, ctx]);
        }
        setCustomContext('');
    };

    const normalizeTimeInput = (value: string): string | null => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        const compact = trimmed.replace(/\s+/g, '');
        let hours: number;
        let minutes: number;
        if (/^\d{1,2}:\d{2}$/.test(compact)) {
            const [h, m] = compact.split(':');
            hours = Number(h);
            minutes = Number(m);
        } else if (/^\d{3,4}$/.test(compact)) {
            if (compact.length === 3) {
                hours = Number(compact.slice(0, 1));
                minutes = Number(compact.slice(1));
            } else {
                hours = Number(compact.slice(0, 2));
                minutes = Number(compact.slice(2));
            }
        } else {
            return null;
        }
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    const handleScheduleTimeCommit = () => {
        const normalized = normalizeTimeInput(scheduleTimeDraft);
        if (normalized === null) {
            setScheduleTimeDraft(scheduleTime);
            return;
        }
        setScheduleTimeDraft(normalized);
        setScheduleTime(normalized);
    };

    const handleScheduleDateChange = (value: string) => {
        setScheduleDate(value);
        if (!value) {
            setScheduleTime('');
            setScheduleTimeDraft('');
        }
    };

    const handleConfirmContexts = () => {
        if (projectFirst) {
            handleSetProject(selectedProjectId);
            return;
        }
        goToStep('project');
    };

    const handleSetProject = (projectId: string | null) => {
        if (processingTask) {
            applyProcessingEdits({
                status: 'next',
                contexts: selectedContexts,
                tags: selectedTags,
                projectId: projectId || undefined,
                ...(scheduleEnabled && scheduleDate
                    ? { startTime: scheduleTime ? `${scheduleDate}T${scheduleTime}` : scheduleDate }
                    : {}),
            });
        }
        processNext();
    };

    const handleConvertToProject = async () => {
        if (!processingTask) return;
        const projectTitle = projectTitleDraft.trim() || processingTitle.trim();
        const nextAction = nextActionDraft.trim();
        if (!projectTitle) return;
        if (!nextAction) {
            alert(t('process.nextActionRequired'));
            return;
        }
        const existing = projects.find((project) => project.title.toLowerCase() === projectTitle.toLowerCase());
        const project = existing ?? await addProject(projectTitle, '#94a3b8');
        if (!project) return;
        applyProcessingEdits({
            title: nextAction,
            status: 'next',
            contexts: selectedContexts,
            tags: selectedTags,
            projectId: project.id,
            ...(scheduleEnabled && scheduleDate
                ? { startTime: scheduleTime ? `${scheduleDate}T${scheduleTime}` : scheduleDate }
                : {}),
        });
        processNext();
    };

    if (!isInbox) return null;

    return (
        <>
            {inboxCount > 0 && !isProcessing && (
                <button
                    onClick={startProcessing}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-lg font-medium hover:bg-primary/90 transition-colors"
                >
                    <Play className="w-4 h-4" />
                    {t('process.btn')} ({inboxCount})
                </button>
            )}

            <InboxProcessingWizard
                t={t}
                isProcessing={isProcessing}
                processingTask={processingTask}
                processingStep={processingStep}
                processingTitle={processingTitle}
                processingDescription={processingDescription}
                setProcessingTitle={setProcessingTitle}
                setProcessingDescription={setProcessingDescription}
                setIsProcessing={setIsProcessing}
                canGoBack={stepHistory.length > 0}
                onBack={goBack}
                handleRefineNext={() => goToStep(twoMinuteFirst ? 'twomin' : 'actionable')}
                handleSkip={handleSkip}
                handleNotActionable={handleNotActionable}
                handleActionable={handleActionable}
                handleTwoMinDone={handleTwoMinDone}
                handleTwoMinNo={handleTwoMinNo}
                handleDefer={handleDefer}
                handleDelegate={handleDelegate}
                delegateWho={delegateWho}
                setDelegateWho={setDelegateWho}
                delegateFollowUp={delegateFollowUp}
                setDelegateFollowUp={setDelegateFollowUp}
                handleDelegateBack={handleDelegateBack}
                handleSendDelegateRequest={handleSendDelegateRequest}
                handleConfirmWaiting={handleConfirmWaiting}
                selectedContexts={selectedContexts}
                selectedTags={selectedTags}
                allContexts={allContexts}
                customContext={customContext}
                setCustomContext={setCustomContext}
                addCustomContext={addCustomContext}
                toggleContext={toggleContext}
                toggleTag={toggleTag}
                handleConfirmContexts={handleConfirmContexts}
                convertToProject={convertToProject}
                setConvertToProject={setConvertToProject}
                setProjectTitleDraft={setProjectTitleDraft}
                setNextActionDraft={setNextActionDraft}
                projectTitleDraft={projectTitleDraft}
                nextActionDraft={nextActionDraft}
                handleConvertToProject={handleConvertToProject}
                projectSearch={projectSearch}
                setProjectSearch={setProjectSearch}
                projects={projects}
                filteredProjects={filteredProjects}
                addProject={addProject}
                handleSetProject={handleSetProject}
                hasExactProjectMatch={hasExactProjectMatch}
                areaById={areaById}
                remainingCount={remainingInboxCount}
                showProjectInRefine={projectFirst}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
                scheduleDate={scheduleDate}
                scheduleTimeDraft={scheduleTimeDraft}
                setScheduleDate={handleScheduleDateChange}
                setScheduleTimeDraft={setScheduleTimeDraft}
                onScheduleTimeCommit={handleScheduleTimeCommit}
                showScheduleFields={scheduleEnabled}
            />
        </>
    );
}
