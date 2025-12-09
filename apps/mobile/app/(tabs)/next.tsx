import React, { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTaskStore } from '@focus-gtd/core';
import type { Task } from '@focus-gtd/core';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TaskEditModal } from '@/components/task-edit-modal';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage } from '../../contexts/language-context';
import { Colors } from '@/constants/theme';
import { SwipeableTaskItem } from '@/components/swipeable-task-item';

// GTD preset contexts
const PRESET_CONTEXTS = ['@home', '@work', '@errands', '@agendas', '@computer', '@phone', '@anywhere'];

import { sortTasks } from '@/utils/task-sorter';

export default function NextActionsScreen() {
  const router = useRouter();
  const { tasks, updateTask, deleteTask } = useTaskStore();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedContext, setSelectedContext] = useState<string | null>(null);

  // Theme colors
  const tc = {
    bg: isDark ? Colors.dark.background : Colors.light.background,
    cardBg: isDark ? '#1F2937' : '#FFFFFF',
    text: isDark ? Colors.dark.text : Colors.light.text,
    secondaryText: isDark ? '#9CA3AF' : '#6B7280',
    border: isDark ? '#374151' : '#E5E7EB',
    filterBg: isDark ? '#374151' : '#F3F4F6',
  };

  // Get all unique contexts from tasks (merge with presets)
  const allContexts = Array.from(new Set([
    ...PRESET_CONTEXTS,
    ...tasks.flatMap(t => t.contexts || [])
  ])).sort();

  const nextTasks = sortTasks(tasks.filter(t => {
    if (t.deletedAt) return false;
    if (t.status !== 'next') return false;
    if (selectedContext && !t.contexts?.includes(selectedContext)) return false;
    return true;
  }));

  const todoTasks = sortTasks(tasks.filter(t => {
    if (t.deletedAt) return false;
    if (t.status !== 'todo') return false;
    if (selectedContext && !t.contexts?.includes(selectedContext)) return false;
    return true;
  }));

  const handlePromote = useCallback((taskId: string) => {
    updateTask(taskId, { status: 'next' });
  }, [updateTask]);

  const handleComplete = useCallback((taskId: string) => {
    updateTask(taskId, { status: 'done' });
  }, [updateTask]);

  const onEdit = useCallback((task: Task) => {
    setEditingTask(task);
    setIsModalVisible(true);
  }, []);

  const onSaveTask = useCallback((taskId: string, updates: Partial<Task>) => {
    updateTask(taskId, updates);
  }, [updateTask]);

  const renderContextFilter = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.contextBar, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}
      contentContainerStyle={styles.contextBarContent}
    >
      <TouchableOpacity
        style={[
          styles.contextChip,
          { backgroundColor: tc.filterBg },
          selectedContext === null && styles.contextChipActive
        ]}
        onPress={() => setSelectedContext(null)}
      >
        <Text style={[
          styles.contextChipText,
          { color: tc.secondaryText },
          selectedContext === null && styles.contextChipTextActive
        ]}>
          {t('common.all')}
        </Text>
      </TouchableOpacity>
      {allContexts.map(context => {
        const count = tasks.filter(t =>
          (t.status === 'next' || t.status === 'todo') &&
          t.contexts?.includes(context)
        ).length;
        return (
          <TouchableOpacity
            key={context}
            style={[
              styles.contextChip,
              { backgroundColor: tc.filterBg },
              selectedContext === context && styles.contextChipActive
            ]}
            onPress={() => setSelectedContext(context)}
          >
            <Text style={[
              styles.contextChipText,
              { color: tc.secondaryText },
              selectedContext === context && styles.contextChipTextActive
            ]}>
              {context} {count > 0 && `(${count})`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderNextItem = useCallback(({ item }: { item: Task }) => (
    <SwipeableTaskItem
      task={item}
      isDark={isDark}
      tc={tc}
      onPress={() => onEdit(item)}
      onStatusChange={(status) => updateTask(item.id, { status: status as any })}
      onDelete={() => deleteTask(item.id)}
    />
  ), [onEdit, tc, updateTask, deleteTask, isDark]);

  const renderTodoItem = useCallback(({ item }: { item: Task }) => (
    <View style={[styles.todoItem, { backgroundColor: tc.filterBg }]}>
      <View style={styles.todoContent}>
        <Text style={[styles.todoTitle, { color: tc.secondaryText }]}>{item.title}</Text>
        {item.contexts && item.contexts.length > 0 && (
          <Text style={[styles.contextBadge, { color: '#3B82F6' }]}>
            {item.contexts[0]}
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={() => handlePromote(item.id)} style={styles.promoteButton}>
        <IconSymbol name="arrow.up.circle.fill" size={24} color="#3B82F6" />
      </TouchableOpacity>
    </View>
  ), [handlePromote, tc]);

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <Text style={[styles.headerTitle, { color: tc.text }]}>{t('next.title')}</Text>
        <Text style={[styles.headerSubtitle, { color: tc.secondaryText }]}>
          {nextTasks.length} {t('next.ready')}
          {selectedContext && ` • ${selectedContext} `}
        </Text>
      </View>

      {renderContextFilter()}

      <FlatList
        data={nextTasks}
        renderItem={renderNextItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          todoTasks.length > 0 ? (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: tc.text }]}>{t('next.current')}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          todoTasks.length > 0 ? (
            <View style={[styles.todoSection, { borderTopColor: tc.border }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: tc.text }]}>{t('next.promote')} ({todoTasks.length})</Text>
                <Text style={[styles.sectionSubtitle, { color: tc.secondaryText }]}>{t('next.promoteHint')}</Text>
              </View>
              <FlatList
                data={todoTasks}
                renderItem={renderTodoItem}
                keyExtractor={item => item.id}
                scrollEnabled={false}
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: tc.secondaryText }]}>
                {selectedContext
                  ? `${t('next.noContext')} ${selectedContext} `
                  : t('next.noTasks')}
              </Text>
            </View>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: tc.secondaryText }]}>
              {selectedContext
                ? `${t('next.noContext')} ${selectedContext} `
                : t('next.noTasks')}
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
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  contextBar: {
    borderBottomWidth: 1,
    maxHeight: 56,
  },
  contextBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  contextChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  contextChipActive: {
    backgroundColor: '#3B82F6',
  },
  contextChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  contextChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
  },
  contextBadge: {
    fontSize: 12,
    fontWeight: '500',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  todoSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  todoContent: {
    flex: 1,
  },
  todoTitle: {
    fontSize: 14,
  },
  promoteButton: {
    padding: 8,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
