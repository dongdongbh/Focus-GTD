import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Area } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { styles } from './task-edit-modal.styles';
import { logError } from '../../lib/app-log';

interface TaskEditAreaPickerProps {
    visible: boolean;
    areas: Area[];
    tc: ThemeColors;
    t: (key: string) => string;
    onClose: () => void;
    onSelectArea: (areaId?: string) => void;
    onCreateArea: (name: string) => Promise<Area | null>;
}

export function TaskEditAreaPicker({
    visible,
    areas = [],
    tc,
    t,
    onClose,
    onSelectArea,
    onCreateArea,
}: TaskEditAreaPickerProps) {
    const [areaQuery, setAreaQuery] = useState('');

    useEffect(() => {
        if (visible) setAreaQuery('');
    }, [visible]);

    const activeAreas = useMemo(() => {
        return [...areas].sort((a, b) => a.name.localeCompare(b.name));
    }, [areas]);

    const normalizedAreaQuery = areaQuery.trim().toLowerCase();
    const filteredAreas = useMemo(() => {
        if (!normalizedAreaQuery) return activeAreas;
        return activeAreas.filter((area) =>
            area.name.toLowerCase().includes(normalizedAreaQuery)
        );
    }, [activeAreas, normalizedAreaQuery]);

    const hasExactAreaMatch = useMemo(() => {
        if (!normalizedAreaQuery) return false;
        return activeAreas.some((area) => area.name.toLowerCase() === normalizedAreaQuery);
    }, [activeAreas, normalizedAreaQuery]);

    const handleCreateArea = async () => {
        const name = areaQuery.trim();
        if (!name) return;
        if (hasExactAreaMatch) {
            const matched = activeAreas.find((area) => area.name.toLowerCase() === normalizedAreaQuery);
            if (matched) {
                onSelectArea(matched.id);
            }
            onClose();
            return;
        }
        try {
            const created = await onCreateArea(name);
            if (created) {
                onSelectArea(created.id);
            }
            onClose();
        } catch (error) {
            void logError(error, { scope: 'project', extra: { message: 'Failed to create area' } });
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
                    <Text style={[styles.modalTitle, { color: tc.text }]}>{t('taskEdit.areaLabel')}</Text>
                    <TextInput
                        value={areaQuery}
                        onChangeText={setAreaQuery}
                        placeholder={t('common.search')}
                        placeholderTextColor={tc.secondaryText}
                        style={[styles.modalInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        blurOnSubmit
                        onSubmitEditing={handleCreateArea}
                    />
                    {!hasExactAreaMatch && areaQuery.trim() && (
                        <Pressable onPress={handleCreateArea} style={styles.pickerItem}>
                            <Text style={[styles.pickerItemText, { color: tc.tint }]}>
                                + {t('areas.create')} &quot;{areaQuery.trim()}&quot;
                            </Text>
                        </Pressable>
                    )}
                    <ScrollView
                        style={[styles.pickerList, { borderColor: tc.border, backgroundColor: tc.inputBg }]}
                        contentContainerStyle={{ paddingVertical: 4 }}
                    >
                        <Pressable
                            onPress={() => {
                                onSelectArea(undefined);
                                onClose();
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[styles.pickerItemText, { color: tc.text }]}>{t('taskEdit.noAreaOption')}</Text>
                        </Pressable>
                        {filteredAreas.map((area) => (
                            <Pressable
                                key={area.id}
                                onPress={() => {
                                    onSelectArea(area.id);
                                    onClose();
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, { color: tc.text }]}>{area.name}</Text>
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
