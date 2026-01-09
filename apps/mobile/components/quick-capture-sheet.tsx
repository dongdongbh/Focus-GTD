import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Pressable, ScrollView, Switch, Platform } from 'react-native';
import { CalendarDays, Folder, Flag, X, Clock } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

import { parseQuickAdd, safeFormatDate, safeParseDate, type Task, type TaskPriority, useTaskStore } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function QuickCaptureSheet({
  visible,
  onClose,
  initialProps,
  initialValue,
}: {
  visible: boolean;
  onClose: () => void;
  initialProps?: Partial<Task>;
  initialValue?: string;
}) {
  const { addTask, addProject, projects, settings } = useTaskStore();
  const { t } = useLanguage();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const prioritiesEnabled = settings?.features?.priorities === true;

  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [addAnother, setAddAnother] = useState(false);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.title.toLowerCase().includes(query));
  }, [projectQuery, projects]);

  const hasExactProjectMatch = useMemo(() => {
    if (!projectQuery.trim()) return false;
    const query = projectQuery.trim().toLowerCase();
    return projects.some((project) => project.title.toLowerCase() === query);
  }, [projectQuery, projects]);

  useEffect(() => {
    if (!visible) return;
    setValue(initialValue ?? '');
    setDueDate(initialProps?.dueDate ? safeParseDate(initialProps.dueDate) : null);
    setStartTime(initialProps?.startTime ? safeParseDate(initialProps.startTime) : null);
    setProjectId(initialProps?.projectId ?? null);
    setPriority((initialProps?.priority as TaskPriority) ?? null);
    const handle = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(handle);
  }, [visible, initialProps, initialValue]);

  useEffect(() => {
    if (prioritiesEnabled) return;
    setPriority(null);
    setShowPriorityPicker(false);
  }, [prioritiesEnabled]);

  const resetState = () => {
    setValue('');
    setDueDate(null);
    setStartTime(null);
    setProjectId(null);
    setPriority(null);
    setProjectQuery('');
    setShowProjectPicker(false);
    setShowPriorityPicker(false);
    setShowDatePicker(false);
    setShowStartPicker(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSave = async () => {
    if (!value.trim()) return;
    const { title, props, projectTitle } = parseQuickAdd(value, projects);
    const finalTitle = title || value;
    if (!finalTitle.trim()) return;

    const initialPropsMerged: Partial<Task> = { status: 'inbox', ...initialProps, ...props };
    if (!initialPropsMerged.status) initialPropsMerged.status = 'inbox';

    if (!initialPropsMerged.projectId && projectTitle) {
      const created = await addProject(projectTitle, '#94a3b8');
      initialPropsMerged.projectId = created.id;
    }

    if (projectId) initialPropsMerged.projectId = projectId;
    if (prioritiesEnabled && priority) initialPropsMerged.priority = priority;
    if (dueDate) initialPropsMerged.dueDate = dueDate.toISOString();
    if (startTime) initialPropsMerged.startTime = startTime.toISOString();

    await addTask(finalTitle, initialPropsMerged);

    if (addAnother) {
      setValue('');
      const handle = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(handle);
    }

    handleClose();
  };

  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : null;
  const dueLabel = dueDate ? safeFormatDate(dueDate, 'MMM d') : t('taskEdit.dueDateLabel');
  const startLabel = startTime ? safeFormatDate(startTime, 'MMM d, HH:mm') : t('calendar.scheduleAction');
  const projectLabel = selectedProject ? selectedProject.title : t('taskEdit.projectLabel');
  const priorityLabel = priority ? t(`priority.${priority}`) : t('taskEdit.priorityLabel');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={[styles.sheet, { backgroundColor: tc.cardBg, paddingBottom: Math.max(20, insets.bottom + 12) }]}>        
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: tc.text }]}>{t('nav.addTask')}</Text>
          <TouchableOpacity onPress={handleClose} accessibilityLabel={t('common.close')}>
            <X size={18} color={tc.secondaryText} />
          </TouchableOpacity>
        </View>

        <TextInput
          ref={inputRef}
          style={[styles.input, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
          placeholder={t('quickAdd.placeholder')}
          placeholderTextColor={tc.secondaryText}
          value={value}
          onChangeText={setValue}
          onSubmitEditing={handleSave}
          returnKeyType="done"
        />

        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
            onPress={() => setShowStartPicker(true)}
            onLongPress={() => setStartTime(null)}
          >
            <Clock size={16} color={tc.text} />
            <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{startLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
            onPress={() => setShowDatePicker(true)}
            onLongPress={() => setDueDate(null)}
          >
            <CalendarDays size={16} color={tc.text} />
            <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{dueLabel}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
            onPress={() => setShowProjectPicker(true)}
            onLongPress={() => setProjectId(null)}
          >
            <Folder size={16} color={tc.text} />
            <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{projectLabel}</Text>
          </TouchableOpacity>

          {prioritiesEnabled && (
            <TouchableOpacity
              style={[styles.optionChip, { backgroundColor: tc.filterBg, borderColor: tc.border }]}
              onPress={() => setShowPriorityPicker(true)}
              onLongPress={() => setPriority(null)}
            >
              <Flag size={16} color={tc.text} />
              <Text style={[styles.optionText, { color: tc.text }]} numberOfLines={1}>{priorityLabel}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footerRow}>
          <View style={styles.toggleRow}>
            <Switch
              value={addAnother}
              onValueChange={setAddAnother}
              thumbColor={addAnother ? tc.tint : tc.border}
              trackColor={{ false: tc.border, true: `${tc.tint}55` }}
            />
            <Text style={[styles.toggleText, { color: tc.text }]}>{t('quickAdd.addAnother')}</Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveButton, { backgroundColor: tc.tint, opacity: value.trim() ? 1 : 0.5 }]}
            disabled={!value.trim()}
          >
            <Text style={styles.saveText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== 'ios') {
              setShowDatePicker(false);
              if (event.type !== 'set') {
                return;
              }
            }
            if (selectedDate) setDueDate(selectedDate);
          }}
        />
      )}

      {showStartPicker && (
        <DateTimePicker
          value={startTime ?? new Date()}
          mode="datetime"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== 'ios') {
              setShowStartPicker(false);
              if (event.type !== 'set') {
                return;
              }
            }
            if (selectedDate) setStartTime(selectedDate);
          }}
        />
      )}

      <Modal
        visible={showProjectPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setShowProjectPicker(false)} />
          <View style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>            
            <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('taskEdit.projectLabel')}</Text>
            <TextInput
              value={projectQuery}
              onChangeText={setProjectQuery}
              placeholder={t('projects.addPlaceholder')}
              placeholderTextColor={tc.secondaryText}
              style={[styles.pickerInput, { backgroundColor: tc.inputBg, borderColor: tc.border, color: tc.text }]}
            />
            {!hasExactProjectMatch && projectQuery.trim() && (
              <Pressable
                onPress={async () => {
                  const title = projectQuery.trim();
                  if (!title) return;
                  const created = await addProject(title, '#94a3b8');
                  setProjectId(created.id);
                  setShowProjectPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.tint }]}>+ {t('projects.create')} &quot;{projectQuery.trim()}&quot;</Text>
              </Pressable>
            )}
            <ScrollView style={[styles.pickerList, { borderColor: tc.border }]} contentContainerStyle={styles.pickerListContent}>
              <Pressable
                onPress={() => {
                  setProjectId(null);
                  setShowProjectPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.text }]}>{t('taskEdit.noProjectOption')}</Text>
              </Pressable>
              {filteredProjects.map((project) => (
                <Pressable
                  key={project.id}
                  onPress={() => {
                    setProjectId(project.id);
                    setShowProjectPicker(false);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={[styles.pickerRowText, { color: tc.text }]}>{project.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {prioritiesEnabled && (
        <Modal
          visible={showPriorityPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPriorityPicker(false)}
        >
          <View style={styles.overlay}>
            <Pressable style={styles.overlayBackdrop} onPress={() => setShowPriorityPicker(false)} />
            <View style={[styles.pickerCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>            
              <Text style={[styles.pickerTitle, { color: tc.text }]}>{t('taskEdit.priorityLabel')}</Text>
              <Pressable
                onPress={() => {
                  setPriority(null);
                  setShowPriorityPicker(false);
                }}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerRowText, { color: tc.text }]}>{t('common.clear')}</Text>
              </Pressable>
              {PRIORITY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setPriority(option);
                    setShowPriorityPicker(false);
                  }}
                  style={styles.pickerRow}
                >
                  <Text style={[styles.pickerRowText, { color: tc.text }]}>{t(`priority.${option}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  optionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 120,
  },
  footerRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  pickerCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  pickerInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  pickerList: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    maxHeight: 220,
  },
  pickerListContent: {
    paddingVertical: 6,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
