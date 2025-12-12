import React, { useState } from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActionSheetIOS,
    Platform,
    ScrollView,
    Modal,
    Pressable
} from 'react-native';
import { TaskStatus, getStatusColor } from '@mindwtr/core';

interface TaskStatusBadgeProps {
    status: TaskStatus;
    onUpdate: (status: TaskStatus) => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
    inbox: 'Inbox',
    todo: 'Todo',
    next: 'Next',
    'in-progress': 'In Progress',
    waiting: 'Waiting',
    someday: 'Someday',
    done: 'Done',
    archived: 'Archived',
};

export function TaskStatusBadge({ status, onUpdate }: TaskStatusBadgeProps) {
    const [modalVisible, setModalVisible] = useState(false);
    const colors = getStatusColor(status);

    const handlePress = () => {
        // Determine relevant options based on current status
        // Always showing full list for flexibility, but could prioritize
        const options: TaskStatus[] = ['todo', 'next', 'in-progress', 'waiting', 'done', 'archived'];

        if (Platform.OS === 'ios') {
            const labels = options.map(s => STATUS_LABELS[s]);
            const cancelIndex = labels.length;
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    options: [...labels, 'Cancel'],
                    cancelButtonIndex: cancelIndex,
                },
                (buttonIndex) => {
                    if (buttonIndex < options.length) {
                        onUpdate(options[buttonIndex]);
                    }
                }
            );
        } else {
            setModalVisible(true);
        }
    };

    const handleOptionSelect = (selectedStatus: TaskStatus) => {
        onUpdate(selectedStatus);
        setModalVisible(false);
    };

    const ANDROID_OPTIONS: TaskStatus[] = ['todo', 'next', 'in-progress', 'waiting', 'done', 'archived'];

    return (
        <>
            <TouchableOpacity
                onPress={handlePress}
                style={[
                    styles.badge,
                    { backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1 }
                ]}
            >
                <Text style={[
                    styles.text,
                    { color: colors.text }
                ]}>
                    {STATUS_LABELS[status] || status}
                </Text>
            </TouchableOpacity>

            <Modal
                animationType="fade"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setModalVisible(false)}
                >
                    <Pressable
                        style={styles.modalContent}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <Text style={styles.modalTitle}>Change Status</Text>
                        <ScrollView contentContainerStyle={styles.optionsList}>
                            {ANDROID_OPTIONS.map((opt) => {
                                const optColors = getStatusColor(opt);
                                return (
                                    <Pressable
                                        key={opt}
                                        style={[
                                            styles.optionButton,
                                            opt === status && styles.optionButtonActive,
                                            { borderLeftColor: optColors.text }
                                        ]}
                                        onPress={() => handleOptionSelect(opt)}
                                    >
                                        <Text style={[
                                            styles.optionText,
                                            opt === status && styles.optionTextActive
                                        ]}>
                                            {STATUS_LABELS[opt]}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                        <Pressable
                            style={styles.cancelButton}
                            onPress={() => setModalVisible(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    text: {
        fontSize: 10,
        fontWeight: '600',
    },
    textLight: {
        color: '#FFFFFF',
    },
    textDark: {
        color: '#374151',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        width: '100%',
        maxWidth: 320,
        maxHeight: '80%',
        padding: 16,
        elevation: 5,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16,
        textAlign: 'center',
        color: '#111827',
    },
    optionsList: {
        paddingBottom: 8,
    },
    optionButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        borderLeftWidth: 4,
        borderLeftColor: 'transparent',
        backgroundColor: '#FFFFFF',
        marginBottom: 4,
        borderRadius: 4,
    },
    optionButtonActive: {
        backgroundColor: '#F9FAFB',
    },
    optionText: {
        fontSize: 16,
        color: '#374151',
    },
    optionTextActive: {
        fontWeight: '600',
        color: '#111827',
    },
    cancelButton: {
        marginTop: 8,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
    },
});
