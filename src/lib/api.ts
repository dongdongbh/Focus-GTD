import { AppData } from '../types';

const API_URL = 'http://localhost:3001/api';

export const api = {
    async getData(): Promise<AppData> {
        const response = await fetch(`${API_URL}/data`);
        if (!response.ok) {
            throw new Error('Failed to fetch data');
        }
        return response.json();
    },

    async saveData(data: AppData): Promise<void> {
        const response = await fetch(`${API_URL}/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            throw new Error('Failed to save data');
        }
    },
};
