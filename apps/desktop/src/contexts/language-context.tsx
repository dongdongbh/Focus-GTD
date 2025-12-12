import React, { createContext, useContext, useState, useEffect } from 'react';

import { translations, Language } from '@mindwtr/core';
export type { Language };

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}



const LANGUAGE_STORAGE_KEY = 'focus-gtd-language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved === 'en' || saved === 'zh') {
            setLanguageState(saved);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        setLanguageState(lang);
    };

    const t = (key: string): string => {
        return translations[language][key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
