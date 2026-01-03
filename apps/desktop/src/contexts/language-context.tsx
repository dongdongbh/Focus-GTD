import React, { createContext, useContext, useState, useEffect } from 'react';

import { translations, Language } from '@mindwtr/core';
export type { Language };

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}



const LANGUAGE_STORAGE_KEY = 'mindwtr-language';
const SUPPORTED_LANGUAGES: Language[] = ['en', 'zh', 'es', 'hi', 'ar'];

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguageState] = useState<Language>('en');

    useEffect(() => {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved && SUPPORTED_LANGUAGES.includes(saved as Language)) {
            setLanguageState(saved as Language);
        }
    }, []);

    const setLanguage = (lang: Language) => {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
        setLanguageState(lang);
    };

    const t = (key: string): string => {
        return translations[language][key] || translations.en[key] || key;
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
