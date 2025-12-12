import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        loadLanguage();
    }, []);

    const loadLanguage = async () => {
        try {
            const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (saved === 'en' || saved === 'zh') {
                setLanguageState(saved);
            }
        } catch (error) {
            console.error('Failed to load language', error);
        }
    };

    const setLanguage = async (lang: Language) => {
        try {
            await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
            setLanguageState(lang);
        } catch (error) {
            console.error('Failed to save language', error);
        }
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
