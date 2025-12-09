import React, { useState, useMemo, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, TouchableOpacity, Text, Animated, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useTaskStore, Task, TaskStatus } from '@focus-gtd/core';


import { TaskEditModal } from './task-edit-modal';
import { SwipeableTaskItem } from './swipeable-task-item';
import { useTheme } from '../contexts/theme-context';
import { useLanguage } from '../contexts/language-context';
import { Colors } from '@/constants/theme';

export interface TaskListProps {
  statusFilter: TaskStatus | 'all';
  title: string;
  allowAdd?: boolean;
  projectId?: string;
}

// ... inside TaskList component
export function TaskList({ statusFilter, title, allowAdd = true, projectId }: TaskListProps) {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const { tasks, addTask, updateTask, deleteTask, fetchData } = useTaskStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Dynamic colors based on theme
  const themeColors = {
    background: isDark ? Colors.dark.background : Colors.light.background,
    text: isDark ? Colors.dark.text : Colors.light.text,
    border: isDark ? '#374151' : '#e5e5e5',
    inputBg: isDark ? '#1F2937' : '#f9f9f9',
    cardBg: isDark ? '#1F2937' : '#f9f9f9',
    placeholder: isDark ? '#9CA3AF' : '#666',
  };

  // Memoize filtered tasks for performance
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Filter out soft-deleted tasks
      if (t.deletedAt) return false;
      const matchesStatus = statusFilter === 'all' ? true : t.status === statusFilter;
      const matchesProject = projectId ? t.projectId === projectId : true;
      const matchesSearch = searchQuery
        ? t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
        : true;
      return matchesStatus && matchesProject && matchesSearch;
    });
  }, [tasks, statusFilter, projectId, searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      let title = newTaskTitle;
      // Default to 'todo' when adding within a project, otherwise use statusFilter or 'inbox'
      let status: TaskStatus = projectId ? 'todo' : (statusFilter !== 'all' ? statusFilter : 'inbox');
      let dueDate: string | undefined;

      // Parse status
      if (title.includes('/todo')) {
        status = 'todo';
        title = title.replace('/todo', '').trim();
      }

      // Parse note
      let description: string | undefined;
      const noteMatch = title.match(/\/note:(.+?)(\/|$)/);
      if (noteMatch) {
        description = noteMatch[1].trim();
        title = title.replace(noteMatch[0], '').trim();
      }

      // Parse due date
      if (title.includes('/due:tomorrow')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dueDate = tomorrow.toISOString();
        title = title.replace('/due:tomorrow', '').trim();
      } else {
        const dueMatch = title.match(/\/due:(\d{4}-\d{2}-\d{2})/);
        if (dueMatch) {
          dueDate = new Date(dueMatch[1]).toISOString();
          title = title.replace(dueMatch[0], '').trim();
        }
      }

      if (title) {
        addTask(title, { status, dueDate, projectId, description });
        setNewTaskTitle('');
      }
    }
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalVisible(true);
  };

  const onSaveTask = (taskId: string, updates: Partial<Task>) => {
    updateTask(taskId, updates);
    setIsModalVisible(false);
    setEditingTask(null);
  };

  const renderTask = ({ item }: { item: Task }) => (
    <SwipeableTaskItem
      task={item}
      isDark={isDark}
      tc={themeColors as any}
      onPress={() => handleEditTask(item)}
      onStatusChange={(status) => updateTask(item.id, { status: status as TaskStatus })}
      onDelete={() => deleteTask(item.id)}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
        <Text style={[styles.count, { color: themeColors.placeholder }]}>{filteredTasks.length} {t('common.tasks')}</Text>
      </View>

      {allowAdd && (
        <View style={[styles.inputContainer, { borderBottomColor: themeColors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
            placeholder={`Add task to ${title}... (/todo, /due:, /note:)`}
            placeholderTextColor={themeColors.placeholder}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            onSubmitEditing={handleAddTask}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={handleAddTask}
            style={[styles.addButton, !newTaskTitle.trim() && styles.addButtonDisabled]}
            disabled={!newTaskTitle.trim()}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      <TextInput
        style={[styles.searchInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border, color: themeColors.text }]}
        placeholder={t('common.search') || 'Search tasks...'}
        placeholderTextColor={themeColors.placeholder}
        value={searchQuery}
        onChangeText={setSearchQuery}
        clearButtonMode="while-editing"
      />

      <FlatList
        data={filteredTasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        getItemLayout={(_, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching tasks' : `No tasks in ${title}`}
            </Text>
          </View>
        }
      />

      <TaskEditModal
        visible={isModalVisible}
        task={editingTask}
        onClose={() => setIsModalVisible(false)}
        onSave={onSaveTask}
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
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  count: {
    fontSize: 14,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  taskItem: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  taskDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  taskMeta: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    display: 'none', // Hidden in favor of swipe
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  promoteAction: {
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  actionText: {
    color: '#fff',
    fontWeight: '600',
    padding: 20,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
  },
  badgeContainer: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  searchInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
});
