import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTaskStore, Task, Project } from '@mindwtr/core';
import { useTheme } from '../contexts/theme-context';
import { useLanguage } from '../contexts/language-context';
import { Colors } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { Search, X, Folder, CheckCircle, ChevronRight } from 'lucide-react-native';

export default function SearchScreen() {
    const { tasks, projects } = useTaskStore();
    const { isDark } = useTheme();
    const { t } = useLanguage();
    const router = useRouter();
    const [query, setQuery] = useState('');
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        // Auto-focus after mounting
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const tc = {
        bg: isDark ? Colors.dark.background : Colors.light.background,
        text: isDark ? Colors.dark.text : Colors.light.text,
        secondaryText: isDark ? '#9CA3AF' : '#6B7280',
        itemBg: isDark ? '#1F2937' : '#F9FAFB',
        border: isDark ? '#374151' : '#E5E7EB',
        placeholder: isDark ? '#6B7280' : '#9CA3AF',
    };

    const results = query.trim() === '' ? [] : [
        ...projects.filter(p => !p.deletedAt && p.title.toLowerCase().includes(query.toLowerCase())).map(p => ({ type: 'project' as const, item: p })),
        ...tasks.filter(t => !t.deletedAt && t.title.toLowerCase().includes(query.toLowerCase())).map(t => ({ type: 'task' as const, item: t }))
    ].slice(0, 50);

    const handleSelect = (result: { type: 'project' | 'task', item: Project | Task }) => {
        if (result.type === 'project') {
            // Navigate to Projects screen - communicating selection is tricky without Global State for UI
            // For now, just go to Projects screen
            router.push('/projects-screen');
        } else {
            const task = result.item as Task;
            if (task.projectId) {
                router.push('/projects-screen');
            } else {
                // Map status to route
                const status = task.status;
                if (status === 'inbox') router.push('/(drawer)/(tabs)/inbox');
                else if (status === 'next') router.push('/(drawer)/(tabs)/next');
                else if (status === 'waiting') router.push('/(drawer)/waiting');
                else if (status === 'someday') router.push('/(drawer)/someday');
                else router.push('/(drawer)/(tabs)/next');
            }
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
            <View style={[styles.header, { borderBottomColor: tc.border }]}>
                <Search size={20} color={tc.secondaryText} style={styles.searchIcon} />
                <TextInput
                    ref={inputRef}
                    style={[styles.input, { color: tc.text }]}
                    placeholder={t('search.placeholder') || "Search..."}
                    placeholderTextColor={tc.placeholder}
                    value={query}
                    onChangeText={setQuery}
                    returnKeyType="search"
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <X size={20} color={tc.secondaryText} />
                    </TouchableOpacity>
                )}
            </View>

            <FlatList
                data={results}
                keyExtractor={(item) => `${item.type}-${item.item.id}`}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                    query.trim() !== '' ? (
                        <View style={styles.emptyContainer}>
                            <Text style={[styles.emptyText, { color: tc.secondaryText }]}>No results found</Text>
                        </View>
                    ) : null
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={[styles.resultItem, { backgroundColor: tc.itemBg, borderColor: tc.border }]}
                        onPress={() => handleSelect(item)}
                    >
                        {item.type === 'project' ? (
                            <Folder size={24} color="#3B82F6" />
                        ) : (
                            <CheckCircle size={24} color={tc.secondaryText} />
                        )}
                        <View style={styles.resultText}>
                            <Text style={[styles.resultTitle, { color: tc.text }]}>{item.item.title}</Text>
                            <Text style={[styles.resultSubtitle, { color: tc.secondaryText }]}>
                                {item.type === 'project' ? 'Project' : (item.item as Task).projectId ? 'Task in Project' : 'Task'}
                            </Text>
                        </View>
                        <ChevronRight size={20} color={tc.secondaryText} />
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        gap: 12,
    },
    searchIcon: {
        marginRight: 4,
    },
    input: {
        flex: 1,
        fontSize: 16,
        height: 40,
    },
    listContent: {
        padding: 16,
        gap: 12,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        gap: 12,
    },
    resultText: {
        flex: 1,
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 2,
    },
    resultSubtitle: {
        fontSize: 12,
    },
    emptyContainer: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
    },
});
