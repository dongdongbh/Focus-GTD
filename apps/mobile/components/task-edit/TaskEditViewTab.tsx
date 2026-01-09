import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type {
  Attachment,
  Project,
  RecurrenceRule,
  RecurrenceStrategy,
  Task,
  TimeEstimate,
} from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { MarkdownText } from '../markdown-text';

type TaskEditViewTabProps = {
  t: (key: string) => string;
  tc: ThemeColors;
  styles: Record<string, any>;
  mergedTask: Partial<Task>;
  projects: Project[];
  prioritiesEnabled: boolean;
  timeEstimatesEnabled: boolean;
  formatTimeEstimateLabel: (value: TimeEstimate) => string;
  formatDate: (value: string) => string;
  formatDueDate: (value: string) => string;
  getRecurrenceRuleValue: (recurrence: Task['recurrence']) => RecurrenceRule | '';
  getRecurrenceStrategyValue: (recurrence: Task['recurrence']) => RecurrenceStrategy;
  applyChecklistUpdate: (checklist: NonNullable<Task['checklist']>) => void;
  visibleAttachments: Attachment[];
  openAttachment: (attachment: Attachment) => void;
  isImageAttachment: (attachment: Attachment) => boolean;
  nestedScrollEnabled?: boolean;
};

export function TaskEditViewTab({
  t,
  tc,
  styles,
  mergedTask,
  projects,
  prioritiesEnabled,
  timeEstimatesEnabled,
  formatTimeEstimateLabel,
  formatDate,
  formatDueDate,
  getRecurrenceRuleValue,
  getRecurrenceStrategyValue,
  applyChecklistUpdate,
  visibleAttachments,
  openAttachment,
  isImageAttachment,
  nestedScrollEnabled,
}: TaskEditViewTabProps) {
  const renderViewRow = (label: string, value?: string) => {
    if (value === undefined || value === null || value === '') return null;
    return (
      <View style={[styles.viewRow, { backgroundColor: tc.inputBg, borderColor: tc.border }]}>
        <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{label}</Text>
        <Text style={[styles.viewValue, { color: tc.text }]}>{value}</Text>
      </View>
    );
  };

  const renderViewPills = (items: string[] | undefined) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={styles.viewPillRow}>
        {items.map((item) => (
          <View key={item} style={[styles.viewPill, { borderColor: tc.border, backgroundColor: tc.inputBg }]}>
            <Text style={[styles.viewPillText, { color: tc.text }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  };

  const project = projects.find((p) => p.id === mergedTask.projectId);
  const description = String(mergedTask.description || '').trim();
  const checklist = mergedTask.checklist || [];

  const statusLabel = mergedTask.status ? (t(`status.${mergedTask.status}`) || mergedTask.status) : undefined;
  const priorityLabel = mergedTask.priority ? (t(`priority.${mergedTask.priority}`) || mergedTask.priority) : undefined;
  const timeEstimateLabel = mergedTask.timeEstimate
    ? (formatTimeEstimateLabel(mergedTask.timeEstimate as TimeEstimate) || String(mergedTask.timeEstimate))
    : undefined;
  const recurrenceRule = getRecurrenceRuleValue(mergedTask.recurrence);
  const recurrenceStrategy = getRecurrenceStrategyValue(mergedTask.recurrence);
  const recurrenceLabel = recurrenceRule
    ? `${t(`recurrence.${recurrenceRule}`) || recurrenceRule}${recurrenceStrategy === 'fluid' ? ` · ${t('recurrence.afterCompletionShort')}` : ''}`
    : undefined;

  return (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled={nestedScrollEnabled}
    >
      {renderViewRow(t('taskEdit.statusLabel'), statusLabel)}
      {prioritiesEnabled ? renderViewRow(t('taskEdit.priorityLabel'), priorityLabel) : null}
      {renderViewRow(t('taskEdit.projectLabel'), project?.title)}
      {renderViewRow(t('taskEdit.startDateLabel'), mergedTask.startTime ? formatDate(mergedTask.startTime) : undefined)}
      {renderViewRow(t('taskEdit.dueDateLabel'), mergedTask.dueDate ? formatDueDate(mergedTask.dueDate) : undefined)}
      {renderViewRow(t('taskEdit.reviewDateLabel'), mergedTask.reviewAt ? formatDate(mergedTask.reviewAt) : undefined)}
      {timeEstimatesEnabled ? renderViewRow(t('taskEdit.timeEstimateLabel'), timeEstimateLabel) : null}
      {mergedTask.contexts?.length ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{t('taskEdit.contextsLabel')}</Text>
          {renderViewPills(mergedTask.contexts)}
        </View>
      ) : null}
      {mergedTask.tags?.length ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{t('taskEdit.tagsLabel')}</Text>
          {renderViewPills(mergedTask.tags)}
        </View>
      ) : null}
      {mergedTask.location ? renderViewRow(t('taskEdit.locationLabel'), mergedTask.location) : null}
      {recurrenceLabel ? renderViewRow(t('taskEdit.recurrenceLabel'), recurrenceLabel) : null}
      {description ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{t('taskEdit.descriptionLabel')}</Text>
          <View style={[styles.viewCard, { borderColor: tc.border, backgroundColor: tc.inputBg }]}
          >
            <MarkdownText markdown={description} tc={tc} />
          </View>
        </View>
      ) : null}
      {checklist.length ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{t('taskEdit.checklist')}</Text>
          <View style={styles.viewChecklist}>
            {checklist.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.viewChecklistItem}
                onPress={() => {
                  const nextChecklist = checklist.map((entry) =>
                    entry.id === item.id ? { ...entry, isCompleted: !entry.isCompleted } : entry
                  );
                  applyChecklistUpdate(nextChecklist);
                }}
              >
                <Text style={[styles.viewChecklistMarker, { color: item.isCompleted ? tc.tint : tc.secondaryText }]}>
                  {item.isCompleted ? '✓' : '○'}
                </Text>
                <Text style={[styles.viewChecklistText, { color: tc.text }]}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {visibleAttachments.length ? (
        <View style={styles.viewSection}>
          <Text style={[styles.viewLabel, { color: tc.secondaryText }]}>{t('attachments.title')}</Text>
          <View style={styles.viewAttachmentGrid}>
            {visibleAttachments.map((attachment) => (
              <TouchableOpacity
                key={attachment.id}
                style={[styles.viewAttachmentCard, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                onPress={() => openAttachment(attachment)}
              >
                {isImageAttachment(attachment) ? (
                  <Image source={{ uri: attachment.uri }} style={styles.viewAttachmentImage} />
                ) : (
                  <Text style={[styles.viewAttachmentText, { color: tc.text }]} numberOfLines={2}>
                    {attachment.title}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
