import { KeybindingStyle } from '../contexts/keybinding-context';

interface KeybindingHelpModalProps {
    style: KeybindingStyle;
    onClose: () => void;
    currentView: string;
    t: (key: string) => string;
}

type HelpItem = { keys: string; labelKey: string };

export function KeybindingHelpModal({ style, onClose, currentView, t }: KeybindingHelpModalProps) {
    const vimGlobal: HelpItem[] = [
        { keys: '/', labelKey: 'keybindings.openSearch' },
        { keys: '?', labelKey: 'keybindings.openHelp' },
        { keys: 'Ctrl-b', labelKey: 'keybindings.toggleSidebar' },
        { keys: 'gi', labelKey: 'keybindings.goInbox' },
        { keys: 'gn', labelKey: 'keybindings.goNext' },
        { keys: 'ga', labelKey: 'keybindings.goAgenda' },
        { keys: 'gp', labelKey: 'keybindings.goProjects' },
        { keys: 'gc', labelKey: 'keybindings.goContexts' },
        { keys: 'gr', labelKey: 'keybindings.goReview' },
        { keys: 'gw', labelKey: 'keybindings.goWaiting' },
        { keys: 'gs', labelKey: 'keybindings.goSomeday' },
        { keys: 'gl', labelKey: 'keybindings.goCalendar' },
        { keys: 'gb', labelKey: 'keybindings.goBoard' },
        { keys: 'gd', labelKey: 'keybindings.goDone' },
        { keys: 'gA', labelKey: 'keybindings.goArchived' },
    ];

    const vimList: HelpItem[] = [
        { keys: 'j / k', labelKey: 'keybindings.list.nextPrev' },
        { keys: 'gg / G', labelKey: 'keybindings.list.firstLast' },
        { keys: 'e', labelKey: 'keybindings.list.edit' },
        { keys: 'x', labelKey: 'keybindings.list.toggleDone' },
        { keys: 'dd', labelKey: 'keybindings.list.delete' },
        { keys: 'o', labelKey: 'keybindings.list.newTask' },
    ];

    const emacsGlobal: HelpItem[] = [
        { keys: 'Ctrl-s', labelKey: 'keybindings.openSearch' },
        { keys: 'Ctrl-h', labelKey: 'keybindings.openHelp' },
        { keys: 'Ctrl-b', labelKey: 'keybindings.toggleSidebar' },
        { keys: 'Alt-i', labelKey: 'keybindings.goInbox' },
        { keys: 'Alt-n', labelKey: 'keybindings.goNext' },
        { keys: 'Alt-a', labelKey: 'keybindings.goAgenda' },
        { keys: 'Alt-p', labelKey: 'keybindings.goProjects' },
        { keys: 'Alt-c', labelKey: 'keybindings.goContexts' },
        { keys: 'Alt-r', labelKey: 'keybindings.goReview' },
        { keys: 'Alt-w', labelKey: 'keybindings.goWaiting' },
        { keys: 'Alt-s', labelKey: 'keybindings.goSomeday' },
        { keys: 'Alt-l', labelKey: 'keybindings.goCalendar' },
        { keys: 'Alt-b', labelKey: 'keybindings.goBoard' },
        { keys: 'Alt-d', labelKey: 'keybindings.goDone' },
        { keys: 'Alt-A', labelKey: 'keybindings.goArchived' },
    ];

    const emacsList: HelpItem[] = [
        { keys: 'Ctrl-n / Ctrl-p', labelKey: 'keybindings.list.nextPrev' },
        { keys: 'Ctrl-e', labelKey: 'keybindings.list.edit' },
        { keys: 'Ctrl-t', labelKey: 'keybindings.list.toggleDone' },
        { keys: 'Ctrl-d', labelKey: 'keybindings.list.delete' },
        { keys: 'Ctrl-o', labelKey: 'keybindings.list.newTask' },
    ];

    const globalItems = style === 'emacs' ? emacsGlobal : vimGlobal;
    const listItems = style === 'emacs' ? emacsList : vimList;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-card border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-semibold">{t('keybindings.helpTitle')}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            {t('keybindings.helpSubtitle')}
                        </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        {t('keybindings.styleLabel')}: <span className="font-medium text-foreground">{t(`keybindings.style.${style}`)}</span>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div>
                        <h4 className="font-medium mb-3">{t('keybindings.section.global')}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {globalItems.map((item) => (
                                <div key={item.keys} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
                                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{item.keys}</code>
                                    <span className="text-sm">{t(item.labelKey)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="font-medium mb-3">{t('keybindings.section.taskList')}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {listItems.map((item) => (
                                <div key={item.keys} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2">
                                    <code className="text-xs bg-muted px-2 py-0.5 rounded">{item.keys}</code>
                                    <span className="text-sm">{t(item.labelKey)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        {t('nav.settings')}: {t('keybindings.styleLabel')} • {t('keybindings.style.vim')} / {t('keybindings.style.emacs')} ({currentView})
                    </p>
                </div>

                <div className="p-4 border-t border-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md text-sm font-medium bg-muted hover:bg-muted/80 transition-colors"
                    >
                        Esc
                    </button>
                </div>
            </div>
        </div>
    );
}
