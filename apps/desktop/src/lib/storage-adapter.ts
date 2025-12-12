import { StorageAdapter, AppData } from '@mindwtr/core';
import { invoke } from '@tauri-apps/api/core';

export const tauriStorage: StorageAdapter = {
    getData: async (): Promise<AppData> => {
        return invoke('get_data');
    },
    saveData: async (data: AppData): Promise<void> => {
        await invoke('save_data', { data });
    },
};


