import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTaskStore } from '@mindwtr/core';
import { Check, ArrowLeft, Trash2, Plus } from 'lucide-react-native';

export default function FocusChecklistPage() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { tasks, updateTask } = useTaskStore();
    const [task, setTask] = useState(tasks.find(t => t.id === id));

    // Local state for immediate feedback
    const [checklist, setChecklist] = useState(task?.checklist || []);

    useEffect(() => {
        const found = tasks.find(t => t.id === id);
        if (found) {
            setTask(found);
            setChecklist(found.checklist || []);
        }
    }, [id, tasks]);

    const handleToggle = (index: number) => {
        if (!task) return;

        const newList = [...checklist];
        newList[index].isCompleted = !newList[index].isCompleted;
        setChecklist(newList);

        // Sync with store
        updateTask(task.id, { checklist: newList });
    };

    const handleAddItem = () => {
        if (!task) return;

        const newItem = {
            id: Date.now().toString(),
            title: '',
            isCompleted: false
        };
        const newList = [...checklist, newItem];
        setChecklist(newList);
        updateTask(task.id, { checklist: newList });
    };

    const handleUpdateItem = (index: number, text: string) => {
        if (!task) return;

        const newList = [...checklist];
        newList[index].title = text;
        setChecklist(newList);
        updateTask(task.id, { checklist: newList });
    };

    const handleDeleteItem = (index: number) => {
        if (!task) return;

        const newList = checklist.filter((_, i) => i !== index);
        setChecklist(newList);
        updateTask(task.id, { checklist: newList });
    };

    if (!task) return (
        <SafeAreaView style={styles.container}>
            <Text>Task not found</Text>
        </SafeAreaView>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft color="#000" size={24} />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.titleContainer}>
                <Text style={styles.taskTitle}>{task.title}</Text>
            </View>

            <ScrollView style={styles.content}>
                <View style={styles.checklistContainer}>
                    {checklist.length === 0 && (
                        <Text style={styles.emptyText}>No items in checklist</Text>
                    )}

                    {checklist.map((item, index) => (
                        <View key={item.id || index} style={styles.itemRow}>
                            <TouchableOpacity
                                onPress={() => handleToggle(index)}
                                style={[styles.checkbox, item.isCompleted && styles.checkboxChecked]}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.6}
                            >
                                {item.isCompleted && <Check color="#fff" size={18} />}
                            </TouchableOpacity>

                            <TextInput
                                style={[styles.input, item.isCompleted && styles.inputCompleted]}
                                value={item.title}
                                onChangeText={(text) => handleUpdateItem(index, text)}
                                placeholder="Item name"
                                multiline
                            />

                            <TouchableOpacity onPress={() => handleDeleteItem(index)} style={styles.deleteBtn}>
                                <Trash2 color="#ccc" size={20} />
                            </TouchableOpacity>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.addBtn} onPress={handleAddItem}>
                        <Plus color="#007AFF" size={20} />
                        <Text style={styles.addBtnText}>Add Item</Text>
                    </TouchableOpacity>
                </View>

                {/* Bottom spacer */}
                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backText: {
        fontSize: 16,
        color: '#000',
    },
    titleContainer: {
        padding: 20,
        paddingBottom: 10,
    },
    taskTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#000',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    checklistContainer: {
        marginTop: 10,
    },
    emptyText: {
        color: '#999',
        fontStyle: 'italic',
        marginTop: 10,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    checkbox: {
        width: 28,
        height: 28,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#007AFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxChecked: {
        backgroundColor: '#007AFF',
    },
    input: {
        flex: 1,
        fontSize: 18,
        color: '#333',
        paddingVertical: 0, // Fix alignment
    },
    inputCompleted: {
        textDecorationLine: 'line-through',
        color: '#999',
    },
    deleteBtn: {
        padding: 8,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 20,
    },
    addBtnText: {
        fontSize: 16,
        color: '#007AFF',
        fontWeight: '500',
    },
});
