import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useTaskStore } from '@mindwtr/core';
import type { Task } from '@mindwtr/core';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage } from '../../contexts/language-context';

import { useThemeColors, ThemeColors } from '@/hooks/use-theme-colors';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRef } from 'react';

function ArchivedTaskItem({
    task,
    isDark,
    tc,
    onRestore,
    onDelete
}: {
    task: Task;
    isDark: boolean;
    tc: ThemeColors;
    onRestore: () => void;
    onDelete: () => void;
}) {
    const swipeableRef = useRef<Swipeable>(null);

    const renderLeftActions = () => (
        <Pressable
            style={styles.swipeActionRestore}
            onPress={() => {
                swipeableRef.current?.close();
                onRestore();
            }}
        >
            <Text style={styles.swipeActionText}>↩️ Restore</Text>
        </Pressable>
    );

    const renderRightActions = () => (
        <Pressable
            style={styles.swipeActionDelete}
            onPress={() => {
                swipeableRef.current?.close();
                onDelete();
            }}
        >
            <Text style={styles.swipeActionText}>🗑️ Delete</Text>
        </Pressable>
    );

    return (
        <Swipeable
            ref={swipeableRef}
            renderLeftActions={renderLeftActions}
            renderRightActions={renderRightActions}
            overshootLeft={false}
            overshootRight={false}
        >
            <View style={[styles.taskItem, { backgroundColor: tc.cardBg }]}>
                <View style={styles.taskContent}>
                    <Text style={[styles.taskTitle, { color: tc.secondaryText }]} numberOfLines={2}>
                        {task.title}
                    </Text>
                    {task.description && (
                        <Text style={[styles.taskDescription, { color: tc.secondaryText }]} numberOfLines={1}>
                            {task.description}
                        </Text>
                    )}
                    <Text style={[styles.archivedDate, { color: tc.secondaryText }]}>
                        Archived: {task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : 'Unknown'}
                    </Text>
                </View>
                <View style={[styles.statusIndicator, { backgroundColor: '#6B7280' }]} />
            </View>
        </Swipeable>
    );
}

export default function ArchivedScreen() {
    const { tasks, updateTask, deleteTask } = useTaskStore();
    const { isDark } = useTheme();
    const { t } = useLanguage();

    const tc = useThemeColors();

    // Only show archived tasks (not soft-deleted)
    const archivedTasks = tasks.filter((t) => t.status === 'archived' && !t.deletedAt);

    const handleRestore = (taskId: string) => {
        updateTask(taskId, { status: 'inbox' });
    };

    const handleDelete = (taskId: string) => {
        Alert.alert(
            'Delete Permanently?',
            'This action cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteTask(taskId)
                },
            ]
        );
    };

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <View style={[styles.container, { backgroundColor: tc.bg }]}>
                <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
                    <Text style={[styles.title, { color: tc.text }]}>{t('archived.title') || 'Archived'}</Text>
                    <Text style={[styles.subtitle, { color: tc.secondaryText }]}>
                        {archivedTasks.length} {t('common.tasks') || 'tasks'}
                    </Text>
                </View>

                <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
                    {archivedTasks.length > 0 ? (
                        archivedTasks.map((task) => (
                            <ArchivedTaskItem
                                key={task.id}
                                task={task}
                                isDark={isDark}
                                tc={tc}
                                onRestore={() => handleRestore(task.id)}
                                onDelete={() => handleDelete(task.id)}
                            />
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📦</Text>
                            <Text style={[styles.emptyTitle, { color: tc.text }]}>
                                {t('archived.empty') || 'No archived tasks'}
                            </Text>
                            <Text style={[styles.emptyText, { color: tc.secondaryText }]}>
                                {t('archived.emptyHint') || 'Tasks you archive will appear here'}
                            </Text>
                        </View>
                    )}
                </ScrollView>
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    subtitle: {
        fontSize: 14,
        marginTop: 4,
    },
    taskList: {
        flex: 1,
        padding: 16,
    },
    taskItem: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    taskContent: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        textDecorationLine: 'line-through',
    },
    taskDescription: {
        fontSize: 14,
        marginBottom: 4,
    },
    archivedDate: {
        fontSize: 12,
        fontStyle: 'italic',
    },
    statusIndicator: {
        width: 4,
        borderRadius: 2,
        marginLeft: 12,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
    },
    swipeActionRestore: {
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
        width: 100,
        borderRadius: 12,
        marginBottom: 12,
        marginRight: 8,
    },
    swipeActionDelete: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 100,
        borderRadius: 12,
        marginBottom: 12,
        marginLeft: 8,
    },
    swipeActionText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 14,
    },
});
