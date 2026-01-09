import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { Task, TaskEditorFieldId, TimeEstimate } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';

type CopilotSuggestion = { context?: string; timeEstimate?: TimeEstimate; tags?: string[] };

type TaskEditFormTabProps = {
    t: (key: string) => string;
    tc: ThemeColors;
    styles: Record<string, any>;
    inputStyle: Record<string, any>;
    editedTask: Partial<Task>;
    setEditedTask: React.Dispatch<React.SetStateAction<Partial<Task>>>;
    resetCopilotDraft: () => void;
    aiEnabled: boolean;
    isAIWorking: boolean;
    handleAIClarify: () => void;
    handleAIBreakdown: () => void;
    copilotSuggestion: CopilotSuggestion | null;
    copilotApplied: boolean;
    applyCopilotSuggestion: () => void;
    copilotContext: string | undefined;
    copilotEstimate: TimeEstimate | undefined;
    copilotTags: string[];
    timeEstimatesEnabled: boolean;
    task: Task | null;
    handleDuplicateTask: () => void;
    fieldIdsToRender: TaskEditorFieldId[];
    renderField: (fieldId: TaskEditorFieldId) => React.ReactNode;
    hasHiddenFields: boolean;
    showMoreOptions: boolean;
    setShowMoreOptions: React.Dispatch<React.SetStateAction<boolean>>;
    showDatePicker: string | null;
    pendingStartDate: Date | null;
    pendingDueDate: Date | null;
    getSafePickerDateValue: (dateStr?: string) => Date;
    onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
    containerWidth: number;
};

export function TaskEditFormTab({
    t,
    tc,
    styles,
    inputStyle,
    editedTask,
    setEditedTask,
    resetCopilotDraft,
    aiEnabled,
    isAIWorking,
    handleAIClarify,
    handleAIBreakdown,
    copilotSuggestion,
    copilotApplied,
    applyCopilotSuggestion,
    copilotContext,
    copilotEstimate,
    copilotTags,
    timeEstimatesEnabled,
    task,
    handleDuplicateTask,
    fieldIdsToRender,
    renderField,
    hasHiddenFields,
    showMoreOptions,
    setShowMoreOptions,
    showDatePicker,
    pendingStartDate,
    pendingDueDate,
    getSafePickerDateValue,
    onDateChange,
    containerWidth,
}: TaskEditFormTabProps) {
    return (
        <View style={[styles.tabPage, { width: containerWidth || '100%' }]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.contentContainer}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                >
                    <View style={styles.formGroup}>
                        <Text style={[styles.label, { color: tc.secondaryText }]}>{t('taskEdit.titleLabel')}</Text>
                        <TextInput
                            style={[styles.input, inputStyle]}
                            value={editedTask.title}
                            onChangeText={(text) => {
                                setEditedTask((prev) => ({ ...prev, title: text }));
                                resetCopilotDraft();
                            }}
                            placeholderTextColor={tc.secondaryText}
                        />
                    </View>
                    {aiEnabled && (
                        <View style={styles.aiRow}>
                            <TouchableOpacity
                                style={[styles.aiButton, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
                                onPress={handleAIClarify}
                                disabled={isAIWorking}
                            >
                                <Text style={[styles.aiButtonText, { color: tc.tint }]}>{t('taskEdit.aiClarify')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.aiButton, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
                                onPress={handleAIBreakdown}
                                disabled={isAIWorking}
                            >
                                <Text style={[styles.aiButtonText, { color: tc.tint }]}>{t('taskEdit.aiBreakdown')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {aiEnabled && copilotSuggestion && !copilotApplied && (
                        <TouchableOpacity
                            style={[styles.copilotPill, { borderColor: tc.border, backgroundColor: tc.filterBg }]}
                            onPress={applyCopilotSuggestion}
                        >
                            <Text style={[styles.copilotText, { color: tc.text }]}>
                                ✨ {t('copilot.suggested')}{' '}
                                {copilotSuggestion.context ? `${copilotSuggestion.context} ` : ''}
                                {timeEstimatesEnabled && copilotSuggestion.timeEstimate ? `${copilotSuggestion.timeEstimate}` : ''}
                                {copilotSuggestion.tags?.length ? copilotSuggestion.tags.join(' ') : ''}
                            </Text>
                            <Text style={[styles.copilotHint, { color: tc.secondaryText }]}>
                                {t('copilot.applyHint')}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {aiEnabled && copilotApplied && (
                        <View style={[styles.copilotPill, { borderColor: tc.border, backgroundColor: tc.filterBg }]}>
                            <Text style={[styles.copilotText, { color: tc.text }]}>
                                ✅ {t('copilot.applied')}{' '}
                                {copilotContext ? `${copilotContext} ` : ''}
                                {timeEstimatesEnabled && copilotEstimate ? `${copilotEstimate}` : ''}
                                {copilotTags.length ? copilotTags.join(' ') : ''}
                            </Text>
                        </View>
                    )}
                    {task && (
                        <View style={styles.checklistActions}>
                            <TouchableOpacity
                                style={[styles.checklistActionButton, { backgroundColor: tc.cardBg, borderColor: tc.border }]}
                                onPress={handleDuplicateTask}
                            >
                                <Text style={[styles.checklistActionText, { color: tc.secondaryText }]}>
                                    {t('taskEdit.duplicateTask')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {fieldIdsToRender.map((fieldId) => (
                        <React.Fragment key={fieldId}>
                            {renderField(fieldId)}
                        </React.Fragment>
                    ))}

                    {hasHiddenFields && (
                        <TouchableOpacity
                            style={[styles.moreOptionsButton, { borderColor: tc.border, backgroundColor: tc.cardBg }]}
                            onPress={() => setShowMoreOptions((prev) => !prev)}
                        >
                            <Text style={[styles.moreOptionsText, { color: tc.tint }]}>
                                {showMoreOptions ? t('taskEdit.hideOptions') : t('taskEdit.moreOptions')}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <View style={{ height: 100 }} />

                    {showDatePicker && (
                        <DateTimePicker
                            value={(() => {
                                if (showDatePicker === 'start') return getSafePickerDateValue(editedTask.startTime);
                                if (showDatePicker === 'start-time') return pendingStartDate ?? getSafePickerDateValue(editedTask.startTime);
                                if (showDatePicker === 'review') return getSafePickerDateValue(editedTask.reviewAt);
                                if (showDatePicker === 'due-time') return pendingDueDate ?? getSafePickerDateValue(editedTask.dueDate);
                                return getSafePickerDateValue(editedTask.dueDate);
                            })()}
                            mode={
                                showDatePicker === 'start-time' || showDatePicker === 'due-time'
                                    ? 'time'
                                    : (showDatePicker === 'start' || showDatePicker === 'due') && Platform.OS !== 'android'
                                        ? 'datetime'
                                        : 'date'
                            }
                            display="default"
                            onChange={onDateChange}
                        />
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
