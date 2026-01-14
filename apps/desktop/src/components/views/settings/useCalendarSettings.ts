import { useCallback, useEffect, useState } from 'react';
import { generateUUID, type ExternalCalendarSubscription } from '@mindwtr/core';
import { ExternalCalendarService } from '../../../lib/external-calendar-service';

type UseCalendarSettingsOptions = {
    showSaved: () => void;
};

export function useCalendarSettings({ showSaved }: UseCalendarSettingsOptions) {
    const [externalCalendars, setExternalCalendars] = useState<ExternalCalendarSubscription[]>([]);
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarUrl, setNewCalendarUrl] = useState('');
    const [calendarError, setCalendarError] = useState<string | null>(null);

    useEffect(() => {
        ExternalCalendarService.getCalendars().then(setExternalCalendars).catch(console.error);
    }, []);

    const persistCalendars = useCallback(async (next: ExternalCalendarSubscription[]) => {
        setCalendarError(null);
        setExternalCalendars(next);
        try {
            await ExternalCalendarService.setCalendars(next);
            showSaved();
        } catch (error) {
            console.error(error);
            setCalendarError(String(error));
        }
    }, [showSaved]);

    const handleAddCalendar = useCallback(() => {
        const url = newCalendarUrl.trim();
        if (!url) return;
        const name = (newCalendarName.trim() || 'Calendar').trim();
        const next = [
            ...externalCalendars,
            { id: generateUUID(), name, url, enabled: true },
        ];
        setNewCalendarName('');
        setNewCalendarUrl('');
        persistCalendars(next);
    }, [externalCalendars, newCalendarName, newCalendarUrl, persistCalendars]);

    const handleToggleCalendar = useCallback((id: string, enabled: boolean) => {
        const next = externalCalendars.map((calendar) => (calendar.id === id ? { ...calendar, enabled } : calendar));
        persistCalendars(next);
    }, [externalCalendars, persistCalendars]);

    const handleRemoveCalendar = useCallback((id: string) => {
        const next = externalCalendars.filter((calendar) => calendar.id !== id);
        persistCalendars(next);
    }, [externalCalendars, persistCalendars]);

    return {
        externalCalendars,
        newCalendarName,
        newCalendarUrl,
        calendarError,
        setNewCalendarName,
        setNewCalendarUrl,
        handleAddCalendar,
        handleToggleCalendar,
        handleRemoveCalendar,
    };
}
