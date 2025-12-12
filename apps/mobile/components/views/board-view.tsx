import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTaskStore } from '@mindwtr/core';
import type { Task, TaskStatus } from '@mindwtr/core';
import { useMemo, useState, useCallback } from 'react';
import { useTheme } from '../../contexts/theme-context';
import { useLanguage } from '../../contexts/language-context';
import { Colors } from '@/constants/theme';
import { GestureDetector, Gesture, Swipeable } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS
} from 'react-native-reanimated';
import { TaskEditModal } from '../task-edit-modal';

const COLUMNS: { id: TaskStatus; label: string; labelKey: string; color: string }[] = [
  { id: 'todo', label: 'Todo', labelKey: 'board.todo', color: '#6B7280' },
  { id: 'next', label: 'Next', labelKey: 'board.next', color: '#3B82F6' },
  { id: 'in-progress', label: 'In Progress', labelKey: 'board.inProgress', color: '#EAB308' },
  { id: 'done', label: 'Done', labelKey: 'board.done', color: '#10B981' },
];

interface DraggableTaskProps {
  task: Task;
  isDark: boolean;
  currentColumnIndex: number;
  onDrop: (taskId: string, newColumnIndex: number) => void;
  onTap: (task: Task) => void;
  onDelete: (taskId: string) => void;
  deleteLabel: string;
}

function DraggableTask({ task, isDark, currentColumnIndex, onDrop, onTap, onDelete, deleteLabel }: DraggableTaskProps) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const zIndex = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const COLUMN_HEIGHT_ESTIMATE = 150;

  // Tap gesture for editing
  const tapGesture = Gesture.Tap()
    .onEnd(() => {
      runOnJS(onTap)(task);
    });

  // Pan gesture for dragging - requires long press to distinguish from scroll/swipe
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
      zIndex.value = 1000;
      // Provide Haptic feedback here if possible, but runOnJS needed
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      isDragging.value = false;

      const columnsMoved = Math.round(event.translationY / COLUMN_HEIGHT_ESTIMATE);
      const newColumnIndex = Math.max(0, Math.min(COLUMNS.length - 1, currentColumnIndex + columnsMoved));

      if (newColumnIndex !== currentColumnIndex) {
        runOnJS(onDrop)(task.id, newColumnIndex);
      }

      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      zIndex.value = 1;
    });

  // Combine gestures - tap works immediately, drag requires hold
  const composedGesture = Gesture.Race(
    panGesture,
    tapGesture
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
    opacity: isDragging.value ? 0.85 : 1,
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[
        styles.taskCardContainer,
        animatedStyle
      ]}>
        <Swipeable
          renderRightActions={() => (
            <View style={styles.deleteAction}>
              <Text style={styles.deleteActionText}>{deleteLabel}</Text>
            </View>
          )}
          onSwipeableOpen={() => onDelete(task.id)}
        >
          <View style={[
            styles.taskCard,
            { backgroundColor: isDark ? '#374151' : '#FFFFFF' }
          ]}>
            <Text style={[styles.taskTitle, { color: isDark ? '#FFFFFF' : '#111827' }]} numberOfLines={2}>
              {task.title}
            </Text>
            {task.contexts && task.contexts.length > 0 && (
              <View style={styles.contextsRow}>
                {task.contexts.slice(0, 2).map((ctx, idx) => (
                  <Text key={idx} style={styles.contextTag}>{ctx}</Text>
                ))}
              </View>
            )}
            {task.timeEstimate && (
              <View style={styles.timeEstimateRow}>
                <View style={styles.timeEstimateBadge}>
                  <Text style={styles.timeEstimateText}>
                    ⏱ {task.timeEstimate === '5min' ? '5m' :
                      task.timeEstimate === '15min' ? '15m' :
                        task.timeEstimate === '30min' ? '30m' :
                          task.timeEstimate === '1hr' ? '1h' : '2h+'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Swipeable>
      </Animated.View>
    </GestureDetector>
  );
}

interface ColumnProps {
  columnIndex: number;
  label: string;
  color: string;
  tasks: Task[];
  isDark: boolean;
  onDrop: (taskId: string, newColumnIndex: number) => void;
  onTap: (task: Task) => void;
  onDelete: (taskId: string) => void;
  noTasksLabel: string;
  deleteLabel: string;
}

function Column({ columnIndex, label, color, tasks, isDark, onDrop, onTap, onDelete, noTasksLabel, deleteLabel }: ColumnProps) {
  return (
    <View style={[styles.column, { borderTopColor: color, backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
      <View style={[styles.columnHeader, { borderBottomColor: isDark ? '#374151' : '#E5E7EB' }]}>
        <Text style={[styles.columnTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>{label}</Text>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{tasks.length}</Text>
        </View>
      </View>
      <View style={styles.columnContent}>
        {tasks.map((task) => (
          <DraggableTask
            key={task.id}
            task={task}
            isDark={isDark}
            currentColumnIndex={columnIndex}
            onDrop={onDrop}
            onTap={onTap}
            onDelete={onDelete}
            deleteLabel={deleteLabel}
          />
        ))}
        {tasks.length === 0 && (
          <View style={styles.emptyColumn}>
            <Text style={[styles.emptyText, { color: isDark ? '#6B7280' : '#9CA3AF' }]}>
              {noTasksLabel}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export function BoardView() {
  const { tasks, updateTask, deleteTask } = useTaskStore();
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filter active tasks and group by status
  const tasksByStatus = useMemo(() => {
    const activeTasks = tasks.filter(t => !t.deletedAt);
    const grouped: Record<string, Task[]> = {};
    COLUMNS.forEach(col => {
      grouped[col.id] = activeTasks.filter(t => t.status === col.id);
    });
    return grouped;
  }, [tasks]);

  const handleDrop = useCallback((taskId: string, newColumnIndex: number) => {
    if (newColumnIndex >= 0 && newColumnIndex < COLUMNS.length) {
      const newStatus = COLUMNS[newColumnIndex].id;
      updateTask(taskId, { status: newStatus });
    }
  }, [updateTask]);

  const handleTap = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const handleSave = useCallback((taskId: string, updates: Partial<Task>) => {
    updateTask(taskId, updates);
  }, [updateTask]);

  const handleDelete = useCallback((taskId: string) => {
    deleteTask(taskId);
  }, [deleteTask]);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? Colors.dark.background : Colors.light.background }]}>
      <View style={[styles.header, {
        backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
        borderBottomColor: isDark ? '#374151' : '#E5E7EB'
      }]}>
        <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#111827' }]}>{t('board.title')}</Text>
        <Text style={[styles.subtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
          {t('board.hint')}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.boardScroll}
        contentContainerStyle={styles.boardContent}
      >
        {COLUMNS.map((col, index) => (
          <Column
            key={col.id}
            columnIndex={index}
            label={t(col.labelKey) || col.label}
            color={col.color}
            tasks={tasksByStatus[col.id] || []}
            isDark={isDark}
            onDrop={handleDrop}
            onTap={handleTap}
            onDelete={handleDelete}
            noTasksLabel={t('board.noTasks')}
            deleteLabel={t('board.delete')}
          />
        ))}
      </ScrollView>

      {/* Task Edit Modal */}
      <TaskEditModal
        visible={!!editingTask}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSave}
      />
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
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
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
    minHeight: 100,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  columnTitle: {
    fontSize: 15,
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
    padding: 10,
    minHeight: 50,
  },
  emptyColumn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    // marginBottom removed - handled by container for swipe support
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  taskCardContainer: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    flex: 1,
    paddingRight: 20,
    borderRadius: 8,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  contextsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  contextTag: {
    fontSize: 11,
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeEstimateRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  timeEstimateBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  timeEstimateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
});
