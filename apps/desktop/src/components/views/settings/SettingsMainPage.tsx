import { Check, Monitor } from 'lucide-react';
import type { Language } from '../../../contexts/language-context';

type ThemeMode = 'system' | 'light' | 'dark' | 'eink' | 'nord' | 'sepia';

type Labels = {
    appearance: string;
    system: string;
    light: string;
    dark: string;
    eink: string;
    nord: string;
    sepia: string;
    language: string;
    keybindings: string;
    keybindingsDesc: string;
    keybindingVim: string;
    keybindingEmacs: string;
    viewShortcuts: string;
};

type LanguageOption = { id: Language; native: string };

type SettingsMainPageProps = {
    t: Labels;
    themeMode: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    language: Language;
    onLanguageChange: (lang: Language) => void;
    keybindingStyle: 'vim' | 'emacs';
    onKeybindingStyleChange: (style: 'vim' | 'emacs') => void;
    onOpenHelp: () => void;
    languages: LanguageOption[];
};

export function SettingsMainPage({
    t,
    themeMode,
    onThemeChange,
    language,
    onLanguageChange,
    keybindingStyle,
    onKeybindingStyleChange,
    onOpenHelp,
    languages,
}: SettingsMainPageProps) {
    return (
        <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
                <div className="p-4 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t.appearance}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {t.system} / {t.light} / {t.dark} / {t.eink} / {t.nord} / {t.sepia}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Monitor className="w-4 h-4 text-muted-foreground" />
                        <select
                            value={themeMode}
                            onChange={(e) => onThemeChange(e.target.value as ThemeMode)}
                            className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="system">{t.system}</option>
                            <option value="light">{t.light}</option>
                            <option value="dark">{t.dark}</option>
                            <option value="eink">{t.eink}</option>
                            <option value="nord">{t.nord}</option>
                            <option value="sepia">{t.sepia}</option>
                        </select>
                    </div>
                </div>

                <div className="p-4 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t.language}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {languages.find(l => l.id === language)?.native ?? language}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Check className="w-4 h-4 text-muted-foreground" />
                        <select
                            value={language}
                            onChange={(e) => onLanguageChange(e.target.value as Language)}
                            className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            {languages.map((lang) => (
                                <option key={lang.id} value={lang.id}>
                                    {lang.native}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="p-4 flex items-center justify-between gap-6">
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{t.keybindings}</div>
                        <div className="text-xs text-muted-foreground mt-1">{t.keybindingsDesc}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={keybindingStyle}
                            onChange={(e) => onKeybindingStyleChange(e.target.value as 'vim' | 'emacs')}
                            className="text-sm bg-muted/50 text-foreground border border-border rounded px-2 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                            <option value="vim">{t.keybindingVim}</option>
                            <option value="emacs">{t.keybindingEmacs}</option>
                        </select>
                        <button
                            onClick={onOpenHelp}
                            className="text-sm px-3 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                        >
                            {t.viewShortcuts}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
