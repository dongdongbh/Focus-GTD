import { getNextScheduledAt, type Language, Task, type Project, useTaskStore, parseTimeOfDay, getTranslations, loadStoredLanguage, safeParseDate, hasTimeComponent, getSystemDefaultLanguage } from '@mindwtr/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { logWarn } from './app-log';

type NotificationsApi = typeof import('expo-notifications');
type NotificationContentInput = {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  categoryIdentifier?: string;
};
type NotificationResponse = {
  notification?: {
    request?: {
      identifier?: string;
      content?: {
        data?: Record<string, unknown>;
      };
    };
  };
  actionIdentifier?: string;
};
type Subscription = { remove: () => void };

type ScheduledEntry = { scheduledAtIso: string; notificationId: string };
type NotificationOpenPayload = {
  notificationId?: string;
  actionIdentifier?: string;
  taskId?: string;
  projectId?: string;
  kind?: string;
};
type NotificationOpenHandler = (payload: NotificationOpenPayload) => void;
type ScheduledNotificationRequest = {
  identifier?: string;
  trigger?: unknown;
  content?: {
    data?: Record<string, unknown>;
  };
};

const scheduledByTask = new Map<string, ScheduledEntry>();
const taskIdByNotificationId = new Map<string, string>();
const scheduledByProject = new Map<string, ScheduledEntry>();
const scheduledDigestByKind = new Map<'morning' | 'evening', string>();
let digestConfigKey: string | null = null;
let weeklyReviewConfigKey: string | null = null;
let scheduledWeeklyReviewId: string | null = null;
let started = false;
let responseSubscription: Subscription | null = null;
let storeSubscription: (() => void) | null = null;
let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
let rescheduleQueue: Promise<void> = Promise.resolve();
let notificationOpenHandler: NotificationOpenHandler | null = null;
let lastHandledNotificationResponseKey: string | null = null;

let Notifications: NotificationsApi | null = null;
const ANDROID_NOTIFICATION_CHANNEL_ID = 'mindwtr-reminders';
const DIGEST_MORNING_NOTIFICATION_ID = 'mindwtr-digest-morning';
const DIGEST_EVENING_NOTIFICATION_ID = 'mindwtr-digest-evening';
const WEEKLY_REVIEW_NOTIFICATION_ID = 'mindwtr-weekly-review';
const TASK_NOTIFICATION_ID_PREFIX = 'mindwtr-task-';
const PROJECT_NOTIFICATION_ID_PREFIX = 'mindwtr-project-';

function getTaskNotificationIdentifier(taskId: string): string {
  return `${TASK_NOTIFICATION_ID_PREFIX}${taskId}`;
}

function getProjectNotificationIdentifier(projectId: string): string {
  return `${PROJECT_NOTIFICATION_ID_PREFIX}${projectId}`;
}

function getTaskIdFromNotificationIdentifier(notificationId: string | undefined): string | undefined {
  if (!notificationId || !notificationId.startsWith(TASK_NOTIFICATION_ID_PREFIX)) return undefined;
  const taskId = notificationId.slice(TASK_NOTIFICATION_ID_PREFIX.length);
  return taskId || undefined;
}

const logNotificationError = (message: string, error?: unknown) => {
  const extra = error ? { error: error instanceof Error ? error.message : String(error) } : undefined;
  void logWarn(`[Notifications] ${message}`, { scope: 'notifications', extra });
};

const triggerMatches = (api: NotificationsApi, trigger: unknown, kind: 'daily' | 'weekly'): boolean => {
  if (!trigger || typeof trigger !== 'object') return false;
  const triggerRecord = trigger as Record<string, unknown>;
  const rawType = triggerRecord.type;

  if (typeof rawType === 'string' || typeof rawType === 'number') {
    const expected = kind === 'daily'
      ? api.SchedulableTriggerInputTypes.DAILY
      : api.SchedulableTriggerInputTypes.WEEKLY;
    return String(rawType).toLowerCase() === String(expected).toLowerCase();
  }

  // Fallback for platform-specific trigger objects missing an explicit "type".
  const hasHour = typeof triggerRecord.hour === 'number';
  const hasMinute = typeof triggerRecord.minute === 'number';
  const hasWeekday = typeof triggerRecord.weekday === 'number';
  if (!hasHour || !hasMinute) return false;
  return kind === 'daily' ? !hasWeekday : hasWeekday;
};

async function getScheduledIdsByTriggerKind(api: NotificationsApi, kind: 'daily' | 'weekly'): Promise<string[]> {
  if (typeof api.getAllScheduledNotificationsAsync !== 'function') return [];
  try {
    const scheduled = await api.getAllScheduledNotificationsAsync();
    if (!Array.isArray(scheduled)) return [];
    const ids: string[] = [];
    for (const entry of scheduled as ScheduledNotificationRequest[]) {
      if (typeof entry.identifier !== 'string') continue;
      if (!triggerMatches(api, entry.trigger, kind)) continue;
      ids.push(entry.identifier);
    }
    return ids;
  } catch (error) {
    logNotificationError(`Failed to load scheduled ${kind} notifications`, error);
    return [];
  }
}

const clearRescheduleTimer = () => {
  if (rescheduleTimer) {
    clearTimeout(rescheduleTimer);
    rescheduleTimer = null;
  }
};

export function setNotificationOpenHandler(handler: NotificationOpenHandler | null): void {
  notificationOpenHandler = handler;
}

const normalizeNotificationData = (data?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!data) return undefined;
  try {
    const json = JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

const scheduleNotification = async (
  api: NotificationsApi,
  request: { identifier?: string; content: NotificationContentInput; trigger: unknown },
  context: string,
) => {
  const trigger = (() => {
    if (Platform.OS !== 'android') return request.trigger;
    if (!request.trigger || typeof request.trigger !== 'object' || request.trigger instanceof Date) {
      return request.trigger;
    }
    const triggerObject = request.trigger as Record<string, unknown>;
    if ('channelId' in triggerObject) return request.trigger;
    return { ...triggerObject, channelId: ANDROID_NOTIFICATION_CHANNEL_ID };
  })();
  try {
    return await api.scheduleNotificationAsync({
      ...request,
      content: {
        ...request.content,
        data: normalizeNotificationData(request.content.data),
      },
      trigger,
    } as any);
  } catch (error) {
    logNotificationError(`Failed to schedule ${context}`, error);
    return null;
  }
};

async function loadNotifications(): Promise<NotificationsApi | null> {
  if (Notifications) return Notifications;

  // Skip notifications in Expo Go (not supported in newer SDKs)
  if (Constants.appOwnership === 'expo') {
    return null;
  }

  try {
    const mod = await import('expo-notifications');
    Notifications = mod;
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return mod;
  } catch (error) {
    logNotificationError('expo-notifications unavailable', error);
    return null;
  }
}

async function getCurrentLanguage(): Promise<Language> {
  try {
    return await loadStoredLanguage(AsyncStorage, getSystemDefaultLanguage());
  } catch {
    return getSystemDefaultLanguage();
  }
}

type NotificationPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
};

async function ensurePermission(api: NotificationsApi): Promise<NotificationPermissionResult> {
  const current = await api.getPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true, canAskAgain: current.canAskAgain ?? true };
  }
  if (current.canAskAgain === false) {
    return { granted: false, canAskAgain: false };
  }
  const request = await api.requestPermissionsAsync();
  return { granted: request.status === 'granted', canAskAgain: request.canAskAgain ?? true };
}

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  const api = await loadNotifications();
  if (!api) return { granted: false, canAskAgain: false };
  try {
    return await ensurePermission(api);
  } catch (error) {
    logNotificationError('Failed to request notification permission', error);
    return { granted: false, canAskAgain: false };
  }
}

async function cancelDailyDigests(api: NotificationsApi) {
  const scheduledDailyIds = await getScheduledIdsByTriggerKind(api, 'daily');
  const ids = new Set<string>([
    DIGEST_MORNING_NOTIFICATION_ID,
    DIGEST_EVENING_NOTIFICATION_ID,
    ...scheduledDailyIds,
    ...scheduledDigestByKind.values(),
  ]);
  for (const id of ids) {
    await api.cancelScheduledNotificationAsync(id).catch((error) => logNotificationError('Failed to cancel daily digest', error));
  }
  scheduledDigestByKind.clear();
}

async function cancelWeeklyReview(api: NotificationsApi) {
  const scheduledWeeklyIds = await getScheduledIdsByTriggerKind(api, 'weekly');
  const ids = new Set<string>([
    WEEKLY_REVIEW_NOTIFICATION_ID,
    ...scheduledWeeklyIds,
  ]);
  if (scheduledWeeklyReviewId) {
    ids.add(scheduledWeeklyReviewId);
  }
  for (const id of ids) {
    await api.cancelScheduledNotificationAsync(id).catch((error) => logNotificationError('Failed to cancel weekly review', error));
  }
  scheduledWeeklyReviewId = null;
}

async function rescheduleDailyDigest(api: NotificationsApi) {
  const { settings } = useTaskStore.getState();

  const notificationsEnabled = settings.notificationsEnabled !== false;
  const morningEnabled = settings.dailyDigestMorningEnabled === true;
  const eveningEnabled = settings.dailyDigestEveningEnabled === true;
  const morningTime = settings.dailyDigestMorningTime || '09:00';
  const eveningTime = settings.dailyDigestEveningTime || '20:00';

  const nextKey = JSON.stringify({
    notificationsEnabled,
    morningEnabled,
    eveningEnabled,
    morningTime,
    eveningTime,
  });
  if (nextKey === digestConfigKey) return;
  digestConfigKey = nextKey;

  await cancelDailyDigests(api);
  if (!notificationsEnabled) return;
  if (!morningEnabled && !eveningEnabled) return;

  const language = await getCurrentLanguage();
  const tr = await getTranslations(language);

  if (morningEnabled) {
    const { hour, minute } = parseTimeOfDay(settings.dailyDigestMorningTime, { hour: 9, minute: 0 });
    const data = Platform.OS === 'android' ? undefined : { kind: 'daily-digest', when: 'morning' };
    const id = await scheduleNotification(api, {
      identifier: DIGEST_MORNING_NOTIFICATION_ID,
      content: {
        title: tr['digest.morningTitle'],
        body: tr['digest.morningBody'],
        data,
      } as any,
      trigger: {
        type: api.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    }, 'daily digest (morning)');
    if (id) {
      scheduledDigestByKind.set('morning', id);
    }
  }

  if (eveningEnabled) {
    const { hour, minute } = parseTimeOfDay(settings.dailyDigestEveningTime, { hour: 20, minute: 0 });
    const data = Platform.OS === 'android' ? undefined : { kind: 'daily-digest', when: 'evening' };
    const id = await scheduleNotification(api, {
      identifier: DIGEST_EVENING_NOTIFICATION_ID,
      content: {
        title: tr['digest.eveningTitle'],
        body: tr['digest.eveningBody'],
        data,
      } as any,
      trigger: {
        type: api.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    }, 'daily digest (evening)');
    if (id) {
      scheduledDigestByKind.set('evening', id);
    }
  }
}

async function rescheduleWeeklyReview(api: NotificationsApi) {
  const { settings } = useTaskStore.getState();

  const notificationsEnabled = settings.notificationsEnabled !== false;
  const weeklyReviewEnabled = settings.weeklyReviewEnabled === true;
  const weeklyReviewTime = settings.weeklyReviewTime || '18:00';
  const weeklyReviewDay = Number.isFinite(settings.weeklyReviewDay)
    ? Math.max(0, Math.min(6, Math.floor(settings.weeklyReviewDay as number)))
    : 0;

  const nextKey = JSON.stringify({
    notificationsEnabled,
    weeklyReviewEnabled,
    weeklyReviewDay,
    weeklyReviewTime,
  });
  if (nextKey === weeklyReviewConfigKey) return;
  weeklyReviewConfigKey = nextKey;

  await cancelWeeklyReview(api);
  if (!notificationsEnabled || !weeklyReviewEnabled) return;

  const language = await getCurrentLanguage();
  const tr = await getTranslations(language);
  const { hour, minute } = parseTimeOfDay(weeklyReviewTime, { hour: 18, minute: 0 });
  const weekday = weeklyReviewDay + 1; // Expo: 1 = Sunday

  const data = Platform.OS === 'android' ? undefined : { kind: 'weekly-review', weekday };
  scheduledWeeklyReviewId = await scheduleNotification(api, {
    identifier: WEEKLY_REVIEW_NOTIFICATION_ID,
    content: {
      title: tr['digest.weeklyReviewTitle'],
      body: tr['digest.weeklyReviewBody'],
      data,
    } as any,
    trigger: {
      type: api.SchedulableTriggerInputTypes.WEEKLY,
      weekday,
      hour,
      minute,
    },
  }, 'weekly review');
}

async function scheduleForTask(api: NotificationsApi, task: Task, when: Date) {
  const data = Platform.OS === 'android' ? undefined : { kind: 'task-reminder', taskId: task.id };
  const content: NotificationContentInput = {
    title: task.title,
    body: task.description || '',
    data,
    categoryIdentifier: 'task-reminder',
  };

  const id = await scheduleNotification(api, {
    identifier: getTaskNotificationIdentifier(task.id),
    content,
    trigger: {
      type: api.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  }, `task reminder (${task.id})`);

  if (id) {
    scheduledByTask.set(task.id, { scheduledAtIso: when.toISOString(), notificationId: id });
    taskIdByNotificationId.set(id, task.id);
  }
}

async function scheduleForProject(api: NotificationsApi, project: Project, when: Date, label: string) {
  const data = Platform.OS === 'android' ? undefined : { kind: 'project-review', projectId: project.id };
  const content: NotificationContentInput = {
    title: project.title,
    body: label,
    data,
    categoryIdentifier: 'project-review',
  };

  const id = await scheduleNotification(api, {
    identifier: getProjectNotificationIdentifier(project.id),
    content,
    trigger: {
      type: api.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  }, `project review (${project.id})`);

  if (id) {
    scheduledByProject.set(project.id, { scheduledAtIso: when.toISOString(), notificationId: id });
  }
}

async function cancelTaskNotification(api: NotificationsApi, taskId: string, entry: ScheduledEntry) {
  await api.cancelScheduledNotificationAsync(entry.notificationId).catch((error) => logNotificationError(`Failed to cancel task reminder (${taskId})`, error));
  scheduledByTask.delete(taskId);
  taskIdByNotificationId.delete(entry.notificationId);
}

async function cancelProjectNotification(api: NotificationsApi, projectId: string, entry: ScheduledEntry) {
  await api.cancelScheduledNotificationAsync(entry.notificationId).catch((error) => logNotificationError(`Failed to cancel project review reminder (${projectId})`, error));
  scheduledByProject.delete(projectId);
}

async function rescheduleAll(api: NotificationsApi) {
  const now = new Date();
  const { tasks, projects, settings } = useTaskStore.getState();
  if (settings.notificationsEnabled === false) {
    for (const [taskId, entry] of scheduledByTask.entries()) {
      await cancelTaskNotification(api, taskId, entry);
    }
    for (const [projectId, entry] of scheduledByProject.entries()) {
      await cancelProjectNotification(api, projectId, entry);
    }
    return;
  }

  const activeTaskIds = new Set<string>();

  const includeReviewAt = settings.reviewAtNotificationsEnabled !== false;
  for (const task of tasks) {
    const next = getNextScheduledAt(task, now, { includeReviewAt });
    if (!next || next.getTime() <= now.getTime()) {
      const existing = scheduledByTask.get(task.id);
      if (existing) {
        await cancelTaskNotification(api, task.id, existing);
      }
      continue;
    }

    const existing = scheduledByTask.get(task.id);
    const nextIso = next.toISOString();

    if (existing && existing.scheduledAtIso === nextIso) {
      activeTaskIds.add(task.id);
      continue;
    }

    if (existing) {
      await cancelTaskNotification(api, task.id, existing);
    }

    await scheduleForTask(api, task, next);
    activeTaskIds.add(task.id);
  }

  for (const [taskId, entry] of scheduledByTask.entries()) {
    if (!activeTaskIds.has(taskId)) {
      await cancelTaskNotification(api, taskId, entry);
    }
  }

  if (!includeReviewAt) {
    for (const [projectId, entry] of scheduledByProject.entries()) {
      await cancelProjectNotification(api, projectId, entry);
    }
    return;
  }

  const language = await getCurrentLanguage();
  const tr = await getTranslations(language);
  const reviewLabel = tr['review.projectsStep'] ?? 'Review project';

  const activeProjectIds = new Set<string>();
  for (const project of projects) {
    if (project.deletedAt) continue;
    if (project.status === 'archived') continue;
    const reviewAt = safeParseDate(project.reviewAt);
    if (!reviewAt) {
      const existing = scheduledByProject.get(project.id);
      if (existing) {
        await cancelProjectNotification(api, project.id, existing);
      }
      continue;
    }
    if (!hasTimeComponent(project.reviewAt)) {
      reviewAt.setHours(9, 0, 0, 0);
    }
    if (reviewAt.getTime() <= now.getTime()) {
      const existing = scheduledByProject.get(project.id);
      if (existing) {
        await cancelProjectNotification(api, project.id, existing);
      }
      continue;
    }

    const existing = scheduledByProject.get(project.id);
    const nextIso = reviewAt.toISOString();

    if (existing && existing.scheduledAtIso === nextIso) {
      activeProjectIds.add(project.id);
      continue;
    }

    if (existing) {
      await cancelProjectNotification(api, project.id, existing);
    }

    await scheduleForProject(api, project, reviewAt, reviewLabel);
    activeProjectIds.add(project.id);
  }

  for (const [projectId, entry] of scheduledByProject.entries()) {
    if (!activeProjectIds.has(projectId)) {
      await cancelProjectNotification(api, projectId, entry);
    }
  }
}

async function snoozeTask(api: NotificationsApi, taskId: string, minutes: number) {
  const { tasks } = useTaskStore.getState();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    logNotificationError(`Snooze skipped: task not found (${taskId})`, '');
    return;
  }
  const snoozeAt = new Date(Date.now() + minutes * 60 * 1000);
  await scheduleForTask(api, task, snoozeAt);
}

function isDismissAction(actionIdentifier?: string): boolean {
  if (!actionIdentifier) return false;
  return actionIdentifier.toUpperCase().includes('DISMISS');
}

function getResponseKey(response: NotificationResponse): string {
  const notificationId = response.notification?.request?.identifier ?? 'unknown';
  const actionIdentifier = response.actionIdentifier ?? 'default';
  return `${notificationId}:${actionIdentifier}`;
}

function handleNotificationResponse(api: NotificationsApi, response: NotificationResponse): void {
  const responseKey = getResponseKey(response);
  if (lastHandledNotificationResponseKey === responseKey) return;
  lastHandledNotificationResponseKey = responseKey;

  const notificationId = response.notification?.request?.identifier;
  const data = response.notification?.request?.content?.data as Record<string, unknown> | undefined;
  const taskId = (typeof data?.taskId === 'string' ? data.taskId : undefined)
    ?? (notificationId ? taskIdByNotificationId.get(notificationId) : undefined)
    ?? getTaskIdFromNotificationIdentifier(notificationId);

  if (response.actionIdentifier === 'snooze10' && taskId) {
    snoozeTask(api, taskId, 10).catch((error) => logNotificationError('Failed to snooze task', error));
    return;
  }
  if (isDismissAction(response.actionIdentifier)) return;
  if (!notificationOpenHandler) return;

  const projectId = typeof data?.projectId === 'string' ? data.projectId : undefined;
  const kind = typeof data?.kind === 'string' ? data.kind : undefined;
  try {
    notificationOpenHandler({
      notificationId,
      actionIdentifier: response.actionIdentifier,
      taskId,
      projectId,
      kind,
    });
  } catch (error) {
    logNotificationError('Failed to handle notification open', error);
  }
}

async function clearLastNotificationResponse(api: NotificationsApi): Promise<void> {
  const clearFn = (api as unknown as { clearLastNotificationResponseAsync?: () => Promise<void> }).clearLastNotificationResponseAsync;
  if (typeof clearFn !== 'function') return;
  await clearFn().catch((error) => logNotificationError('Failed to clear last notification response', error));
}

async function runRescheduleCycle(api: NotificationsApi): Promise<void> {
  await rescheduleAll(api);
  await rescheduleDailyDigest(api);
  await rescheduleWeeklyReview(api);
}

function enqueueReschedule(api: NotificationsApi): void {
  rescheduleQueue = rescheduleQueue
    .catch(() => undefined)
    .then(async () => {
      await runRescheduleCycle(api);
    })
    .catch((error) => logNotificationError('Failed to reschedule notifications', error));
}

export async function startMobileNotifications() {
  if (started) return;
  started = true;

  const api = await loadNotifications();
  if (!api || typeof api.scheduleNotificationAsync !== 'function') {
    storeSubscription?.();
    storeSubscription = null;
    responseSubscription?.remove();
    responseSubscription = null;
    scheduledByTask.clear();
    taskIdByNotificationId.clear();
    scheduledByProject.clear();
    scheduledDigestByKind.clear();
    scheduledWeeklyReviewId = null;
    digestConfigKey = null;
    weeklyReviewConfigKey = null;
    lastHandledNotificationResponseKey = null;
    started = false;
    return;
  }

  const permission = await ensurePermission(api);
  if (!permission.granted) {
    storeSubscription?.();
    storeSubscription = null;
    clearRescheduleTimer();
    responseSubscription?.remove();
    responseSubscription = null;
    scheduledByTask.clear();
    taskIdByNotificationId.clear();
    scheduledByProject.clear();
    scheduledDigestByKind.clear();
    scheduledWeeklyReviewId = null;
    digestConfigKey = null;
    weeklyReviewConfigKey = null;
    lastHandledNotificationResponseKey = null;
    started = false;
    return;
  }

  if (Platform.OS === 'android' && typeof api.setNotificationChannelAsync === 'function') {
    await api.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
      name: 'Mindwtr Reminders',
      importance: api.AndroidImportance?.DEFAULT ?? 5,
      description: 'Task reminders and review digests',
    }).catch((error) => logNotificationError('Failed to set notification channel', error));
  }

  await api.setNotificationCategoryAsync('task-reminder', [
    {
      identifier: 'snooze10',
      buttonTitle: 'Snooze 10m',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'open',
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
  ]).catch((error) => logNotificationError('Failed to register notification category', error));

  await api.setNotificationCategoryAsync('project-review', [
    {
      identifier: 'open',
      buttonTitle: 'Open',
      options: { opensAppToForeground: true },
    },
  ]).catch((error) => logNotificationError('Failed to register project notification category', error));

  await runRescheduleCycle(api);

  storeSubscription?.();
  storeSubscription = useTaskStore.subscribe(() => {
    clearRescheduleTimer();
    rescheduleTimer = setTimeout(() => {
      rescheduleTimer = null;
      enqueueReschedule(api);
    }, 500);
  });

  responseSubscription?.remove();
  responseSubscription = api.addNotificationResponseReceivedListener((response: NotificationResponse) => {
    handleNotificationResponse(api, response);
    void clearLastNotificationResponse(api);
  });
  if (typeof api.getLastNotificationResponseAsync === 'function') {
    api.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        handleNotificationResponse(api, response as NotificationResponse);
        void clearLastNotificationResponse(api);
      })
      .catch((error) => logNotificationError('Failed to read last notification response', error));
  }
}

export async function stopMobileNotifications() {
  responseSubscription?.remove();
  responseSubscription = null;
  storeSubscription?.();
  storeSubscription = null;
  clearRescheduleTimer();

  if (Notifications) {
    for (const entry of scheduledByTask.values()) {
      await Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch((error) => logNotificationError('Failed to cancel task reminder', error));
    }
    for (const entry of scheduledByProject.values()) {
      await Notifications.cancelScheduledNotificationAsync(entry.notificationId).catch((error) => logNotificationError('Failed to cancel project reminder', error));
    }
    for (const id of scheduledDigestByKind.values()) {
      await Notifications.cancelScheduledNotificationAsync(id).catch((error) => logNotificationError('Failed to cancel daily digest', error));
    }
    await Notifications.cancelScheduledNotificationAsync(DIGEST_MORNING_NOTIFICATION_ID).catch((error) => logNotificationError('Failed to cancel daily digest', error));
    await Notifications.cancelScheduledNotificationAsync(DIGEST_EVENING_NOTIFICATION_ID).catch((error) => logNotificationError('Failed to cancel daily digest', error));
    if (scheduledWeeklyReviewId) {
      await Notifications.cancelScheduledNotificationAsync(scheduledWeeklyReviewId).catch((error) => logNotificationError('Failed to cancel weekly review', error));
    }
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_REVIEW_NOTIFICATION_ID).catch((error) => logNotificationError('Failed to cancel weekly review', error));
  }

  scheduledByTask.clear();
  taskIdByNotificationId.clear();
  scheduledByProject.clear();
  scheduledDigestByKind.clear();
  scheduledWeeklyReviewId = null;
  digestConfigKey = null;
  weeklyReviewConfigKey = null;
  lastHandledNotificationResponseKey = null;
  rescheduleQueue = Promise.resolve();
  started = false;
}
