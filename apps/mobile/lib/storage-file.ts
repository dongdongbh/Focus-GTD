import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { AppData } from '@mindwtr/core';
import { Platform } from 'react-native';

// StorageAccessFramework is part of the legacy FileSystem module
const StorageAccessFramework = (FileSystem as any).StorageAccessFramework;

interface PickResult extends AppData {
    __fileUri?: string;
}

// Pick a sync file and return both the parsed data and the file URI
export const pickAndParseSyncFile = async (): Promise<PickResult | null> => {
    try {
        const result = await DocumentPicker.getDocumentAsync({
            type: 'application/json',
            copyToCacheDirectory: false, // Keep original path for persistent access
        });

        if (result.canceled) {
            return null;
        }

        const fileUri = result.assets[0].uri;
        const fileContent = await FileSystem.readAsStringAsync(fileUri);
        const data = JSON.parse(fileContent) as AppData;

        // Basic validation
        if (!data.tasks || !data.projects) {
            throw new Error('Invalid data format');
        }

        // Return data with file URI attached
        return {
            ...data,
            __fileUri: fileUri,
        };
    } catch (error) {
        console.error('Failed to import data:', error);
        throw error;
    }
};

// Read sync file from a stored path
export const readSyncFile = async (fileUri: string): Promise<AppData | null> => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        if (!fileInfo.exists) {
            console.log('[Sync] File does not exist:', fileUri);
            return null;
        }

        const fileContent = await FileSystem.readAsStringAsync(fileUri);
        const data = JSON.parse(fileContent) as AppData;

        if (!data.tasks || !data.projects) {
            throw new Error('Invalid data format');
        }

        return data;
    } catch (error) {
        console.error('Failed to read sync file:', error);
        throw error;
    }
};

// Write merged data back to sync file
export const writeSyncFile = async (fileUri: string, data: AppData): Promise<void> => {
    try {
        await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2));
        console.log('[Sync] Written to sync file:', fileUri);
    } catch (error) {
        console.error('Failed to write sync file:', error);
        throw error;
    }
};

// Export data for backup - allows saving to local directory on Android
export const exportData = async (data: AppData): Promise<void> => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `focus-gtd-backup-${timestamp}.json`;
        const jsonContent = JSON.stringify(data, null, 2);

        // On Android, try SAF to let user pick save location
        if (Platform.OS === 'android' && StorageAccessFramework) {
            try {
                console.log('[Export] Attempting SAF...');
                // Request permission to a directory
                const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
                console.log('[Export] SAF permissions:', permissions);

                if (permissions.granted) {
                    // Create the file in the selected directory
                    const fileUri = await StorageAccessFramework.createFileAsync(
                        permissions.directoryUri,
                        filename,
                        'application/json'
                    );

                    await FileSystem.writeAsStringAsync(fileUri, jsonContent);
                    console.log('[Export] Saved via SAF to:', fileUri);
                    return;
                }
            } catch (safError) {
                console.log('[Export] SAF not available (Expo Go?), using share:', safError);
            }
        } else {
            console.log('[Export] SAF not available, Platform:', Platform.OS, 'SAF:', !!StorageAccessFramework);
        }

        // Fallback: Use cache + share sheet
        const fileUri = FileSystem.cacheDirectory + filename;
        console.log('[Export] Writing to cache:', fileUri);
        await FileSystem.writeAsStringAsync(fileUri, jsonContent);

        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
            await Sharing.shareAsync(fileUri, {
                UTI: 'public.json',
                mimeType: 'application/json',
                dialogTitle: 'Export Mindwtr Data',
            });
        } else {
            throw new Error('Sharing is not available on this device');
        }
    } catch (error) {
        console.error('Failed to export data:', error);
        throw error;
    }
};
