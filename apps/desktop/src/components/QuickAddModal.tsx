import { useEffect, useRef, useState } from 'react';
import { useTaskStore, parseQuickAdd, Task } from '@mindwtr/core';
import { useLanguage } from '../contexts/language-context';
import { cn } from '../lib/utils';
import { isTauriRuntime } from '../lib/runtime';

export function QuickAddModal() {
    const { addTask, projects } = useTaskStore();
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!isTauriRuntime()) return;

        let unlisten: (() => void) | undefined;
        const openFromTauri = async () => {
            setIsOpen(true);
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                await invoke<boolean>('consume_quick_add_pending');
            } catch (e) {
                console.error(e);
            }
        };

        const setup = async () => {
            const [{ listen }, { invoke }] = await Promise.all([
                import('@tauri-apps/api/event'),
                import('@tauri-apps/api/core'),
            ]);

            unlisten = await listen('quick-add', () => {
                openFromTauri().catch(console.error);
            });

            const pending = await invoke<boolean>('consume_quick_add_pending');
            if (pending) {
                setIsOpen(true);
            }
        };

        setup().catch(console.error);

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    useEffect(() => {
        const handler = () => setIsOpen(true);
        window.addEventListener('mindwtr:quick-add', handler);
        return () => window.removeEventListener('mindwtr:quick-add', handler);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setValue('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const close = () => setIsOpen(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        const { title, props } = parseQuickAdd(value, projects);
        const finalTitle = title || value;
        if (!finalTitle.trim()) return;
        const initialProps: Partial<Task> = { status: 'inbox', ...props };
        if (!props.status) initialProps.status = 'inbox';
        addTask(finalTitle, initialProps);
        close();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[20vh] z-50" onClick={close}>
            <div
                className="w-full max-w-lg bg-popover text-popover-foreground rounded-xl border shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b flex items-center justify-between">
                    <h3 className="font-semibold">{t('nav.addTask')}</h3>
                    <button onClick={close} className="text-sm text-muted-foreground hover:text-foreground">Esc</button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-2">
                    <input
                        ref={inputRef}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                close();
                            }
                        }}
                        placeholder={t('nav.addTask')}
                        className={cn(
                            "w-full bg-card border border-border rounded-lg py-3 px-4 shadow-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all",
                        )}
                    />
                    <p className="text-xs text-muted-foreground">{t('quickAdd.help')}</p>
                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={close}
                            className="px-3 py-1.5 rounded-md text-sm bg-muted hover:bg-muted/80"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
