import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTaskStore } from '@focus-gtd/core';
import type { Task } from '@focus-gtd/core';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage } from '../../contexts/language-context';
import { Colors } from '@/constants/theme';
import { SwipeableTaskItem } from '../swipeable-task-item';



export function SomedayView() {
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

  const somedayTasks = tasks
    .filter((t) => !t.deletedAt && t.status === 'someday')
    .sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleStatusChange = (id: string, status: 'next' | 'done') => {
    updateTask(id, { status });
  };

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <Text style={[styles.title, { color: tc.text }]}>💭 {t('someday.title')}</Text>
        <Text style={[styles.subtitle, { color: tc.secondaryText }]}>
          {t('someday.subtitle')}
        </Text>
      </View>

      <View style={[styles.stats, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{somedayTasks.length}</Text>
          <Text style={styles.statLabel}>Ideas</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {somedayTasks.filter((t) => t.projectId).length}
          </Text>
          <Text style={styles.statLabel}>In Projects</Text>
        </View>
      </View>

      <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
        {somedayTasks.length > 0 ? (
          somedayTasks.map((task) => (
            <SwipeableTaskItem
              key={task.id}
              task={task}
              isDark={isDark}
              tc={tc}
              onPress={() => { }}
              onStatusChange={(status) => handleStatusChange(task.id, status as any)}
              onDelete={() => deleteTask(task.id)}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💭</Text>
            <Text style={styles.emptyTitle}>No someday/maybe items</Text>
            <Text style={styles.emptyText}>
              Use "Someday" status for ideas, goals, and projects you might want to do in
              the future but aren't ready to commit to now
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
    color: '#8B5CF6',
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
    lineHeight: 20,
  },
});
