import { useMemo, useRef, useState } from 'react';
import type { KeyboardEventHandler, RefObject } from 'react';
import type { Project } from '@mindwtr/core';
import { cn } from '../../lib/utils';

type TriggerType = 'project' | 'context';

interface TriggerState {
    type: TriggerType;
    start: number;
    end: number;
    query: string;
}

type Option =
    | { kind: 'create'; label: string; value: string }
    | { kind: 'project'; label: string; value: string }
    | { kind: 'context'; label: string; value: string };

interface TaskInputProps {
    value: string;
    onChange: (value: string) => void;
    projects: Project[];
    contexts: readonly string[];
    onCreateProject?: (title: string) => Promise<string | null>;
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
    inputRef?: RefObject<HTMLInputElement | null>;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}

function getTrigger(text: string, caret: number): TriggerState | null {
    if (caret < 0) return null;
    const before = text.slice(0, caret);
    const lastSpace = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n'), before.lastIndexOf('\t'));
    const start = lastSpace + 1;
    const token = before.slice(start);
    if (!token.startsWith('+') && !token.startsWith('@')) return null;
    const type: TriggerType = token.startsWith('+') ? 'project' : 'context';
    return {
        type,
        start,
        end: caret,
        query: token.slice(1),
    };
}

export function TaskInput({
    value,
    onChange,
    projects,
    contexts,
    onCreateProject,
    placeholder,
    className,
    autoFocus,
    inputRef,
    onKeyDown,
}: TaskInputProps) {
    const localRef = useRef<HTMLInputElement>(null);
    const mergedRef = inputRef ?? localRef;
    const [trigger, setTrigger] = useState<TriggerState | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const options = useMemo<Option[]>(() => {
        if (!trigger) return [];
        const query = trigger.query.trim().toLowerCase();
        if (trigger.type === 'project') {
            const matches = projects.filter((project) =>
                project.title.toLowerCase().includes(query)
            );
            const hasExact = query.length > 0 && projects.some((project) => project.title.toLowerCase() === query);
            const result: Option[] = [];
            if (!hasExact && query.length > 0) {
                result.push({
                    kind: 'create' as const,
                    label: `Create Project "${trigger.query.trim()}"`,
                    value: trigger.query.trim(),
                });
            }
            result.push(
                ...matches.map((project) => ({
                    kind: 'project' as const,
                    label: project.title,
                    value: project.title,
                }))
            );
            return result;
        }
        const matches = contexts.filter((context) => {
            const raw = context.startsWith('@') || context.startsWith('#') ? context.slice(1) : context;
            return raw.toLowerCase().includes(query);
        });
        return matches.map((context) => ({
            kind: 'context' as const,
            label: context,
            value: context,
        }));
    }, [trigger, projects, contexts]);

    const closeTrigger = () => {
        setTrigger(null);
        setSelectedIndex(0);
    };

    const updateTrigger = (text: string, caret: number) => {
        const nextTrigger = getTrigger(text, caret);
        setTrigger(nextTrigger);
        setSelectedIndex(0);
    };

    const applyOption = async (option: Option) => {
        if (!trigger) return;
        let tokenValue = option.value;
        if (option.kind === 'create' && onCreateProject) {
            const title = option.value.trim();
            if (title) {
                await onCreateProject(title);
            }
        }
        if (trigger.type === 'project') {
            tokenValue = `+${tokenValue}`;
        } else {
            tokenValue = tokenValue.startsWith('@') ? tokenValue : `@${tokenValue}`;
        }

        const before = value.slice(0, trigger.start);
        const after = value.slice(trigger.end);
        const needsSpace = after.length > 0 && !/^\s/.test(after);
        const nextValue = `${before}${tokenValue}${needsSpace ? ' ' : ''}${after}`;
        onChange(nextValue);
        closeTrigger();

        requestAnimationFrame(() => {
            const caret = before.length + tokenValue.length + (needsSpace ? 1 : 0);
            mergedRef.current?.setSelectionRange(caret, caret);
        });
    };

    const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = async (event) => {
        if (trigger && options.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                setSelectedIndex((prev) => (prev + 1) % options.length);
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                await applyOption(options[selectedIndex]);
                return;
            }
            if (event.key === 'Escape') {
                event.stopPropagation();
                closeTrigger();
                return;
            }
        }
        onKeyDown?.(event);
    };

    return (
        <div className="relative">
            <input
                ref={mergedRef}
                value={value}
                autoFocus={autoFocus}
                onChange={(event) => {
                    const text = event.target.value;
                    onChange(text);
                    updateTrigger(text, event.target.selectionStart ?? text.length);
                }}
                onKeyDown={handleKeyDown}
                onClick={(event) => {
                    const target = event.target as HTMLInputElement;
                    updateTrigger(target.value, target.selectionStart ?? target.value.length);
                }}
                onKeyUp={(event) => {
                    if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) return;
                    const target = event.currentTarget;
                    updateTrigger(target.value, target.selectionStart ?? target.value.length);
                }}
                onBlur={() => {
                    window.setTimeout(() => closeTrigger(), 200);
                }}
                placeholder={placeholder}
                className={className}
            />
            {trigger && options.length > 0 && (
                <div className="absolute z-20 mt-2 w-64 rounded-md border border-border bg-popover shadow-lg p-1 text-xs">
                    {options.map((option, index) => (
                        <button
                            key={`${option.kind}-${option.value}-${index}`}
                            type="button"
                            onClick={() => void applyOption(option)}
                            className={cn(
                                'w-full text-left px-2 py-1 rounded hover:bg-muted/50',
                                index === selectedIndex && 'bg-muted/70'
                            )}
                        >
                            {option.kind === 'create' ? `✨ ${option.label}` : option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
