import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type AppData, useTaskStore } from '@mindwtr/core';

import { buildTasksWidgetTree } from '../components/TasksWidget';
import { buildWidgetPayload, resolveWidgetLanguage, WIDGET_LANGUAGE_KEY } from './widget-data';
import { logError } from './app-log';

export function isAndroidWidgetSupported(): boolean {
    return Platform.OS === 'android';
}

async function getWidgetApi() {
    if (Platform.OS !== 'android') return null;
    try {
        // Use require to avoid dynamic import issues in Hermes
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const api = require('react-native-android-widget');
        return api;
    } catch (error) {
        if (__DEV__) {
            console.warn('[RNWidget] Android widget API unavailable', error);
        }
        return null;
    }
}

export async function updateAndroidWidgetFromData(data: AppData): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const widgetApi = await getWidgetApi();
    if (!widgetApi) return false;

    try {
        const languageValue = await AsyncStorage.getItem(WIDGET_LANGUAGE_KEY);
        const language = resolveWidgetLanguage(languageValue, data.settings?.language);
        const payload = buildWidgetPayload(data, language);
        await widgetApi.requestWidgetUpdate({
            widgetName: 'TasksWidget',
            renderWidget: () => buildTasksWidgetTree(payload),
        });
        return true;
    } catch (error) {
        if (__DEV__) {
            console.warn('[RNWidget] Failed to update Android widget', error);
        }
        void logError(error, { scope: 'widget', extra: { platform: 'android' } });
        return false;
    }
}

export async function updateAndroidWidgetFromStore(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const { _allTasks, _allProjects, _allAreas, tasks, projects, areas, settings } = useTaskStore.getState();
    const data: AppData = {
        tasks: _allTasks?.length ? _allTasks : tasks,
        projects: _allProjects?.length ? _allProjects : projects,
        areas: _allAreas?.length ? _allAreas : areas,
        settings: settings ?? {},
    };
    return await updateAndroidWidgetFromData(data);
}

export async function requestPinAndroidWidget(): Promise<boolean> {
    return false;
}
