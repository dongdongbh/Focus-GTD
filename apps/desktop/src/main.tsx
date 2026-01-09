import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { setStorageAdapter } from '@mindwtr/core';
import { LanguageProvider } from './contexts/language-context';
import { isTauriRuntime } from './lib/runtime';
import { webStorage } from './lib/storage-adapter-web';
import { setupGlobalErrorLogging } from './lib/app-log';

// Initialize theme immediately before React renders to prevent flash
const THEME_STORAGE_KEY = 'mindwtr-theme';
type ThemeMode = 'system' | 'light' | 'dark' | 'eink' | 'nord' | 'sepia';

const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
const root = document.documentElement;

const applyTheme = (mode: ThemeMode | null) => {
    root.classList.remove('theme-eink', 'theme-nord', 'theme-sepia');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (mode === 'system' || mode === null) {
        root.classList.toggle('dark', prefersDark);
    } else if (mode === 'dark' || mode === 'nord') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }

    if (mode === 'eink') root.classList.add('theme-eink');
    if (mode === 'nord') root.classList.add('theme-nord');
    if (mode === 'sepia') root.classList.add('theme-sepia');
};

applyTheme(savedTheme);

const nativeTheme = savedTheme === 'dark' || savedTheme === 'nord'
    ? 'dark'
    : savedTheme === 'light' || savedTheme === 'eink' || savedTheme === 'sepia'
        ? 'light'
        : null;
if (isTauriRuntime()) {
    import('@tauri-apps/api/app')
        .then(({ setTheme }) => setTheme(nativeTheme))
        .catch(() => undefined);
}

async function initStorage() {
    if (isTauriRuntime()) {
        const { tauriStorage } = await import('./lib/storage-adapter');
        setStorageAdapter(tauriStorage);
        return;
    }

    setStorageAdapter(webStorage);
}

async function bootstrap() {
    await initStorage();
    setupGlobalErrorLogging();

    if (!isTauriRuntime() && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <LanguageProvider>
                <App />
            </LanguageProvider>
        </React.StrictMode>,
    );
}

bootstrap().catch(console.error);
