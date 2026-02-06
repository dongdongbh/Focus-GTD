import React from 'react';
import { View, Text, StyleSheet, type TextStyle } from 'react-native';
import * as Linking from 'expo-linking';

import type { ThemeColors } from '@/hooks/use-theme-colors';
import { parseInlineMarkdown } from '@mindwtr/core';

const TASK_LIST_RE = /^\s{0,3}(?:[-*+]\s+)?\[( |x|X)\]\s+(.+)$/;
const BULLET_LIST_RE = /^\s{0,3}[-*+]\s+(.+)$/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const HORIZONTAL_RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;

function isBlockBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('```')) return true;
  if (HEADING_RE.test(trimmed)) return true;
  if (HORIZONTAL_RULE_RE.test(trimmed)) return true;
  if (TASK_LIST_RE.test(line)) return true;
  if (BULLET_LIST_RE.test(line)) return true;
  return false;
}

function isSafeLink(href: string): boolean {
  return /^https?:\/\//i.test(href) || /^mailto:/i.test(href);
}

function renderInline(text: string, tc: ThemeColors, keyPrefix: string): React.ReactNode[] {
  const nodes: (string | React.ReactElement | null)[] = parseInlineMarkdown(text).map((token, index) => {
    if (token.type === 'text') return token.text;
    if (token.type === 'code') {
      return (
        <Text key={`${keyPrefix}-code-${index}`} style={[styles.code, { backgroundColor: tc.filterBg, color: tc.text }]}>
          {token.text}
        </Text>
      );
    }
    if (token.type === 'bold') {
      return (
        <Text key={`${keyPrefix}-bold-${index}`} style={styles.bold}>
          {token.text}
        </Text>
      );
    }
    if (token.type === 'italic') {
      return (
        <Text key={`${keyPrefix}-italic-${index}`} style={styles.italic}>
          {token.text}
        </Text>
      );
    }
    if (token.type === 'link') {
      if (isSafeLink(token.href)) {
        return (
          <Text
            key={`${keyPrefix}-link-${index}`}
            style={[styles.link, { color: tc.tint }]}
            onPress={() => Linking.openURL(token.href)}
          >
            {token.text}
          </Text>
        );
      }
      return token.text;
    }
    return null;
  });
  return nodes.filter((node): node is string | React.ReactElement => node !== null);
}

export function MarkdownText({
  markdown,
  tc,
  direction,
}: {
  markdown: string;
  tc: ThemeColors;
  direction?: 'ltr' | 'rtl';
}) {
  const source = (markdown || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const directionStyle: TextStyle | undefined = direction
    ? { writingDirection: direction, textAlign: direction === 'rtl' ? 'right' : 'left' }
    : undefined;

  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const headingMatch = HEADING_RE.exec(line.trim());
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      blocks.push(
        <Text
          key={`h-${i}`}
          style={[
            styles.heading,
            { color: tc.text, fontSize: level === 1 ? 16 : level === 2 ? 15 : 14 },
            directionStyle,
          ]}
        >
          {renderInline(text, tc, `h-${i}`)}
        </Text>
      );
      i += 1;
      continue;
    }

    if (HORIZONTAL_RULE_RE.test(line.trim())) {
      blocks.push(
        <View key={`hr-${i}`} style={[styles.separator, { backgroundColor: tc.border }]} />
      );
      i += 1;
      continue;
    }

    const taskListMatch = TASK_LIST_RE.exec(line);
    if (taskListMatch) {
      const items: { checked: boolean; text: string }[] = [];
      const start = i;
      while (i < lines.length) {
        const m = TASK_LIST_RE.exec(lines[i]);
        if (!m) break;
        items.push({ checked: m[1].toLowerCase() === 'x', text: m[2] });
        i += 1;
      }
      blocks.push(
        <View key={`task-ul-${start}`} style={styles.list}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.taskListRow}>
              <Text style={[styles.taskListMarker, { color: tc.secondaryText }]}>
                {item.checked ? '☑' : '☐'}
              </Text>
              <Text style={[styles.paragraph, styles.taskListText, { color: tc.text }, directionStyle]}>
                {renderInline(item.text, tc, `task-li-${start}-${idx}`)}
              </Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    const listMatch = BULLET_LIST_RE.exec(line);
    if (listMatch) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length) {
        const m = BULLET_LIST_RE.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push(
        <View key={`ul-${start}`} style={styles.list}>
          {items.map((item, idx) => (
            <Text key={idx} style={[styles.paragraph, { color: tc.text }, directionStyle]}>
              • {renderInline(item, tc, `li-${start}-${idx}`)}
            </Text>
          ))}
        </View>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockBoundary(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    const text = paragraph.join(' ').trim();
    if (text) {
      blocks.push(
        <Text key={`p-${i}`} style={[styles.paragraph, { color: tc.text }, directionStyle]}>
          {renderInline(text, tc, `p-${i}`)}
        </Text>
      );
    }
  }

  return <View style={styles.container}>{blocks}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 18,
  },
  heading: {
    fontWeight: '700',
    lineHeight: 20,
  },
  list: {
    gap: 4,
    paddingLeft: 6,
  },
  taskListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  taskListMarker: {
    fontSize: 13,
    lineHeight: 18,
  },
  taskListText: {
    flexShrink: 1,
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    fontFamily: 'monospace',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  link: {
    textDecorationLine: 'underline',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
});
