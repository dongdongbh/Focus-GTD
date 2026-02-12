import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Section } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { styles } from './task-edit-modal.styles';
import { logError } from '../../lib/app-log';

interface TaskEditSectionPickerProps {
    visible: boolean;
    sections: Section[];
    projectId?: string;
    tc: ThemeColors;
    t: (key: string) => string;
    onClose: () => void;
    onSelectSection: (sectionId?: string) => void;
    onCreateSection: (projectId: string, title: string) => Promise<Section | null>;
}

export function TaskEditSectionPicker({
    visible,
    sections,
    projectId,
    tc,
    t,
    onClose,
    onSelectSection,
    onCreateSection,
}: TaskEditSectionPickerProps) {
    const [sectionQuery, setSectionQuery] = useState('');

    useEffect(() => {
        if (visible) setSectionQuery('');
    }, [visible]);

    const projectSections = useMemo(() => {
        if (!projectId) return [];
        return sections
            .filter((section) => section.projectId === projectId && !section.deletedAt)
            .sort((a, b) => {
                const aOrder = Number.isFinite(a.order) ? a.order : 0;
                const bOrder = Number.isFinite(b.order) ? b.order : 0;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.title.localeCompare(b.title);
            });
    }, [projectId, sections]);

    const normalizedQuery = sectionQuery.trim().toLowerCase();
    const filteredSections = useMemo(() => {
        if (!normalizedQuery) return projectSections;
        return projectSections.filter((section) =>
            section.title.toLowerCase().includes(normalizedQuery)
        );
    }, [projectSections, normalizedQuery]);

    const hasExactMatch = useMemo(() => {
        if (!normalizedQuery) return false;
        return projectSections.some((section) => section.title.toLowerCase() === normalizedQuery);
    }, [projectSections, normalizedQuery]);

    const handleCreateSection = async () => {
        if (!projectId) return;
        const title = sectionQuery.trim();
        if (!title) return;
        if (hasExactMatch) {
            const matched = projectSections.find((section) => section.title.toLowerCase() === normalizedQuery);
            if (matched) {
                onSelectSection(matched.id);
            }
            onClose();
            return;
        }
        try {
            const created = await onCreateSection(projectId, title);
            if (created) {
                onSelectSection(created.id);
            }
            onClose();
        } catch (error) {
            void logError(error, { scope: 'project', extra: { message: 'Failed to create section' } });
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modalCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
                    <Text style={[styles.modalTitle, { color: tc.text }]}>{t('taskEdit.sectionLabel')}</Text>
                    <TextInput
                        value={sectionQuery}
                        onChangeText={setSectionQuery}
                        placeholder={t('common.search')}
                        placeholderTextColor={tc.secondaryText}
                        style={[styles.modalInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={handleCreateSection}
                    />
                    {!hasExactMatch && sectionQuery.trim() && projectId && (
                        <Pressable onPress={handleCreateSection} style={styles.pickerItem}>
                            <Text style={[styles.pickerItemText, { color: tc.tint }]}>
                                + {t('projects.create')} &quot;{sectionQuery.trim()}&quot;
                            </Text>
                        </Pressable>
                    )}
                    <ScrollView
                        style={[styles.pickerList, { borderColor: tc.border, backgroundColor: tc.inputBg }]}
                        contentContainerStyle={{ paddingVertical: 4 }}
                    >
                        <Pressable
                            onPress={() => {
                                onSelectSection(undefined);
                                onClose();
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[styles.pickerItemText, { color: tc.text }]}>{t('taskEdit.noSectionOption')}</Text>
                        </Pressable>
                        {filteredSections.map((section) => (
                            <Pressable
                                key={section.id}
                                onPress={() => {
                                    onSelectSection(section.id);
                                    onClose();
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, { color: tc.text }]}>{section.title}</Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                    <View style={styles.modalButtons}>
                        <TouchableOpacity onPress={onClose} style={styles.modalButton}>
                            <Text style={[styles.modalButtonText, { color: tc.secondaryText }]}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
