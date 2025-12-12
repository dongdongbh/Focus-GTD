import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTaskStore, filterTasksBySearch, sortTasks, Task, TaskStatus } from '@mindwtr/core';
import { SwipeableTaskItem } from '@/components/swipeable-task-item';
import { TaskEditModal } from '@/components/task-edit-modal';
import { useLanguage } from '@/contexts/language-context';
import { useTheme } from '@/contexts/theme-context';
import { useThemeColors } from '@/hooks/use-theme-colors';

export default function SavedSearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, projects, settings, updateTask, deleteTask, fetchData } = useTaskStore();
  const { t } = useLanguage();
  const { isDark } = useTheme();
  const tc = useThemeColors();

  const savedSearch = settings?.savedSearches?.find(s => s.id === id);
  const query = savedSearch?.query || '';

  const filteredTasks = useMemo(() => {
    if (!query) return [];
    return sortTasks(filterTasksBySearch(tasks, projects, query));
  }, [tasks, projects, query]);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const renderTask = ({ item }: { item: Task }) => (
    <SwipeableTaskItem
      task={item}
      isDark={isDark}
      tc={tc}
      onPress={() => {
        setEditingTask(item);
        setIsModalVisible(true);
      }}
      onStatusChange={(status) => updateTask(item.id, { status: status as TaskStatus })}
      onDelete={() => deleteTask(item.id)}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={[styles.header, { borderBottomColor: tc.border }]}>
        <Text style={[styles.title, { color: tc.text }]} accessibilityRole="header">
          {savedSearch?.name || t('search.savedSearches')}
        </Text>
        {query ? (
          <Text style={[styles.queryText, { color: tc.secondaryText }]} numberOfLines={1}>
            {query}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={filteredTasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: tc.secondaryText }]}>
              {t('search.noResults')}
            </Text>
          </View>
        }
      />

      <TaskEditModal
        visible={isModalVisible}
        task={editingTask}
        onClose={() => setIsModalVisible(false)}
        onSave={(taskId, updates) => {
          updateTask(taskId, updates);
          setIsModalVisible(false);
          setEditingTask(null);
        }}
        onFocusMode={(taskId) => {
          setIsModalVisible(false);
          router.push(`/check-focus?id=${taskId}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  queryText: {
    fontSize: 12,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});

