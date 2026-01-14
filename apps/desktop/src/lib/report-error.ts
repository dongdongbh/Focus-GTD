import { useTaskStore } from '@mindwtr/core';

export const reportError = (label: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    useTaskStore.getState().setError(`${label}: ${message}`);
    console.error(error);
};

