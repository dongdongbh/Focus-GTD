import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Project } from '@mindwtr/core';
import type { ThemeColors } from '@/hooks/use-theme-colors';
import { styles } from './task-edit-modal.styles';

interface TaskEditProjectPickerProps {
    visible: boolean;
    projects: Project[];
    tc: ThemeColors;
    t: (key: string) => string;
    onClose: () => void;
    onSelectProject: (projectId?: string) => void;
    onCreateProject: (title: string) => Promise<Project>;
}

export function TaskEditProjectPicker({
    visible,
    projects,
    tc,
    t,
    onClose,
    onSelectProject,
    onCreateProject,
}: TaskEditProjectPickerProps) {
    const [projectQuery, setProjectQuery] = useState('');

    useEffect(() => {
        if (visible) setProjectQuery('');
    }, [visible]);

    const activeProjects = useMemo(() => {
        return projects
            .filter((project) => !project.deletedAt)
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [projects]);

    const normalizedProjectQuery = projectQuery.trim().toLowerCase();
    const filteredProjects = useMemo(() => {
        if (!normalizedProjectQuery) return activeProjects;
        return activeProjects.filter((project) =>
            project.title.toLowerCase().includes(normalizedProjectQuery)
        );
    }, [activeProjects, normalizedProjectQuery]);

    const hasExactProjectMatch = useMemo(() => {
        if (!normalizedProjectQuery) return false;
        return activeProjects.some((project) => project.title.toLowerCase() === normalizedProjectQuery);
    }, [activeProjects, normalizedProjectQuery]);

    const handleCreateProject = async () => {
        const title = projectQuery.trim();
        if (!title || hasExactProjectMatch) return;
        try {
            const created = await onCreateProject(title);
            onSelectProject(created.id);
            onClose();
        } catch (error) {
            console.error('Failed to create project', error);
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
                    <Text style={[styles.modalTitle, { color: tc.text }]}>{t('taskEdit.projectLabel')}</Text>
                    <TextInput
                        value={projectQuery}
                        onChangeText={setProjectQuery}
                        placeholder="Search projects"
                        placeholderTextColor={tc.secondaryText}
                        style={[styles.modalInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={handleCreateProject}
                    />
                    {!hasExactProjectMatch && projectQuery.trim() && (
                        <Pressable onPress={handleCreateProject} style={styles.pickerItem}>
                            <Text style={[styles.pickerItemText, { color: tc.tint }]}>
                                + {t('projects.create')} "{projectQuery.trim()}"
                            </Text>
                        </Pressable>
                    )}
                    <ScrollView
                        style={[styles.pickerList, { borderColor: tc.border, backgroundColor: tc.inputBg }]}
                        contentContainerStyle={{ paddingVertical: 4 }}
                    >
                        <Pressable
                            onPress={() => {
                                onSelectProject(undefined);
                                onClose();
                            }}
                            style={styles.pickerItem}
                        >
                            <Text style={[styles.pickerItemText, { color: tc.text }]}>{t('taskEdit.noProjectOption')}</Text>
                        </Pressable>
                        {filteredProjects.map((project) => (
                            <Pressable
                                key={project.id}
                                onPress={() => {
                                    onSelectProject(project.id);
                                    onClose();
                                }}
                                style={styles.pickerItem}
                            >
                                <Text style={[styles.pickerItemText, { color: tc.text }]}>{project.title}</Text>
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
