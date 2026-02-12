import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { Task, TaskEditorFieldId, TimeEstimate } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { CollapsibleSection } from './CollapsibleSection';

type CopilotSuggestion = { context?: string; timeEstimate?: TimeEstimate; tags?: string[] };

type TaskEditFormTabProps = {
    t: (key: string) => string;
    tc: ThemeColors;
    styles: Record<string, any>;
    inputStyle: Record<string, any>;
    editedTask: Partial<Task>;
    setEditedTask: React.Dispatch<React.SetStateAction<Partial<Task>>>;
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
    renderField: (fieldId: TaskEditorFieldId) => React.ReactNode;
    alwaysFields: TaskEditorFieldId[];
    schedulingFields: TaskEditorFieldId[];
    organizationFields: TaskEditorFieldId[];
    detailsFields: TaskEditorFieldId[];
    showDatePicker: string | null;
    pendingStartDate: Date | null;
    pendingDueDate: Date | null;
    getSafePickerDateValue: (dateStr?: string) => Date;
    onDateChange: (event: DateTimePickerEvent, selectedDate?: Date) => void;
    containerWidth: number;
    textDirectionStyle: Record<string, any>;
    titleDraft: string;
    onTitleDraftChange: (text: string) => void;
};

export function TaskEditFormTab({
    t,
    tc,
    styles,
    inputStyle,
    editedTask,
    setEditedTask,
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
    renderField,
    alwaysFields,
    schedulingFields,
    organizationFields,
    detailsFields,
    showDatePicker,
    pendingStartDate,
    pendingDueDate,
    getSafePickerDateValue,
    onDateChange,
    containerWidth,
    textDirectionStyle,
    titleDraft,
    onTitleDraftChange,
}: TaskEditFormTabProps) {
    const [titleFocused, setTitleFocused] = React.useState(false);
    const countFilledFields = (fieldIds: TaskEditorFieldId[]): number => {
        return fieldIds.filter((fieldId) => {
            switch (fieldId) {
                case 'startTime':
                    return Boolean(editedTask.startTime);
                case 'recurrence':
                    return Boolean(editedTask.recurrence);
                case 'reviewAt':
                    return Boolean(editedTask.reviewAt);
                case 'contexts':
                    return (editedTask.contexts?.length ?? 0) > 0;
                case 'tags':
                    return (editedTask.tags?.length ?? 0) > 0;
                case 'priority':
                    return Boolean(editedTask.priority);
                case 'timeEstimate':
                    return Boolean(editedTask.timeEstimate);
                case 'description':
                    return Boolean(String(editedTask.description ?? '').trim());
                case 'checklist':
                    return (editedTask.checklist?.length ?? 0) > 0;
                case 'attachments':
                    return (editedTask.attachments || []).some((attachment) => !attachment.deletedAt);
                case 'textDirection':
                    return Boolean(editedTask.textDirection);
                default:
                    return false;
            }
        }).length;
    };

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
                            style={[styles.input, inputStyle, textDirectionStyle]}
                            value={titleDraft}
                            onChangeText={(text) => onTitleDraftChange(text)}
                            placeholderTextColor={tc.secondaryText}
                            onFocus={() => setTitleFocused(true)}
                            onBlur={() => setTitleFocused(false)}
                            selection={titleFocused ? undefined : { start: 0, end: 0 }}
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
                            {isAIWorking && (
                                <View style={styles.aiWorking}>
                                    <ActivityIndicator size="small" color={tc.tint} />
                                    <Text style={[styles.aiWorkingText, { color: tc.secondaryText }]}>
                                        {t('ai.working') || 'Working…'}
                                    </Text>
                                </View>
                            )}
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
                    {alwaysFields.map((fieldId) => (
                        <React.Fragment key={fieldId}>{renderField(fieldId)}</React.Fragment>
                    ))}

                    <CollapsibleSection
                        title={t('taskEdit.scheduling')}
                        badge={countFilledFields(['startTime', 'recurrence', 'reviewAt'])}
                        defaultExpanded={countFilledFields(['startTime', 'recurrence', 'reviewAt']) > 0}
                    >
                        {schedulingFields.length === 0 ? (
                            <View style={[styles.emptySectionHint, { borderColor: tc.border, backgroundColor: tc.filterBg }]}>
                                <Text style={[styles.emptySectionHintText, { color: tc.secondaryText }]}>
                                    {t('taskEdit.schedulingEmpty')}
                                </Text>
                            </View>
                        ) : (
                            schedulingFields.map((fieldId) => (
                                <React.Fragment key={fieldId}>{renderField(fieldId)}</React.Fragment>
                            ))
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection
                        title={t('taskEdit.organization')}
                        badge={countFilledFields(['contexts', 'tags', 'priority', 'timeEstimate'])}
                        defaultExpanded={countFilledFields(['contexts', 'tags']) > 0}
                    >
                        {organizationFields.length === 0 ? (
                            <View style={[styles.emptySectionHint, { borderColor: tc.border, backgroundColor: tc.filterBg }]}>
                                <Text style={[styles.emptySectionHintText, { color: tc.secondaryText }]}>
                                    {t('taskEdit.organizationEmpty')}
                                </Text>
                            </View>
                        ) : (
                            organizationFields.map((fieldId) => (
                                <React.Fragment key={fieldId}>{renderField(fieldId)}</React.Fragment>
                            ))
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection
                        title={t('taskEdit.details')}
                        badge={countFilledFields(['description', 'checklist', 'attachments'])}
                        defaultExpanded={countFilledFields(['description', 'checklist', 'attachments']) > 0}
                    >
                        {detailsFields.length === 0 ? (
                            <View style={[styles.emptySectionHint, { borderColor: tc.border, backgroundColor: tc.filterBg }]}>
                                <Text style={[styles.emptySectionHintText, { color: tc.secondaryText }]}>
                                    {t('taskEdit.detailsEmpty')}
                                </Text>
                            </View>
                        ) : (
                            detailsFields.map((fieldId) => (
                                <React.Fragment key={fieldId}>{renderField(fieldId)}</React.Fragment>
                            ))
                        )}
                    </CollapsibleSection>

                    <View style={{ height: 100 }} />

                    {showDatePicker && Platform.OS === 'android' && (
                        <View>
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
                                        : 'date'
                                }
                                display="default"
                                onChange={onDateChange}
                            />
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
