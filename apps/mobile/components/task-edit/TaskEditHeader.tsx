import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';

import { useLanguage } from '../../contexts/language-context';
import { useThemeColors } from '../../hooks/use-theme-colors';

type TaskEditHeaderProps = {
  title: string;
  onDone: () => void;
  onShare: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConvertToReference?: () => void;
  showConvertToReference?: boolean;
};

export function TaskEditHeader({
  title,
  onDone,
  onShare,
  onDuplicate,
  onDelete,
  onConvertToReference,
  showConvertToReference = false,
}: TaskEditHeaderProps) {
  const { t } = useLanguage();
  const tc = useThemeColors();
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <>
      <View style={[styles.header, { backgroundColor: tc.cardBg, borderBottomColor: tc.border }]}>
        <View style={[styles.headerSide, styles.headerLeft]}>
          <TouchableOpacity onPress={() => setMenuVisible(true)}>
            <Text style={[styles.headerBtn, { color: tc.tint }]}>•••</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.headerTitle, { color: tc.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.headerSide, styles.headerRight]}>
          <TouchableOpacity onPress={onDone}>
            <Text style={[styles.headerBtn, { color: tc.tint }]}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: tc.cardBg, borderColor: tc.border }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onShare();
              }}
            >
              <Text style={[styles.menuItemText, { color: tc.text }]}>{t('common.share')}</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onDuplicate();
              }}
            >
              <Text style={[styles.menuItemText, { color: tc.text }]}>{t('taskEdit.duplicateTask')}</Text>
            </Pressable>
            {showConvertToReference && onConvertToReference && (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  onConvertToReference();
                }}
              >
                <Text style={[styles.menuItemText, { color: tc.text }]}>{t('task.convertToReference')}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                onDelete();
              }}
            >
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>{t('common.delete')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBtn: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  headerSide: {
    minWidth: 56,
  },
  headerLeft: {
    alignItems: 'flex-start',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    width: 220,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
