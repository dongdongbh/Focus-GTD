import { StorageAdapter, AppData } from '@mindwtr/core';
import { Platform } from 'react-native';

const DATA_KEY = 'focus-gtd-data';

// Platform-specific storage implementation
const createStorage = (): StorageAdapter => {
    // Web platform - use localStorage
    if (Platform.OS === 'web') {
        return {
            getData: async (): Promise<AppData> => {
                if (typeof window === 'undefined') {
                    return { tasks: [], projects: [], settings: {} };
                }
                const jsonValue = localStorage.getItem(DATA_KEY);
                if (jsonValue == null) {
                    return { tasks: [], projects: [], settings: {} };
                }
                try {
                    return JSON.parse(jsonValue);
                } catch (e) {
                    // JSON parse error - data corrupted, throw so user is notified
                    console.error('Failed to parse stored data - may be corrupted', e);
                    throw new Error('Data appears corrupted. Please restore from backup.');
                }
            },
            saveData: async (data: AppData): Promise<void> => {
                try {
                    if (typeof window !== 'undefined') {
                        const jsonValue = JSON.stringify(data);
                        localStorage.setItem(DATA_KEY, jsonValue);
                    }
                } catch (e) {
                    console.error('Failed to save data', e);
                    throw new Error('Failed to save data: ' + (e as Error).message);
                }
            },
        };
    }

    // Native platforms - use AsyncStorage
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return {
        getData: async (): Promise<AppData> => {
            const jsonValue = await AsyncStorage.getItem(DATA_KEY);
            if (jsonValue == null) {
                return { tasks: [], projects: [], settings: {} };
            }
            try {
                return JSON.parse(jsonValue);
            } catch (e) {
                // JSON parse error - data corrupted, throw so user is notified
                console.error('Failed to parse stored data - may be corrupted', e);
                throw new Error('Data appears corrupted. Please restore from backup.');
            }
        },
        saveData: async (data: AppData): Promise<void> => {
            try {
                const jsonValue = JSON.stringify(data);
                await AsyncStorage.setItem(DATA_KEY, jsonValue);
            } catch (e) {
                console.error('Failed to save data', e);
                throw new Error('Failed to save data: ' + (e as Error).message);
            }
        },
    };
};

export const mobileStorage = createStorage();
