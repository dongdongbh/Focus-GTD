import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTaskStore } from '@focus-gtd/core';
import type { Task } from '@focus-gtd/core';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage } from '../../contexts/language-context';
import { Colors } from '@/constants/theme';
import { SwipeableTaskItem } from '../swipeable-task-item';



export function WaitingView() {
  const { tasks, updateTask, deleteTask } = useTaskStore();
  const { isDark } = useTheme();
  const { t } = useLanguage();

  const tc = {
    bg: isDark ? Colors.dark.background : Colors.light.background,
    cardBg: isDark ? '#1F2937' : '#FFFFFF',
    text: isDark ? Colors.dark.text : Colors.light.text,
    secondaryText: isDark ? '#9CA3AF' : '#6B7280',
    border: isDark ? '#374151' : '#E5E7EB',
  };

  const waitingTasks = tasks
    .filter((t) => !t.deletedAt && t.status === 'waiting')
    .sort((a, b) => {
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleStatusChange = (id: string, status: 'next' | 'done') => {
    updateTask(id, { status });
  };

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <Text style={[styles.title, { color: tc.text }]}>⏸️ {t('waiting.title')}</Text>
        <Text style={[styles.subtitle, { color: tc.secondaryText }]}>
          {t('waiting.subtitle')}
        </Text>
      </View>

      <View style={[styles.stats, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{waitingTasks.length}</Text>
          <Text style={styles.statLabel}>Waiting</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {waitingTasks.filter((t) => t.dueDate).length}
          </Text>
          <Text style={styles.statLabel}>With Deadline</Text>
        </View>
      </View>

      <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
        {waitingTasks.length > 0 ? (
          waitingTasks.map((task) => (
            <SwipeableTaskItem
              key={task.id}
              task={task}
              isDark={isDark}
              tc={tc}
              onPress={() => { }} // No detail view for now, or maybe expand?
              onStatusChange={(status) => handleStatusChange(task.id, status as any)}
              onDelete={() => deleteTask(task.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⏸️</Text>
            <Text style={styles.emptyTitle}>No waiting tasks</Text>
            <Text style={styles.emptyText}>
              Use "Waiting" status for tasks that depend on others or external events
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F59E0B',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  taskList: {
    flex: 1,
    padding: 16,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
