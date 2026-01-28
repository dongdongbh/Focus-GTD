import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput, Platform, Alert, Share, ActivityIndicator, Dimensions, type TextStyle } from 'react-native';

import { useTaskStore, PRESET_CONTEXTS, PRESET_TAGS, createAIProvider, safeFormatDate, safeParseDate, resolveTextDirection, type Task, type AIProviderId } from '@mindwtr/core';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AIResponseModal, type AIResponseAction } from './ai-response-modal';

import { useLanguage } from '../contexts/language-context';
import { useTheme } from '../contexts/theme-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { buildAIConfig, loadAIKey } from '../lib/ai-config';
import { logWarn } from '../lib/app-log';

type InboxProcessingModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function InboxProcessingModal({ visible, onClose }: InboxProcessingModalProps) {
  const { tasks, projects, areas, settings, updateTask, deleteTask, addProject } = useTaskStore();
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const tc = useThemeColors();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [processingStep, setProcessingStep] = useState<'refine' | 'actionable' | 'twomin' | 'decide' | 'context' | 'project' | 'delegate'>('refine');
  const [newContext, setNewContext] = useState('');
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [delegateWho, setDelegateWho] = useState('');
  const [delegateFollowUpDate, setDelegateFollowUpDate] = useState<Date | null>(null);
  const [showDelegateDatePicker, setShowDelegateDatePicker] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [processingTitle, setProcessingTitle] = useState('');
  const [processingDescription, setProcessingDescription] = useState('');
  const [processingTitleFocused, setProcessingTitleFocused] = useState(false);
  const titleInputRef = useRef<TextInput | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [pendingStartDate, setPendingStartDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [isAIWorking, setIsAIWorking] = useState(false);
  const [aiModal, setAiModal] = useState<{ title: string; message?: string; actions: AIResponseAction[] } | null>(null);

  const inboxProcessing = settings?.gtd?.inboxProcessing ?? {};
  const twoMinuteFirst = inboxProcessing.twoMinuteFirst === true;
  const projectFirst = inboxProcessing.projectFirst === true;
  const scheduleEnabled = inboxProcessing.scheduleEnabled !== false;

  const aiEnabled = settings?.ai?.enabled === true;
  const aiProvider = (settings?.ai?.provider ?? 'openai') as AIProviderId;
  const closeAIModal = () => setAiModal(null);

  const inboxTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter(t => {
      if (t.deletedAt) return false;
      if (t.status !== 'inbox') return false;
      const start = safeParseDate(t.startTime);
      if (start && start > now) return false;
      return true;
    });
  }, [tasks]);

  const processingQueue = useMemo(() => inboxTasks.filter(t => !skippedIds.has(t.id)), [inboxTasks, skippedIds]);
  const currentTask = useMemo(() => processingQueue[currentIndex] || null, [processingQueue, currentIndex]);
  const totalCount = inboxTasks.length;
  const processedCount = totalCount - processingQueue.length + currentIndex;
  const resolvedTitleDirection = useMemo(() => {
    if (!currentTask) return 'ltr';
    const text = (processingTitle || currentTask.title || '').trim();
    return resolveTextDirection(text, currentTask.textDirection);
  }, [currentTask, processingTitle]);
  const titleDirectionStyle = useMemo<TextStyle>(() => ({
    writingDirection: resolvedTitleDirection,
    textAlign: resolvedTitleDirection === 'rtl' ? 'right' : 'left',
  }), [resolvedTitleDirection]);

  const [selectedContexts, setSelectedContexts] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const areaById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);

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

  const resetTitleFocus = () => {
    setProcessingTitleFocused(false);
    titleInputRef.current?.blur();
  };

  const resetProcessingState = () => {
    resetTitleFocus();
    setCurrentIndex(0);
    setProcessingStep('refine');
    setSkippedIds(new Set());
    setPendingStartDate(null);
    setShowStartDatePicker(false);
    setDelegateWho('');
    setDelegateFollowUpDate(null);
    setShowDelegateDatePicker(false);
    setSelectedContexts([]);
    setSelectedTags([]);
    setNewContext('');
    setProjectSearch('');
    setSelectedProjectId(null);
    setProcessingTitle('');
    setProcessingDescription('');
    setAiModal(null);
  };

  const handleClose = () => {
    resetProcessingState();
    onClose();
  };

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!visible) {
      hasInitialized.current = false;
      return;
    }
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    if (inboxTasks.length === 0) {
      handleClose();
      return;
    }
    const firstTask = inboxTasks[0];
    setCurrentIndex(0);
    setProcessingStep('refine');
    setSkippedIds(new Set());
    setPendingStartDate(null);
    setShowStartDatePicker(false);
    setDelegateWho('');
    setDelegateFollowUpDate(null);
    setShowDelegateDatePicker(false);
    setSelectedContexts(firstTask?.contexts ?? []);
    setSelectedTags(firstTask?.tags ?? []);
    setNewContext('');
    setProjectSearch('');
    setSelectedProjectId(firstTask?.projectId ?? null);
    resetTitleFocus();
    setProcessingTitle(firstTask?.title ?? '');
    setProcessingDescription(firstTask?.description ?? '');
  }, [visible, inboxTasks]);

  useEffect(() => {
    if (!visible) return;
    if (!currentTask && inboxTasks.length === 0) {
      handleClose();
    }
  }, [currentTask, inboxTasks.length, visible]);

  useEffect(() => {
    if (!visible) return;
    if (processingQueue.length === 0) {
      handleClose();
      return;
    }
    if (currentIndex < 0 || currentIndex >= processingQueue.length) {
      const nextIndex = Math.max(0, processingQueue.length - 1);
      const nextTask = processingQueue[nextIndex];
      setCurrentIndex(nextIndex);
      setProcessingStep('refine');
      setPendingStartDate(null);
      setShowStartDatePicker(false);
      setDelegateWho('');
      setDelegateFollowUpDate(null);
      setShowDelegateDatePicker(false);
      setSelectedContexts(nextTask?.contexts ?? []);
      setNewContext('');
      setProjectSearch('');
      setSelectedProjectId(nextTask?.projectId ?? null);
      resetTitleFocus();
      setProcessingTitle(nextTask?.title ?? '');
      setProcessingDescription(nextTask?.description ?? '');
    }
  }, [visible, processingQueue, currentIndex]);

  const moveToNext = () => {
    if (processingQueue.length === 0) {
      handleClose();
      return;
    }
    const nextTask = processingQueue[currentIndex + 1];
    if (!nextTask) {
      handleClose();
      return;
    }
    // Keep the same index since the current task will be removed from the queue.
    setCurrentIndex(currentIndex);
    setProcessingStep('refine');
    setPendingStartDate(null);
    setShowDelegateDatePicker(false);
    setDelegateWho('');
    setDelegateFollowUpDate(null);
    setSelectedContexts(nextTask?.contexts ?? []);
    setSelectedTags(nextTask?.tags ?? []);
    setNewContext('');
    setProjectSearch('');
    setSelectedProjectId(nextTask?.projectId ?? null);
    resetTitleFocus();
    setProcessingTitle(nextTask?.title ?? '');
    setProcessingDescription(nextTask?.description ?? '');
  };

  const handleSkip = () => {
    if (currentTask) {
      setSkippedIds(prev => new Set([...prev, currentTask.id]));
    }
    moveToNext();
  };

  const applyProcessingEdits = (updates?: Partial<Task>) => {
    if (!currentTask) return;
    const title = processingTitle.trim() || currentTask.title;
    const description = processingDescription.trim();
    updateTask(currentTask.id, {
      title,
      description: description.length > 0 ? description : undefined,
      ...(updates ?? {}),
    });
  };

  const handleNotActionable = (action: 'trash' | 'someday' | 'reference') => {
    if (!currentTask) return;
    if (action === 'trash') {
      deleteTask(currentTask.id);
    } else if (action === 'someday') {
      applyProcessingEdits({ status: 'someday' });
    } else if (action === 'reference') {
      applyProcessingEdits({ status: 'reference' });
    }
    moveToNext();
  };

  const handleRefineNext = () => {
    applyProcessingEdits();
    setProcessingStep('actionable');
  };

  const handleActionable = () => {
    setProcessingStep(twoMinuteFirst ? 'decide' : 'twomin');
  };

  const handleTwoMinYes = () => {
    if (currentTask) {
      applyProcessingEdits({ status: 'done' });
    }
    moveToNext();
  };

  const handleTwoMinNo = () => {
    setProcessingStep(twoMinuteFirst ? 'actionable' : 'decide');
  };

  const handleDecision = (decision: 'delegate' | 'defer') => {
    if (!currentTask) return;
    if (decision === 'delegate') {
      setDelegateWho('');
      setDelegateFollowUpDate(null);
      setProcessingStep('delegate');
    } else {
      setSelectedContexts(currentTask.contexts ?? []);
      setProcessingStep(projectFirst ? 'project' : 'context');
    }
  };

  const handleConfirmWaitingMobile = () => {
    if (currentTask) {
      const who = delegateWho.trim();
      const baseDescription = processingDescription.trim() || currentTask.description || '';
      const waitingLine = who ? `Waiting for: ${who}` : '';
      const nextDescription = [baseDescription, waitingLine]
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n');
      const updates: Partial<Task> = {
        status: 'waiting',
        description: nextDescription.length > 0 ? nextDescription : undefined,
      };
      if (delegateFollowUpDate) {
        updates.reviewAt = delegateFollowUpDate.toISOString();
      }
      applyProcessingEdits(updates);
    }
    setDelegateWho('');
    setDelegateFollowUpDate(null);
    moveToNext();
  };

  const handleSendDelegateRequest = async () => {
    if (!currentTask) return;
    const title = processingTitle.trim() || currentTask.title;
    const baseDescription = processingDescription.trim() || currentTask.description || '';
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
    await Share.share({ message: body, title: subject }).catch(() => {
      Alert.alert(t('common.notice'), t('process.delegateSendError'));
    });
  };

  const toggleContext = (ctx: string) => {
    setSelectedContexts((prev) =>
      prev.includes(ctx) ? prev.filter((item) => item !== ctx) : [...prev, ctx]
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]
    );
  };

  const addCustomContextMobile = () => {
    const trimmed = newContext.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#')) {
      const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
      if (!selectedTags.includes(normalized)) {
        setSelectedTags((prev) => [...prev, normalized]);
      }
    } else {
      const normalized = trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
      if (!selectedContexts.includes(normalized)) {
        setSelectedContexts((prev) => [...prev, normalized]);
      }
    }
    setNewContext('');
  };

  const finalizeNextAction = (projectId: string | null) => {
    applyProcessingEdits({
      status: 'next',
      projectId: projectId ?? undefined,
      contexts: selectedContexts,
      tags: selectedTags,
      startTime: scheduleEnabled && pendingStartDate ? pendingStartDate.toISOString() : undefined,
    });
    setPendingStartDate(null);
    moveToNext();
  };

  const handleConfirmContextsMobile = () => {
    if (projectFirst) {
      finalizeNextAction(selectedProjectId);
      return;
    }
    setProcessingStep('project');
  };

  const handleSetProject = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    setProjectSearch('');
    if (projectFirst) {
      setProcessingStep('context');
      return;
    }
    finalizeNextAction(projectId);
  };

  const handleAIClarifyInbox = async () => {
    if (!currentTask) return;
    if (!aiEnabled) {
      Alert.alert(t('ai.errorTitle'), t('ai.disabledBody'));
      return;
    }
    const apiKey = await loadAIKey(aiProvider);
    if (!apiKey) {
      Alert.alert(t('ai.errorTitle'), t('ai.missingKeyBody'));
      return;
    }
    setIsAIWorking(true);
    try {
      const provider = createAIProvider(buildAIConfig(settings ?? {}, apiKey));
      const contextOptions = Array.from(new Set([
        ...PRESET_CONTEXTS,
        ...selectedContexts,
        ...(currentTask.contexts ?? []),
      ]));
      const response = await provider.clarifyTask({
        title: processingTitle || currentTask.title,
        contexts: contextOptions,
      });
      const actions: AIResponseAction[] = [];
      response.options.slice(0, 3).forEach((option) => {
        actions.push({
          label: option.label,
          onPress: () => {
            setProcessingTitle(option.action);
            closeAIModal();
          },
        });
      });
      if (response.suggestedAction?.title) {
        actions.push({
          label: t('ai.applySuggestion'),
          variant: 'primary',
          onPress: () => {
            setProcessingTitle(response.suggestedAction!.title);
            if (response.suggestedAction?.context) {
              setSelectedContexts((prev) => Array.from(new Set([...prev, response.suggestedAction!.context!])));
            }
            closeAIModal();
          },
        });
      }
      actions.push({
        label: t('common.cancel'),
        variant: 'secondary',
        onPress: closeAIModal,
      });
      setAiModal({
        title: response.question || t('taskEdit.aiClarify'),
        actions,
      });
    } catch (error) {
      void logWarn('Inbox processing failed', {
        scope: 'inbox',
        extra: { error: error instanceof Error ? error.message : String(error) },
      });
      Alert.alert(t('ai.errorTitle'), t('ai.errorBody'));
    } finally {
      setIsAIWorking(false);
    }
  };

  if (!visible) return null;
  if (!currentTask) {
    const loadingLabel = t('common.loading') !== 'common.loading'
      ? t('common.loading')
      : 'Loading next item...';
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
      >
        <View style={[styles.fullScreenContainer, { backgroundColor: tc.bg }]}>
          <View style={[styles.processingHeader, { borderBottomColor: tc.border }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.headerClose, { color: tc.text }]}>✕</Text>
            </TouchableOpacity>
            <View style={styles.progressContainer}>
              <Text style={[styles.progressText, { color: tc.secondaryText }]}>
                {processedCount}/{totalCount}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: tc.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: totalCount > 0 ? `${(processedCount / totalCount) * 100}%` : '0%' }
                  ]}
                />
              </View>
            </View>
            <View style={{ width: 32 }} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={tc.tint} />
            <Text style={[styles.loadingText, { color: tc.secondaryText }]}>
              {loadingLabel}
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  const projectTitle = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.title
    : null;
  const currentProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId) ?? null
    : null;
  const displayDescription = processingDescription || currentTask.description || '';
  const windowHeight = Dimensions.get('window').height;
  const taskDisplayMaxHeight = Math.max(220, Math.floor(windowHeight * 0.44));
  const descriptionMaxHeight = Math.max(120, Math.floor(windowHeight * 0.28));

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleClose}
      >
        <View style={[styles.fullScreenContainer, { backgroundColor: tc.bg }]}>
          <View style={[styles.processingHeader, { borderBottomColor: tc.border }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={[styles.headerClose, { color: tc.text }]}>✕</Text>
            </TouchableOpacity>
            <View style={styles.progressContainer}>
              <Text style={[styles.progressText, { color: tc.secondaryText }]}>
                {processedCount + 1}/{totalCount}
              </Text>
              <View style={[styles.progressBar, { backgroundColor: tc.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${((processedCount + 1) / totalCount) * 100}%` }
                  ]}
                />
              </View>
            </View>
            <TouchableOpacity onPress={handleSkip}>
              <Text style={styles.skipBtn}>{t('inbox.skip')} →</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.taskDisplay, { maxHeight: taskDisplayMaxHeight }]}>
            {processingStep === 'refine' ? (
              <View style={styles.refineContainer}>
                <Text style={[styles.refineLabel, { color: tc.secondaryText }]}>{t('taskEdit.titleLabel')}</Text>
                <TextInput
                  ref={titleInputRef}
                  style={[styles.refineTitleInput, titleDirectionStyle, { borderColor: tc.border, color: tc.text, backgroundColor: tc.cardBg }]}
                  value={processingTitle}
                  onChangeText={setProcessingTitle}
                  placeholder={t('taskEdit.titleLabel')}
                  placeholderTextColor={tc.secondaryText}
                  onFocus={() => setProcessingTitleFocused(true)}
                  onBlur={() => setProcessingTitleFocused(false)}
                  selection={processingTitleFocused ? undefined : { start: 0, end: 0 }}
                />
                <Text style={[styles.refineLabel, { color: tc.secondaryText }]}>{t('taskEdit.descriptionLabel')}</Text>
                <TextInput
                  style={[styles.refineDescriptionInput, { borderColor: tc.border, color: tc.text, backgroundColor: tc.cardBg }]}
                  value={processingDescription}
                  onChangeText={setProcessingDescription}
                  placeholder={t('taskEdit.descriptionPlaceholder')}
                  placeholderTextColor={tc.secondaryText}
                  multiline
                  numberOfLines={4}
                />
              </View>
            ) : (
              <>
                <Text style={[styles.taskTitle, titleDirectionStyle, { color: tc.text }]}>
                  {processingTitle || currentTask.title}
                </Text>
                {displayDescription ? (
                  <ScrollView
                    nestedScrollEnabled
                    style={[styles.descriptionScroll, { maxHeight: descriptionMaxHeight }]}
                    contentContainerStyle={styles.descriptionScrollContent}
                  >
                    <Text style={[styles.taskDescription, { color: tc.secondaryText }]}>
                      {displayDescription}
                    </Text>
                  </ScrollView>
                ) : null}
              </>
            )}
            <View style={styles.taskMetaRow}>
              {projectTitle && (
                <Text
                  style={[
                    styles.metaPill,
                    { backgroundColor: tc.filterBg, borderColor: tc.border, color: tc.text }
                  ]}
                >
                  📁 {projectTitle}
                </Text>
              )}
              {currentTask.startTime && (
                <Text
                  style={[
                    styles.metaPill,
                    { backgroundColor: tc.filterBg, borderColor: tc.border, color: tc.text }
                  ]}
                >
                  ⏱ {safeFormatDate(currentTask.startTime, 'P')}
                </Text>
              )}
              {currentTask.dueDate && (
                <Text
                  style={[
                    styles.metaPill,
                    { backgroundColor: tc.filterBg, borderColor: tc.border, color: tc.text }
                  ]}
                >
                  📅 {safeFormatDate(currentTask.dueDate, 'P')}
                </Text>
              )}
              {currentTask.reviewAt && (
                <Text
                  style={[
                    styles.metaPill,
                    { backgroundColor: tc.filterBg, borderColor: tc.border, color: tc.text }
                  ]}
                >
                  🔁 {safeFormatDate(currentTask.reviewAt, 'P')}
                </Text>
              )}
            </View>
            {(currentTask.contexts.length > 0 || currentTask.tags.length > 0) && (
              <View style={styles.taskMetaRow}>
                {currentTask.contexts.slice(0, 6).map((ctx) => (
                  <Text
                    key={ctx}
                    style={[
                      styles.metaPill,
                      isDark ? styles.metaPillContextDark : styles.metaPillContextLight,
                      { borderColor: tc.border }
                    ]}
                  >
                    {ctx}
                  </Text>
                ))}
                {currentTask.tags.slice(0, 6).map((tag) => (
                  <Text
                    key={tag}
                    style={[
                      styles.metaPill,
                      isDark ? styles.metaPillTagDark : styles.metaPillTagLight,
                      { borderColor: tc.border }
                    ]}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            )}
            {aiEnabled && (
              <View style={styles.aiActionRow}>
                <TouchableOpacity
                  style={[styles.aiActionButton, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
                  onPress={handleAIClarifyInbox}
                  disabled={isAIWorking}
                >
                  <Text style={[styles.aiActionText, { color: tc.tint }]}>
                    {t('taskEdit.aiClarify')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.stepContainer}>
            {processingStep === 'refine' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  {t('inbox.refineTitle')}
                </Text>
                <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                  {t('inbox.refineHint')}
                </Text>
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: '#EF4444' }]}
                    onPress={() => handleNotActionable('trash')}
                  >
                    <Text style={styles.buttonPrimaryText}>🗑️ {t('inbox.refineDelete')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.buttonPrimary]}
                    onPress={handleRefineNext}
                  >
                    <Text style={styles.buttonPrimaryText}>{t('inbox.refineNext')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {processingStep === 'actionable' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  {t('inbox.isActionable')}
                </Text>
                <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                  {t('inbox.actionableHint')}
                </Text>

                <View style={styles.buttonColumn}>
                  <TouchableOpacity
                    style={[styles.bigButton, styles.buttonPrimary]}
                    onPress={handleActionable}
                  >
                    <Text style={styles.bigButtonText}>✅ {t('inbox.yesActionable')}</Text>
                  </TouchableOpacity>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: '#EF4444' }]}
                      onPress={() => handleNotActionable('trash')}
                    >
                      <Text style={styles.buttonPrimaryText}>🗑️ {t('inbox.trash')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: '#8B5CF6' }]}
                      onPress={() => handleNotActionable('someday')}
                    >
                      <Text style={styles.buttonPrimaryText}>💭 {t('inbox.someday')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: '#3B82F6' }]}
                      onPress={() => handleNotActionable('reference')}
                    >
                      <Text style={styles.buttonPrimaryText}>📚 {t('nav.reference')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {processingStep === 'twomin' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  ⏱️ {t('inbox.twoMinRule')}
                </Text>
                <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                  {t('inbox.twoMinHint')}
                </Text>

                <View style={styles.buttonColumn}>
                  <TouchableOpacity
                    style={[styles.bigButton, styles.buttonSuccess]}
                    onPress={handleTwoMinYes}
                  >
                    <Text style={styles.bigButtonText}>✅ {t('inbox.doneIt')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bigButton, { backgroundColor: tc.border }]}
                    onPress={handleTwoMinNo}
                  >
                    <Text style={[styles.bigButtonText, { color: tc.text }]}>
                      {t('inbox.takesLonger')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {processingStep === 'decide' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  {t('inbox.whatNext')}
                </Text>

                {scheduleEnabled && (
                <View style={styles.startDateRow}>
                  <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                    {t('taskEdit.startDateLabel')} ({t('common.notSet')})
                  </Text>
                  <View style={styles.startDateActions}>
                    <TouchableOpacity
                      style={[styles.startDateButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                      onPress={() => setShowStartDatePicker(true)}
                    >
                      <Text style={[styles.startDateButtonText, { color: tc.text }]}>
                        {pendingStartDate ? safeFormatDate(pendingStartDate.toISOString(), 'P') : t('common.notSet')}
                      </Text>
                    </TouchableOpacity>
                    {pendingStartDate && (
                      <TouchableOpacity
                        style={[styles.startDateClear, { borderColor: tc.border }]}
                        onPress={() => setPendingStartDate(null)}
                      >
                        <Text style={[styles.startDateClearText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                )}

                <View style={styles.buttonColumn}>
                  <TouchableOpacity
                    style={[styles.bigButton, styles.buttonPrimary]}
                    onPress={() => handleDecision('defer')}
                  >
                    <Text style={styles.bigButtonText}>📋 {t('inbox.illDoIt')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bigButton, { backgroundColor: '#F59E0B' }]}
                    onPress={() => handleDecision('delegate')}
                  >
                    <Text style={styles.bigButtonText}>👤 {t('inbox.delegate')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {scheduleEnabled && showStartDatePicker && (
              <DateTimePicker
                value={pendingStartDate ?? new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  if (event.type === 'dismissed') {
                    setShowStartDatePicker(false);
                    return;
                  }
                  if (Platform.OS !== 'ios') setShowStartDatePicker(false);
                  if (!date) return;
                  const next = new Date(date);
                  next.setHours(9, 0, 0, 0);
                  setPendingStartDate(next);
                }}
              />
            )}

            {showDelegateDatePicker && (
              <DateTimePicker
                value={delegateFollowUpDate ?? new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  if (event.type === 'dismissed') {
                    setShowDelegateDatePicker(false);
                    return;
                  }
                  if (Platform.OS !== 'ios') setShowDelegateDatePicker(false);
                  if (!date) return;
                  const next = new Date(date);
                  next.setHours(9, 0, 0, 0);
                  setDelegateFollowUpDate(next);
                }}
              />
            )}

            {processingStep === 'delegate' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  👤 {t('process.delegateTitle')}
                </Text>
                <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                  {t('process.delegateDesc')}
                </Text>

                <Text style={[styles.refineLabel, { color: tc.secondaryText }]}>{t('process.delegateWhoLabel')}</Text>
                <TextInput
                  style={[styles.waitingInput, { borderColor: tc.border, color: tc.text }]}
                  placeholder={t('process.delegateWhoPlaceholder')}
                  placeholderTextColor={tc.secondaryText}
                  value={delegateWho}
                  onChangeText={setDelegateWho}
                />

                <View style={styles.startDateRow}>
                  <Text style={[styles.stepHint, { color: tc.secondaryText }]}>
                    {t('process.delegateFollowUpLabel')}
                  </Text>
                  <View style={styles.startDateActions}>
                    <TouchableOpacity
                      style={[styles.startDateButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                      onPress={() => setShowDelegateDatePicker(true)}
                    >
                      <Text style={[styles.startDateButtonText, { color: tc.text }]}>
                        {delegateFollowUpDate ? safeFormatDate(delegateFollowUpDate.toISOString(), 'P') : t('common.notSet')}
                      </Text>
                    </TouchableOpacity>
                    {delegateFollowUpDate && (
                      <TouchableOpacity
                        style={[styles.startDateClear, { borderColor: tc.border }]}
                        onPress={() => setDelegateFollowUpDate(null)}
                      >
                        <Text style={[styles.startDateClearText, { color: tc.secondaryText }]}>{t('common.clear')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.buttonSecondary, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                  onPress={handleSendDelegateRequest}
                >
                  <Text style={[styles.buttonText, { color: tc.text }]}>{t('process.delegateSendRequest')}</Text>
                </TouchableOpacity>

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: tc.border }]}
                    onPress={() => setProcessingStep('decide')}
                  >
                    <Text style={[styles.buttonText, { color: tc.text }]}>{t('common.back')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: '#F59E0B' }]}
                    onPress={handleConfirmWaitingMobile}
                  >
                    <Text style={styles.buttonPrimaryText}>{t('process.delegateMoveToWaiting')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {processingStep === 'context' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  {t('inbox.whereDoIt')} {t('inbox.selectMultipleHint')}
                </Text>

                {selectedContexts.length > 0 && (
                  <View style={[styles.selectedContextsContainer, { backgroundColor: '#3B82F620' }]}>
                    <Text style={{ fontSize: 12, color: '#3B82F6', marginBottom: 4 }}>{t('inbox.selectedLabel')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {selectedContexts.map(ctx => (
                        <View key={ctx} style={{ backgroundColor: '#3B82F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ color: '#FFF', fontSize: 12 }}>{ctx}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {selectedTags.length > 0 && (
                  <View style={[styles.selectedContextsContainer, { backgroundColor: '#8B5CF620' }]}>
                    <Text style={{ fontSize: 12, color: '#8B5CF6', marginBottom: 4 }}>{t('taskEdit.tagsLabel')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {selectedTags.map(tag => (
                        <View key={tag} style={{ backgroundColor: '#8B5CF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                          <Text style={{ color: '#FFF', fontSize: 12 }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.customContextContainer}>
                  <TextInput
                    style={[styles.contextInput, { borderColor: tc.border, color: tc.text }]}
                    placeholder={t('inbox.addContextPlaceholder')}
                    placeholderTextColor={tc.secondaryText}
                    value={newContext}
                    onChangeText={setNewContext}
                    onSubmitEditing={addCustomContextMobile}
                  />
                  <TouchableOpacity
                    style={styles.addContextButton}
                    onPress={addCustomContextMobile}
                    disabled={!newContext.trim()}
                  >
                    <Text style={styles.addContextButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.contextWrap}>
                  {PRESET_CONTEXTS.filter((ctx) => ctx.startsWith('@')).map(ctx => (
                    <TouchableOpacity
                      key={ctx}
                      style={[
                        styles.contextChip,
                        selectedContexts.includes(ctx)
                          ? { backgroundColor: '#3B82F6' }
                          : { backgroundColor: tc.cardBg, borderWidth: 1, borderColor: tc.border }
                      ]}
                      onPress={() => toggleContext(ctx)}
                    >
                      <Text style={[
                        styles.contextChipText,
                        { color: selectedContexts.includes(ctx) ? '#FFF' : tc.text }
                      ]}>{ctx}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.contextWrap}>
                  {PRESET_TAGS.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={[
                        styles.contextChip,
                        selectedTags.includes(tag)
                          ? { backgroundColor: '#8B5CF6' }
                          : { backgroundColor: tc.cardBg, borderWidth: 1, borderColor: tc.border }
                      ]}
                      onPress={() => toggleTag(tag)}
                    >
                      <Text style={[
                        styles.contextChipText,
                        { color: selectedTags.includes(tag) ? '#FFF' : tc.text }
                      ]}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.bigButton, styles.buttonPrimary, { marginTop: 16 }]}
                  onPress={handleConfirmContextsMobile}
                >
                  <Text style={styles.bigButtonText}>
                    {(selectedContexts.length + selectedTags.length) > 0
                      ? `${t('common.done')} (${selectedContexts.length + selectedTags.length})`
                      : t('common.done')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {processingStep === 'project' && (
              <View style={styles.stepContent}>
                <Text style={[styles.stepQuestion, { color: tc.text }]}>
                  📁 {t('inbox.assignProjectQuestion')}
                </Text>

                {currentProject && (
                  <TouchableOpacity
                    style={[styles.projectChip, { backgroundColor: tc.tint }]}
                    onPress={() => handleSetProject(currentProject.id)}
                  >
                    <Text style={styles.projectChipText}>✓ {currentProject.title}</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.projectSearchRow}>
                  <TextInput
                    value={projectSearch}
                    onChangeText={setProjectSearch}
                    placeholder={t('projects.addPlaceholder')}
                    placeholderTextColor={tc.secondaryText}
                    style={[styles.projectSearchInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                    onSubmitEditing={async () => {
                      const title = projectSearch.trim();
                      if (!title) return;
                      const existing = projects.find((project) => project.title.toLowerCase() === title.toLowerCase());
                      if (existing) {
                        handleSetProject(existing.id);
                        return;
                      }
                      const created = await addProject(title, '#94a3b8');
                      if (!created) return;
                      handleSetProject(created.id);
                      setProjectSearch('');
                    }}
                    returnKeyType="done"
                  />
                  {!hasExactProjectMatch && projectSearch.trim() && (
                    <TouchableOpacity
                      style={[styles.createProjectButton, { backgroundColor: tc.tint }]}
                      onPress={async () => {
                        const title = projectSearch.trim();
                        if (!title) return;
                        const created = await addProject(title, '#94a3b8');
                        if (!created) return;
                        handleSetProject(created.id);
                        setProjectSearch('');
                      }}
                    >
                      <Text style={styles.createProjectButtonText}>{t('projects.create')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView style={{ maxHeight: 300 }}>
                  <TouchableOpacity
                    style={[styles.projectChip, { backgroundColor: '#10B981' }]}
                    onPress={() => handleSetProject(null)}
                  >
                    <Text style={styles.projectChipText}>✓ {t('inbox.noProject')}</Text>
                  </TouchableOpacity>
                  {filteredProjects.map(proj => {
                    const projectColor = proj.areaId ? areaById.get(proj.areaId)?.color : undefined;
                    const isSelected = selectedProjectId === proj.id;
                    return (
                      <TouchableOpacity
                        key={proj.id}
                        style={[
                          styles.projectChip,
                          isSelected
                            ? { backgroundColor: '#3B82F620', borderWidth: 1, borderColor: tc.tint }
                            : { backgroundColor: tc.cardBg, borderWidth: 1, borderColor: tc.border },
                        ]}
                        onPress={() => handleSetProject(proj.id)}
                      >
                        <View style={[styles.projectDot, { backgroundColor: projectColor || '#6B7280' }]} />
                        <Text style={[styles.projectChipText, { color: tc.text }]}>{proj.title}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>
      {aiModal && (
        <AIResponseModal
          visible={Boolean(aiModal)}
          title={aiModal.title}
          message={aiModal.message}
          actions={aiModal.actions}
          onClose={closeAIModal}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
  },
  processingHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerClose: {
    fontSize: 18,
    fontWeight: '700',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    width: '70%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 2,
  },
  skipBtn: {
    fontSize: 14,
    color: '#3B82F6',
  },
  taskDisplay: {
    padding: 20,
    borderBottomWidth: 0,
    flexShrink: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 14,
  },
  taskTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  taskDescription: {
    fontSize: 14,
    marginBottom: 0,
  },
  descriptionScroll: {
    marginBottom: 6,
  },
  descriptionScrollContent: {
    paddingBottom: 4,
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  metaPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  metaPillContextDark: {
    backgroundColor: '#0F172A',
    color: '#93C5FD',
  },
  metaPillContextLight: {
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
  },
  metaPillTagDark: {
    backgroundColor: '#111827',
    color: '#FDE68A',
  },
  metaPillTagLight: {
    backgroundColor: '#FEF3C7',
    color: '#92400E',
  },
  aiActionRow: {
    marginTop: 10,
    flexDirection: 'row',
  },
  aiActionButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepContainer: {
    padding: 20,
    flex: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepQuestion: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  stepHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonColumn: {
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#3B82F6',
  },
  buttonSuccess: {
    backgroundColor: '#22C55E',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    fontWeight: '600',
  },
  bigButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  bigButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refineContainer: {
    gap: 8,
  },
  refineLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  refineTitleInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  refineDescriptionInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  waitingInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  startDateRow: {
    marginTop: 12,
  },
  startDateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  startDateButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  startDateButtonText: {
    fontSize: 13,
  },
  startDateClear: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  startDateClearText: {
    fontSize: 12,
  },
  selectedContextsContainer: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  customContextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  contextInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addContextButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addContextButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  contextWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  contextChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  contextChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  projectSearchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  createProjectButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  createProjectButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  projectChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectChipText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  projectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
