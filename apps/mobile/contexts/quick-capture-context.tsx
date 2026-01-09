import { createContext, useContext, type ReactNode } from 'react';
import type { Task } from '@mindwtr/core';

export type QuickCaptureOptions = {
  initialProps?: Partial<Task>;
  initialValue?: string;
};

type QuickCaptureContextValue = {
  openQuickCapture: (options?: QuickCaptureOptions) => void;
};

const QuickCaptureContext = createContext<QuickCaptureContextValue | null>(null);

export function QuickCaptureProvider({ value, children }: { value: QuickCaptureContextValue; children: ReactNode }) {
  return (
    <QuickCaptureContext.Provider value={value}>
      {children}
    </QuickCaptureContext.Provider>
  );
}

export function useQuickCapture(): QuickCaptureContextValue {
  const ctx = useContext(QuickCaptureContext);
  if (!ctx) {
    throw new Error('useQuickCapture must be used within QuickCaptureProvider');
  }
  return ctx;
}
