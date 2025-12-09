import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTaskStore } from '@focus-gtd/core';
import type { Task, TaskStatus } from '@focus-gtd/core';
import { useState } from 'react';
import { useTheme } from '../../contexts/theme-context';
import { Colors } from '@/constants/theme';
import { SwipeableTaskItem } from '../swipeable-task-item';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'Todo', color: '#6B7280' },
  { id: 'next', label: 'Next', color: '#3B82F6' },
  { id: 'in-progress', label: 'In Progress', color: '#EAB308' },
  { id: 'done', label: 'Done', color: '#10B981' },
];

function Column({ id, label, color, tasks, onTaskPress, onStatusChange, onDelete, isDark, tc }: {
  id: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onDelete: (taskId: string) => void;
  isDark: boolean;
  tc: any;
}) {
  return (
    <View style={[styles.column, { borderTopColor: color }]}>
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle}>{label}</Text>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </View>
      </View>
      <ScrollView style={styles.columnContent} showsVerticalScrollIndicator={false}>
        {tasks.map((task) => (
          <SwipeableTaskItem
            key={task.id}
            task={task}
            isDark={isDark}
            tc={tc}
            onPress={() => onTaskPress(task)}
            onStatusChange={(status) => onStatusChange(task.id, status)}
            onDelete={() => onDelete(task.id)}
          />
        ))}
        {tasks.length === 0 && (
          <View style={styles.emptyColumn}>
            <Text style={styles.emptyText}>No tasks</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export function BoardView() {
  const { tasks, updateTask, deleteTask } = useTaskStore();
  const { isDark } = useTheme();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Theme colors
  const tc = {
    bg: isDark ? Colors.dark.background : Colors.light.background,
    cardBg: isDark ? '#1F2937' : '#FFFFFF',
    text: isDark ? Colors.dark.text : Colors.light.text,
    secondaryText: isDark ? '#9CA3AF' : '#6B7280',
    border: isDark ? '#374151' : '#E5E7EB',
    taskBg: isDark ? '#374151' : '#F9FAFB',
  };

  const handleTaskPress = (task: Task) => {
    setSelectedTask(task);
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (selectedTask) {
      updateTask(selectedTask.id, { status: newStatus });
      setSelectedTask(null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <Text style={[styles.title, { color: tc.text }]}>Board View</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.boardScroll}
        contentContainerStyle={styles.boardContent}
      >
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            label={col.label}
            color={col.color}
            tasks={tasks.filter((t) => !t.deletedAt && t.status === col.id)}
            onTaskPress={handleTaskPress}
            onStatusChange={(taskId, status) => updateTask(taskId, { status: status as any })}
            onDelete={deleteTask}
            isDark={isDark}
            tc={tc}
          />
        ))}
      </ScrollView>

      {selectedTask && (
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedTask.title}</Text>
            <Text style={styles.modalLabel}>Move to:</Text>
            <View style={styles.statusButtons}>
              {COLUMNS.map((col) => (
                <Pressable
                  key={col.id}
                  style={[
                    styles.statusButton,
                    { backgroundColor: col.color },
                    selectedTask.status === col.id && styles.statusButtonCurrent,
                  ]}
                  onPress={() => handleStatusChange(col.id)}
                >
                  <Text style={styles.statusButtonText}>{col.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setSelectedTask(null)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
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
  boardScroll: {
    flex: 1,
  },
  boardContent: {
    padding: 16,
    gap: 16,
  },
  column: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  columnTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  columnContent: {
    flex: 1,
    padding: 12,
    maxHeight: 500,
  },

  emptyColumn: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 12,
  },
  statusButtons: {
    gap: 8,
    marginBottom: 16,
  },
  statusButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  statusButtonCurrent: {
    opacity: 0.7,
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
});
