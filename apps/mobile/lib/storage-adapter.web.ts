import { StorageAdapter, AppData } from '@mindwtr/core';

const DATA_KEY = 'focus-gtd-data';

// Web version using localStorage
export const mobileStorage: StorageAdapter = {
    getData: async (): Promise<AppData> => {
        if (typeof window === 'undefined') {
            return { tasks: [], projects: [], settings: {} };
        }
        const jsonValue = localStorage.getItem(DATA_KEY);
        if (jsonValue == null) {
            return { tasks: [], projects: [], settings: {} };
        }
        try {
            const data = JSON.parse(jsonValue);
            // Validation
            if (!Array.isArray(data.tasks) || !Array.isArray(data.projects)) {
                throw new Error('Invalid data format');
            }
            return data;
        } catch (e) {
            console.error('Failed to load data', e);
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
