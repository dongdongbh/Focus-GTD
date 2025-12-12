import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { setStorageAdapter } from '@mindwtr/core';
import { tauriStorage } from './lib/storage-adapter';
import { LanguageProvider } from './contexts/language-context';

// Initialize storage adapter for desktop
setStorageAdapter(tauriStorage);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <LanguageProvider>
            <App />
        </LanguageProvider>
    </React.StrictMode>,
)

