import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, ScrollView, Switch, Platform, KeyboardAvoidingView } from 'react-native';
import { CalendarDays, Folder, Flag, X, Clock, Mic, Square } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { parseQuickAdd, safeFormatDate, safeParseDate, type Attachment, type Task, type TaskPriority, generateUUID, useTaskStore } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadAIKey } from '../lib/ai-config';
import { processAudioCapture, ensureWhisperModelPathForConfig, preloadWhisperContext, startWhisperRealtimeCapture, type SpeechToTextResult } from '../lib/speech-to-text';
import { persistAttachmentLocally } from '../lib/attachment-sync';
import { logError, logInfo, logWarn } from '../lib/app-log';

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));
const buildCaptureExtra = (message?: string, error?: unknown): Record<string, string> | undefined => {
  const extra: Record<string, string> = {};
  if (message) extra.message = message;
  if (error) {
    extra.error = formatError(error);
    if (error instanceof Error && error.stack) {
      extra.stack = error.stack;
    }
  }
  return Object.keys(extra).length ? extra : undefined;
};
const logCaptureWarn = (message: string, error?: unknown) => {
  void logWarn(message, { scope: 'capture', extra: buildCaptureExtra(undefined, error) });
};
const logCaptureError = (message: string, error?: unknown) => {
  const err = error instanceof Error ? error : new Error(message);
  void logError(err, { scope: 'capture', extra: buildCaptureExtra(message, error) });
};

type RecordingState =
  | { kind: 'expo' }
  | { kind: 'whisper'; stop: () => Promise<void>; result: Promise<SpeechToTextResult>; file: File };

export function QuickCaptureSheet({
  visible,
  onClose,
  initialProps,
  initialValue,
  autoRecord,
}: {
  visible: boolean;
  onClose: () => void;
  initialProps?: Partial<Task>;
  initialValue?: string;
  autoRecord?: boolean;
}) {
  const { addTask, addProject, updateTask, updateSettings, projects, settings, tasks, areas } = useTaskStore();
  const { t } = useLanguage();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const prioritiesEnabled = settings?.features?.priorities === true;

  const updateSpeechSettings = useCallback(
    (next: Partial<NonNullable<NonNullable<typeof settings.ai>['speechToText']>>) => {
      updateSettings({
        ai: {
          ...(settings.ai ?? {}),
          speechToText: {
            ...(settings.ai?.speechToText ?? {}),
            ...next,
          },
        },
      }).catch((error) => logCaptureWarn('Failed to update speech settings', error));
    },
    [settings.ai, updateSettings]
  );

  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startPickerMode, setStartPickerMode] = useState<'date' | 'time' | null>(null);
  const [pendingStartDate, setPendingStartDate] = useState<Date | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [addAnother, setAddAnother] = useState(false);
  const [recording, setRecording] = useState<RecordingState | null>(null);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingReady, setRecordingReady] = useState(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(query));
  }, [projectQuery, projects]);

  const hasExactProjectMatch = useMemo(() => {
    if (!projectQuery.trim()) return false;
    const query = projectQuery.trim().toLowerCase();
    return projects.some((project) => project.title.toLowerCase() === query);
  }, [projectQuery, projects]);

  useEffect(() => {
    if (!visible) return;
    setValue(initialValue ?? '');
    setDueDate(initialProps?.dueDate ? safeParseDate(initialProps.dueDate) : null);
    setStartTime(initialProps?.startTime ? safeParseDate(initialProps.startTime) : null);
    setProjectId(initialProps?.projectId ?? null);
    setPriority((initialProps?.priority as TaskPriority) ?? null);
    if (autoRecord) return;
    const handle = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(handle);
  }, [autoRecord, visible, initialProps, initialValue]);

  useEffect(() => {
    if (prioritiesEnabled) return;
    setPriority(null);
    setShowPriorityPicker(false);
  }, [prioritiesEnabled]);

  useEffect(() => {
    if (!visible) return;
    const speech = settings.ai?.speechToText;
    if (!speech?.enabled || speech.provider !== 'whisper') return;
    const model = speech.model ?? 'whisper-tiny';
    const modelPath = speech.offlineModelPath;
    const resolved = resolveWhisperModel(model, modelPath);
    if (!resolved.exists) return;
    let cancelled = false;
    void preloadWhisperContext({ model, modelPath: resolved.path }).catch((error) => {
      if (cancelled) return;
      logCaptureWarn('Failed to preload whisper model', error);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveWhisperModel, settings.ai?.speechToText, visible]);

  const ensureAudioDirectory = useCallback(async () => {
    const candidates: Directory[] = [];
    try {
      candidates.push(Paths.document);
    } catch (error) {
      logCaptureWarn('Document directory unavailable', error);
    }
    try {
      candidates.push(Paths.cache);
    } catch (error) {
      logCaptureWarn('Cache directory unavailable', error);
    }
    for (const root of candidates) {
      try {
        const dir = new Directory(root, 'audio-captures');
        dir.create({ intermediates: true, idempotent: true });
        return dir;
      } catch (error) {
        logCaptureWarn('Failed to create audio directory', error);
      }
    }
    return null;
  }, []);

  const getExtension = (uri: string) => {
    const match = uri.match(/\.[a-z0-9]+$/i);
    return match ? match[0] : '.m4a';
  };

  const getMimeType = (extension: string) => {
    switch (extension.toLowerCase()) {
      case '.aac':
        return 'audio/aac';
      case '.mp3':
        return 'audio/mpeg';
      case '.wav':
        return 'audio/wav';
      case '.caf':
        return 'audio/x-caf';
      case '.3gp':
      case '.3gpp':
        return 'audio/3gpp';
      case '.m4a':
      default:
        return 'audio/mp4';
    }
  };

  const stripFileScheme = useCallback((uri: string) => {
    if (uri.startsWith('file://')) return uri.slice(7);
    if (uri.startsWith('file:/')) return uri.replace(/^file:\//, '/');
    return uri;
  }, []);

  const isUnsafeDeleteTarget = useCallback((uri: string) => {
    if (!uri) return true;
    const normalized = stripFileScheme(uri).replace(/\/+$/, '');
    const docBase = stripFileScheme(Paths.document?.uri ?? '').replace(/\/+$/, '');
    const cacheBase = stripFileScheme(Paths.cache?.uri ?? '').replace(/\/+$/, '');
    if (!normalized) return true;
    if (normalized === '/' || normalized === docBase || normalized === cacheBase) return true;
    return false;
  }, [stripFileScheme]);

  const safeDeleteFile = useCallback((file: File, reason: string) => {
    try {
      const uri = file.uri ?? '';
      if (isUnsafeDeleteTarget(uri)) {
        logCaptureWarn('Refusing to delete unsafe file target', new Error(`${reason}:${uri}`));
        return;
      }
      const info = Paths.info(uri);
      if (info?.exists && info.isDirectory) {
        logCaptureWarn('Refusing to delete directory target', new Error(`${reason}:${uri}`));
        return;
      }
      file.delete();
    } catch (error) {
      logCaptureWarn('Audio cleanup failed', error);
    }
  }, [isUnsafeDeleteTarget]);

  const buildWhisperDiagnostics = useCallback(
    (modelId: string, modelPath?: string, resolvedPath?: string, resolvedExists?: boolean) => {
      const docUri = Paths.document?.uri ?? '';
      const cacheUri = Paths.cache?.uri ?? '';
      let documentExists = false;
      let cacheExists = false;
      let whisperDirExists = false;
      const normalizedDoc = docUri ? stripFileScheme(docUri) : '';
      const normalizedCache = cacheUri ? stripFileScheme(cacheUri) : '';
      const whisperDirUri = normalizedDoc ? `${normalizedDoc}/whisper-models` : '';
      try {
        if (normalizedDoc) {
          documentExists = new Directory(`file://${normalizedDoc}`).exists;
        }
      } catch {
      }
      try {
        if (normalizedCache) {
          cacheExists = new Directory(`file://${normalizedCache}`).exists;
        }
      } catch {
      }
      try {
        if (whisperDirUri) {
          whisperDirExists = new Directory(`file://${whisperDirUri}`).exists;
        }
      } catch {
      }
      return {
        modelId,
        modelPath: modelPath ?? '',
        resolvedPath: resolvedPath ?? '',
        resolvedExists: String(Boolean(resolvedExists)),
        documentUri: normalizedDoc,
        documentExists: String(documentExists),
        cacheUri: normalizedCache,
        cacheExists: String(cacheExists),
        whisperDirUri,
        whisperDirExists: String(whisperDirExists),
      };
    },
    [stripFileScheme]
  );

  const resolveWhisperModel = useCallback(
    (modelId: string, storedPath?: string) => {
      const resolved = ensureWhisperModelPathForConfig(modelId, storedPath);
      if (resolved.exists) {
        const currentPath = storedPath ? stripFileScheme(storedPath) : '';
        const resolvedPath = stripFileScheme(resolved.uri);
        if (!currentPath || currentPath !== resolvedPath) {
          updateSpeechSettings({ model: modelId, offlineModelPath: resolved.uri });
        }
      }
      return resolved;
    },
    [stripFileScheme, updateSpeechSettings]
  );

  const buildTaskProps = useCallback(async (fallbackTitle: string, extraProps?: Partial<Task>) => {
    const trimmed = value.trim();
    let finalTitle = trimmed || fallbackTitle;
    let projectTitle: string | undefined;
    let parsedProps: Partial<Task> = {};

    if (trimmed) {
      const parsed = parseQuickAdd(trimmed, projects, new Date(), areas);
      finalTitle = parsed.title || trimmed;
      parsedProps = parsed.props;
      projectTitle = parsed.projectTitle;
    }

    const initialPropsMerged: Partial<Task> = { status: 'inbox', ...initialProps, ...parsedProps, ...extraProps };
    if (!initialPropsMerged.status) initialPropsMerged.status = 'inbox';

    if (!initialPropsMerged.projectId && projectTitle) {
      const created = await addProject(projectTitle, '#94a3b8');
      if (!created) return { title: finalTitle, props: initialPropsMerged };
      initialPropsMerged.projectId = created.id;
    }

    if (projectId) initialPropsMerged.projectId = projectId;
    if (prioritiesEnabled && priority) initialPropsMerged.priority = priority;
    if (dueDate) initialPropsMerged.dueDate = dueDate.toISOString();
    if (startTime) initialPropsMerged.startTime = startTime.toISOString();

    return { title: finalTitle, props: initialPropsMerged };
  }, [addProject, dueDate, initialProps, prioritiesEnabled, priority, projectId, projects, startTime, value]);

  const applySpeechResult = useCallback(async (taskId: string, result: SpeechToTextResult) => {
    const { tasks: currentTasks, projects: currentProjects, addProject: addProjectNow, updateTask: updateTaskNow, settings: currentSettings } = useTaskStore.getState();
    const existing = currentTasks.find((task) => task.id === taskId);
    if (!existing) return;

    const updates: Partial<Task> = {};
    const mode = currentSettings.ai?.speechToText?.mode ?? 'smart_parse';
    const fieldStrategy = currentSettings.ai?.speechToText?.fieldStrategy ?? 'smart';
    const transcript = result.transcript?.trim();

    if (mode === 'transcribe_only') {
      if (transcript) {
        if (fieldStrategy === 'description_only') {
          updates.description = transcript;
        } else if (fieldStrategy === 'title_only') {
          updates.title = transcript;
        } else {
          const wordCount = transcript.split(/\s+/).filter(Boolean).length;
          if (wordCount <= 15) {
            updates.title = transcript;
          } else {
            updates.description = transcript;
          }
        }
      }
    } else {
      if (result.title && result.title.trim()) updates.title = result.title.trim();
      if (result.description !== undefined && result.description !== null) {
        const desc = result.description.trim();
        updates.description = desc ? desc : undefined;
      }
      if (!updates.title && transcript) {
        if (fieldStrategy === 'description_only') {
          updates.description = transcript;
        } else if (fieldStrategy === 'title_only') {
          updates.title = transcript;
        } else {
          const wordCount = transcript.split(/\s+/).filter(Boolean).length;
          if (wordCount <= 15) {
            updates.title = transcript;
          } else {
            const words = transcript.split(/\s+/).filter(Boolean);
            updates.title = `${words.slice(0, 7).join(' ')}...`;
            if (!updates.description) {
              updates.description = transcript;
            }
          }
        }
      }
    }

    if (result.dueDate) {
      const parsed = safeParseDate(result.dueDate);
      if (parsed) updates.dueDate = parsed.toISOString();
    }
    if (result.startTime) {
      const parsed = safeParseDate(result.startTime);
      if (parsed) updates.startTime = parsed.toISOString();
    }

    const normalizeList = (items: string[] | null | undefined, prefix: string) => {
      if (!Array.isArray(items)) return [];
      return items
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (item.startsWith(prefix) ? item : `${prefix}${item}`));
    };

    const nextTags = normalizeList(result.tags ?? [], '#');
    const nextContexts = normalizeList(result.contexts ?? [], '@');
    if (nextTags.length) {
      updates.tags = Array.from(new Set([...(existing.tags ?? []), ...nextTags]));
    }
    if (nextContexts.length) {
      updates.contexts = Array.from(new Set([...(existing.contexts ?? []), ...nextContexts]));
    }

    if (result.projectTitle && !existing.projectId) {
      const trimmed = typeof result.projectTitle === 'string' ? result.projectTitle.trim() : '';
      if (trimmed) {
        const match = currentProjects.find((project) => project.title.toLowerCase() === trimmed.toLowerCase());
        if (match) {
          updates.projectId = match.id;
        } else {
          const created = await addProjectNow(trimmed, '#94a3b8');
          if (!created) return;
          updates.projectId = created.id;
        }
      }
    }

    if (Object.keys(updates).length) {
      await updateTaskNow(taskId, updates);
    }
  }, []);

  const resetState = () => {
    setValue('');
    setDueDate(null);
    setStartTime(null);
    setProjectId(null);
    setPriority(null);
    setProjectQuery('');
    setShowProjectPicker(false);
    setShowPriorityPicker(false);
    setShowDatePicker(false);
    setStartPickerMode(null);
    setPendingStartDate(null);
  };

  const handleClose = () => {
    if (recording && !recordingBusy) {
      void stopRecording({ saveTask: false });
    }
    setRecordingReady(false);
    resetState();
    onClose();
  };

  const handleSave = async () => {
    if (!value.trim()) return;
    const { title, props } = await buildTaskProps(value.trim());
    if (!title.trim()) return;

    await addTask(title, props);

    if (addAnother) {
      setValue('');
      const handle = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(handle);
    }

    handleClose();
  };

  const startRecording = useCallback(async () => {
    if (recording || recordingBusy) return;
    setRecordingBusy(true);
    setRecordingReady(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('quickAdd.audioPermissionTitle'), t('quickAdd.audioPermissionBody'));
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        interruptionModeAndroid: 'duckOthers',
      });
      const speech = settings.ai?.speechToText;
      const provider = speech?.provider ?? 'gemini';
      const model = speech?.model ?? (provider === 'openai' ? 'gpt-4o-transcribe' : provider === 'gemini' ? 'gemini-2.5-flash' : 'whisper-tiny');
      const modelPath = provider === 'whisper' ? speech?.offlineModelPath : undefined;
      const whisperResolved = provider === 'whisper'
        ? resolveWhisperModel(model, modelPath)
        : null;
      const whisperModelReady = provider === 'whisper' ? Boolean(whisperResolved?.exists) : false;
      const resolvedModelPath = provider === 'whisper'
        ? (whisperResolved?.exists ? whisperResolved.path : modelPath)
        : undefined;
      const useWhisperRealtime = speech?.enabled && provider === 'whisper' && whisperModelReady;

      if (useWhisperRealtime) {
        try {
          const now = new Date();
          const timestamp = safeFormatDate(now, 'yyyyMMdd-HHmmss');
          const directory = await ensureAudioDirectory();
          const fileName = `mindwtr-audio-${timestamp}.wav`;
          const buildOutputFile = (base?: Directory | null) => {
            if (!base?.uri) return null;
            const baseUri = base.uri.endsWith('/') ? base.uri : `${base.uri}/`;
            return new File(`${baseUri}${fileName}`);
          };
          let outputFile: File | null = buildOutputFile(directory);
          if (!outputFile) {
            try {
              outputFile = buildOutputFile(Paths.cache);
            } catch (error) {
              logCaptureWarn('Whisper cache directory unavailable', error);
            }
          }
          if (!outputFile) {
            try {
              outputFile = buildOutputFile(Paths.document);
            } catch (error) {
              logCaptureWarn('Whisper document directory unavailable', error);
            }
          }
          if (!outputFile) {
            throw new Error('Whisper audio output path unavailable');
          }
          const outputPath = stripFileScheme(outputFile.uri);
          const handle = await startWhisperRealtimeCapture(outputPath, {
            provider,
            model,
            modelPath: resolvedModelPath,
            language: speech?.language,
            mode: speech?.mode ?? 'smart_parse',
            fieldStrategy: speech?.fieldStrategy ?? 'smart',
          });
          void logInfo('Speech-to-text starting', {
            scope: 'speech',
            extra: {
              provider,
              model,
              mode: speech?.mode ?? 'smart_parse',
              fieldStrategy: speech?.fieldStrategy ?? 'smart',
              language: speech?.language ?? 'auto',
              hasModelPath: String(Boolean(resolvedModelPath)),
            },
          });
          setRecording({ kind: 'whisper', stop: handle.stop, result: handle.result, file: outputFile });
          setRecordingReady(true);
          return;
        } catch (error) {
          logCaptureWarn('Whisper realtime start failed, falling back to audio recording', error);
        }
      }

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecording({ kind: 'expo' });
      setRecordingReady(true);
    } catch (error) {
      logCaptureError('Failed to start recording', error);
      Alert.alert(t('quickAdd.audioErrorTitle'), t('quickAdd.audioErrorBody'));
      setRecordingReady(false);
    } finally {
      setRecordingBusy(false);
    }
  }, [
    audioRecorder,
    ensureAudioDirectory,
    recording,
    recordingBusy,
    buildWhisperDiagnostics,
    resolveWhisperModel,
    settings.ai?.speechToText,
    stripFileScheme,
    t,
  ]);

  const stopRecording = useCallback(async ({ saveTask }: { saveTask: boolean }) => {
    if (recordingBusy) return;
    const currentRecording = recording;
    if (!currentRecording) return;
    setRecordingBusy(true);
    setRecordingReady(false);
    setRecording(null);
    try {
      if (currentRecording.kind === 'whisper') {
        try {
          await currentRecording.stop();
        } catch (error) {
          logCaptureWarn('Failed to stop whisper recording', error);
        }
        if (!saveTask) {
          void currentRecording.result.catch((error) => logCaptureWarn('Speech-to-text failed', error));
          try {
            safeDeleteFile(currentRecording.file, 'whisper_cancel');
          } catch (error) {
            logCaptureWarn('Audio cleanup failed', error);
          }
          return;
        }

        const finalFile = currentRecording.file;
        let fileInfo: { exists?: boolean; size?: number } | null = null;
        try {
          fileInfo = finalFile.info();
        } catch (error) {
          logCaptureWarn('Audio info lookup failed', error);
        }
        const now = new Date();
        const nowIso = now.toISOString();
        const displayTitle = `${t('quickAdd.audioNoteTitle')} ${safeFormatDate(now, 'MMM d, HH:mm')}`;
        const speech = settings.ai?.speechToText;
        const provider = speech?.provider ?? 'gemini';
        const model = speech?.model ?? (provider === 'openai' ? 'gpt-4o-transcribe' : provider === 'gemini' ? 'gemini-2.5-flash' : 'whisper-tiny');
        const apiKey = provider === 'whisper' ? '' : await loadAIKey(provider).catch(() => '');
        const modelPath = provider === 'whisper' ? speech?.offlineModelPath : undefined;
        const whisperResolved = provider === 'whisper'
          ? resolveWhisperModel(model, modelPath)
          : null;
        const whisperModelReady = provider === 'whisper' ? Boolean(whisperResolved?.exists) : false;
        const resolvedModelPath = provider === 'whisper'
          ? (whisperResolved?.exists ? whisperResolved.path : modelPath)
          : undefined;

        const speechReady = speech?.enabled
          ? provider === 'whisper'
            ? whisperModelReady
            : Boolean(apiKey)
          : false;
        const saveAudioAttachments = settings.gtd?.saveAudioAttachments !== false || !speechReady;
        void logInfo('Audio attachment decision', {
          scope: 'capture',
          extra: {
            provider,
            speechReady: String(Boolean(speechReady)),
            saveAudioAttachments: String(Boolean(saveAudioAttachments)),
            settingSaveAudio: String(settings.gtd?.saveAudioAttachments ?? 'unset'),
          },
        });

        let attachment: Attachment | null = saveAudioAttachments ? {
          id: generateUUID(),
          kind: 'file',
          title: displayTitle,
          uri: finalFile.uri,
          mimeType: getMimeType('.wav'),
          size: fileInfo?.exists && fileInfo.size ? fileInfo.size : undefined,
          createdAt: nowIso,
          updatedAt: nowIso,
          localStatus: 'available',
        } : null;
        if (attachment) {
          try {
            const beforeUri = attachment.uri;
            attachment = await persistAttachmentLocally(attachment);
            void logInfo('Audio attachment persisted', {
              scope: 'capture',
              extra: {
                from: beforeUri,
                to: attachment.uri,
                size: String(attachment.size ?? ''),
              },
            });
          } catch (error) {
            logCaptureWarn('Failed to persist audio attachment', error);
          }
        }

        const taskId = generateUUID();
        const attachments = [...(initialProps?.attachments ?? [])];
        if (attachment) attachments.push(attachment);
        const { title, props } = await buildTaskProps(displayTitle, {
          id: taskId,
          attachments,
        });
        if (!title.trim()) return;

        await addTask(title, props);
        handleClose();

        if (!speechReady) {
          const diag = provider === 'whisper'
            ? buildWhisperDiagnostics(model, modelPath, resolvedModelPath, whisperModelReady)
            : undefined;
          void logInfo('Speech-to-text skipped: not ready', {
            scope: 'speech',
            extra: {
              provider,
              enabled: String(Boolean(speech?.enabled)),
              hasModelPath: String(Boolean(resolvedModelPath)),
              hasModelFile: String(whisperModelReady),
              hasApiKey: String(Boolean(apiKey)),
              mode: speech?.mode ?? 'smart_parse',
              ...(diag ?? {}),
            },
          });
        }

        if (speechReady) {
          currentRecording.result
            .then((result) => applySpeechResult(taskId, result))
            .catch((error) => logCaptureWarn('Speech-to-text failed', error))
            .finally(() => {
              if (!saveAudioAttachments) {
                safeDeleteFile(finalFile, 'whisper_cleanup');
              }
            });
        } else if (!saveAudioAttachments) {
          safeDeleteFile(finalFile, 'whisper_skip_cleanup');
        }
        return;
      }

      try {
        await audioRecorder.stop();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('not recording') && !message.includes('already')) {
          throw error;
        }
      }
      const uri = audioRecorder.uri;
      if (!uri) {
        throw new Error('Recording URI missing');
      }
      if (!saveTask) return;

      const now = new Date();
      const timestamp = safeFormatDate(now, 'yyyyMMdd-HHmmss');
      const extension = getExtension(uri);
      const directory = await ensureAudioDirectory();
      const fileName = `mindwtr-audio-${timestamp}${extension}`;
      const sourceFile = new File(uri);
      const destinationFile = directory ? new File(directory, fileName) : null;
      let finalFile = sourceFile;

      if (destinationFile) {
        try {
          sourceFile.move(destinationFile);
          finalFile = destinationFile;
        } catch (error) {
            logCaptureWarn('Move recording failed, falling back to copy', error);
            try {
              sourceFile.copy(destinationFile);
            safeDeleteFile(sourceFile, 'recording_copy_cleanup');
            finalFile = destinationFile;
          } catch (copyError) {
            logCaptureWarn('Copy recording failed, using original file', copyError);
            finalFile = sourceFile;
          }
        }
      }

      let fileInfo: { exists?: boolean; size?: number } | null = null;
      try {
        fileInfo = finalFile.info();
      } catch (error) {
        logCaptureWarn('Audio info lookup failed', error);
      }
      const nowIso = now.toISOString();
      const displayTitle = `${t('quickAdd.audioNoteTitle')} ${safeFormatDate(now, 'MMM d, HH:mm')}`;
      const speech = settings.ai?.speechToText;
      const provider = speech?.provider ?? 'gemini';
      const model = speech?.model ?? (provider === 'openai' ? 'gpt-4o-transcribe' : provider === 'gemini' ? 'gemini-2.5-flash' : 'whisper-tiny');
      const apiKey = provider === 'whisper' ? '' : await loadAIKey(provider).catch(() => '');
      const modelPath = provider === 'whisper' ? speech?.offlineModelPath : undefined;
      const whisperResolved = provider === 'whisper'
        ? resolveWhisperModel(model, modelPath)
        : null;
      const whisperModelReady = provider === 'whisper' ? Boolean(whisperResolved?.exists) : false;
      const resolvedModelPath = provider === 'whisper'
        ? (whisperResolved?.exists ? whisperResolved.path : modelPath)
        : undefined;

      const speechReady = speech?.enabled
        ? provider === 'whisper'
          ? whisperModelReady
          : Boolean(apiKey)
        : false;
      const saveAudioAttachments = settings.gtd?.saveAudioAttachments !== false || !speechReady;
      void logInfo('Audio attachment decision', {
        scope: 'capture',
        extra: {
          provider,
          speechReady: String(Boolean(speechReady)),
          saveAudioAttachments: String(Boolean(saveAudioAttachments)),
          settingSaveAudio: String(settings.gtd?.saveAudioAttachments ?? 'unset'),
        },
      });

      const audioUri = finalFile.uri;
      let attachment: Attachment | null = saveAudioAttachments ? {
        id: generateUUID(),
        kind: 'file',
        title: displayTitle,
        uri: audioUri,
        mimeType: getMimeType(extension),
        size: fileInfo?.exists && fileInfo.size ? fileInfo.size : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
        localStatus: 'available',
      } : null;
      if (attachment) {
        try {
          const beforeUri = attachment.uri;
          attachment = await persistAttachmentLocally(attachment);
          void logInfo('Audio attachment persisted', {
            scope: 'capture',
            extra: {
              from: beforeUri,
              to: attachment.uri,
              size: String(attachment.size ?? ''),
            },
          });
        } catch (error) {
          logCaptureWarn('Failed to persist audio attachment', error);
        }
      }

      const taskId = generateUUID();
      const attachments = [...(initialProps?.attachments ?? [])];
      if (attachment) attachments.push(attachment);
      const { title, props } = await buildTaskProps(displayTitle, {
        id: taskId,
        attachments,
      });
      if (!title.trim()) return;

      await addTask(title, props);
      handleClose();

      if (!speechReady) {
        const diag = provider === 'whisper'
          ? buildWhisperDiagnostics(model, modelPath, resolvedModelPath, whisperModelReady)
          : undefined;
        void logInfo('Speech-to-text skipped: not ready', {
          scope: 'speech',
          extra: {
            provider,
            enabled: String(Boolean(speech?.enabled)),
            hasModelPath: String(Boolean(resolvedModelPath)),
            hasModelFile: String(whisperModelReady),
            hasApiKey: String(Boolean(apiKey)),
            mode: speech?.mode ?? 'smart_parse',
            ...(diag ?? {}),
          },
        });
      }

      if (speechReady) {
        const timeZone = typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined;
        void logInfo('Speech-to-text starting', {
          scope: 'speech',
          extra: {
            provider,
            model,
            mode: speech?.mode ?? 'smart_parse',
            fieldStrategy: speech?.fieldStrategy ?? 'smart',
            language: speech?.language ?? 'auto',
            hasModelPath: String(Boolean(resolvedModelPath)),
          },
        });
        void processAudioCapture(audioUri, {
          provider,
          apiKey,
          model,
          modelPath: resolvedModelPath,
          language: speech?.language,
          mode: speech?.mode ?? 'smart_parse',
          fieldStrategy: speech?.fieldStrategy ?? 'smart',
          parseModel: provider === 'openai' && settings.ai?.provider === 'openai' ? settings.ai?.model : undefined,
          now: new Date(),
          timeZone,
        })
          .then((result) => applySpeechResult(taskId, result))
          .catch((error) => logCaptureWarn('Speech-to-text failed', error))
          .finally(() => {
            if (!saveAudioAttachments) {
              safeDeleteFile(finalFile, 'expo_cleanup');
            }
          });
      } else if (!saveAudioAttachments) {
        safeDeleteFile(finalFile, 'expo_skip_cleanup');
      }
    } catch (error) {
      logCaptureError('Failed to save recording', error);
      Alert.alert(t('quickAdd.audioErrorTitle'), t('quickAdd.audioErrorBody'));
    } finally {
      setRecordingBusy(false);
    }
  }, [
    addTask,
    audioRecorder,
    applySpeechResult,
    buildTaskProps,
    ensureAudioDirectory,
    handleClose,
    initialProps?.attachments,
    recording,
    recordingBusy,
    resolveWhisperModel,
    settings.ai?.model,
    settings.ai?.provider,
    settings.ai?.speechToText,
    t,
  ]);

  useEffect(() => {
    if (visible && autoRecord && !recording && !recordingBusy) {
      const handle = setTimeout(() => {
        void startRecording();
      }, 150);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [autoRecord, recording, recordingBusy, startRecording, visible]);

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;
  const dueLabel = dueDate ? safeFormatDate(dueDate, 'MMM d') : t('taskEdit.dueDateLabel');
  const startLabel = startTime ? safeFormatDate(startTime, 'MMM d, HH:mm') : t('calendar.scheduleAction');
  const projectLabel = selectedProject ? selectedProject.title : t('taskEdit.projectLabel');
  const priorityLabel = priority ? t(`priority.${priority}`) : t('taskEdit.priorityLabel');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 24 : 0}
        style={styles.keyboardAvoiding}
      >
        <View style={[styles.sheet, { backgroundColor: tc.cardBg, paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: tc.text }]}>{t('nav.addTask')}</Text>
            <TouchableOpacity onPress={handleClose} accessibilityLabel={t('common.close')}>
              <X size={18} color={tc.secondaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
              placeholder={t('quickAdd.placeholder')}
              placeholderTextColor={tc.secondaryText}
              value={value}
              onChangeText={setValue}
              onSubmitEditing={handleSave}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={() => {
                if (recording) {
                  void stopRecording({ saveTask: true });
                } else {
                  void startRecording();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={recording ? t('quickAdd.audioStop') : t('quickAdd.audioRecord')}
              style={[
                styles.recordButton,
                {
                  backgroundColor: recordingReady ? tc.danger : tc.filterBg,
                  borderColor: tc.border,
                  opacity: recordingBusy ? 0.6 : 1,
                },
              ]}
              disabled={recordingBusy}
            >
              {recordingReady ? (
                <Square size={16} color={tc.onTint} />
              ) : (
                <Mic size={16} color={tc.text} />
              )}
            </TouchableOpacity>
          </View>

          {recordingReady && (
            <View style={styles.recordingRow}>
              <View style={[styles.recordingDot, { backgroundColor: tc.danger }]} />
              <Text style={[styles.recordingText, { color: tc.danger }]}>{t('quickAdd.audioRecording')}</Text>
            </View>
          )}

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
              onPress={() => {
                setPendingStartDate(null);
                setStartPickerMode('date');
              }}
              onLongPress={() => setStartTime(null)}
            >
              <Clock size={16} color={tc.text} />
              <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{startLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
              onPress={() => setShowDatePicker(true)}
              onLongPress={() => setDueDate(null)}
            >
              <CalendarDays size={16} color={tc.text} />
              <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{dueLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
              onPress={() => setShowProjectPicker(true)}
              onLongPress={() => setProjectId(null)}
            >
              <Folder size={16} color={tc.text} />
              <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{projectLabel}</Text>
            </TouchableOpacity>

            {prioritiesEnabled && (
              <TouchableOpacity
                style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
                onPress={() => setShowPriorityPicker(true)}
                onLongPress={() => setPriority(null)}
              >
                <Flag size={16} color={tc.text} />
                <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{priorityLabel}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.toggleRow}>
              <Switch
                value={addAnother}
                onValueChange={setAddAnother}
                thumbColor={addAnother ? tc.tint : tc.border}
                trackColor={{ false: tc.border, true: `${tc.tint}55` }}
              />
              <Text style={[styles.toggleText, { color: tc.text }]}>{t('quickAdd.addAnother')}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveButton, { backgroundColor: tc.tint, opacity: value.trim() ? 1 : 0.5 }]}
              disabled={!value.trim()}
            >
              <Text style={styles.saveText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {showDatePicker && (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selectedDate) => {
            if (event.type === 'dismissed') {
              setShowDatePicker(false);
              return;
            }
            if (Platform.OS !== 'ios') {
              setShowDatePicker(false);
            }
            if (selectedDate) setDueDate(selectedDate);
          }}
        />
      )}

      {startPickerMode && (
        <DateTimePicker
          value={(() => {
            if (Platform.OS === 'ios') return startTime ?? new Date();
            if (startPickerMode === 'time') return pendingStartDate ?? startTime ?? new Date();
            return startTime ?? new Date();
          })()}
          mode={Platform.OS === 'ios' ? 'datetime' : startPickerMode}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selectedDate) => {
            if (event.type === 'dismissed') {
              setStartPickerMode(null);
              setPendingStartDate(null);
              return;
            }
            if (!selectedDate) return;
            if (Platform.OS === 'ios') {
              setStartTime(selectedDate);
              return;
            }
            if (startPickerMode === 'date') {
              const base = new Date(selectedDate);
              const existing = startTime ?? pendingStartDate;
              if (existing) {
                base.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
              }
              setPendingStartDate(base);
              setStartPickerMode('time');
              return;
            }
            const base = pendingStartDate ?? startTime ?? new Date();
            const combined = new Date(base);
            combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
            setStartTime(combined);
            setPendingStartDate(null);
            setStartPickerMode(null);
          }}
        />
      )}

      <Modal
        visible={showProjectPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setShowProjectPicker(false)} />
          <View style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>            
            <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('taskEdit.projectLabel')}</Text>
            <TextInput
              value={projectQuery}
              onChangeText={setProjectQuery}
              placeholder={t('projects.addPlaceholder')}
              placeholderTextColor={tc.secondaryText}
              style={[styles.pickerInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
            />
            {!hasExactProjectMatch && projectQuery.trim() && (
              <Pressable
                onPress={async () => {
                  const title = projectQuery.trim();
                  if (!title) return;
                  const created = await addProject(title, '#94a3b8');
                  if (!created) return;
                  setProjectId(created.id);
                  setShowProjectPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.tint }]}>+ {t('projects.create')} &quot;{projectQuery.trim()}&quot;</Text>
              </Pressable>
            )}
            <ScrollView style={[styles.pickerList, { borderColor: tc.border }]} contentContainerStyle={styles.pickerListContent}>
              <Pressable
                onPress={() => {
                  setProjectId(null);
                  setShowProjectPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.text }]}>{t('taskEdit.noProjectOption')}</Text>
              </Pressable>
              {filteredProjects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => {
                    setProjectId(project.id);
                    setShowProjectPicker(false);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={[styles.pickerRowText, { color: tc.text }]}>{project.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {prioritiesEnabled && (
        <Modal
          visible={showPriorityPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPriorityPicker(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.overlayBackdrop} onPress={() => setShowPriorityPicker(false)} />
            <View style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>            
              <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('taskEdit.priorityLabel')}</Text>
              <Pressable
                onPress={() => {
                  setPriority(null);
                  setShowPriorityPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.text }]}>{t('common.clear')}</Text>
              </Pressable>
              {PRIORITY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setPriority(option);
                    setShowPriorityPicker(false);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={[styles.pickerRowText, { color: tc.text }]}>{t(`priority.${option}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  keyboardAvoiding: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  optionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  footerRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickerInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  pickerList: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 220,
  },
  pickerListContent: {
    paddingVertical: 6,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
