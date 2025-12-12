import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { ListView } from './components/views/ListView';
import { CalendarView } from './components/views/CalendarView';
import { BoardView } from './components/views/BoardView';
import { ProjectsView } from './components/views/ProjectsView';
import { ContextsView } from './components/views/ContextsView';
import { ReviewView } from './components/views/ReviewView';
import { TutorialView } from './components/views/TutorialView';
import { SettingsView } from './components/views/SettingsView';
import { ArchiveView } from './components/views/ArchiveView';
import { AgendaView } from './components/views/AgendaView';
import { useTaskStore, flushPendingSave } from '@mindwtr/core';
import { GlobalSearch } from './components/GlobalSearch';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
    const [currentView, setCurrentView] = useState('inbox');
    const { fetchData } = useTaskStore();

    useEffect(() => {
        fetchData();

        const handleUnload = () => {
            flushPendingSave().catch(console.error);
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [fetchData]);

    const renderView = () => {
        switch (currentView) {
            case 'inbox':
                return <ListView title="Inbox" statusFilter="inbox" />;
            case 'agenda':
                return <AgendaView />;
            case 'next':
                return <ListView title="Next Actions" statusFilter="next" />;
            case 'someday':
                return <ListView title="Someday/Maybe" statusFilter="someday" />;
            case 'waiting':
                return <ListView title="Waiting For" statusFilter="waiting" />;
            case 'done':
                return <ListView title="Completed" statusFilter="done" />;
            case 'calendar':
                return <CalendarView />;
            case 'board':
                return <BoardView />;
            case 'projects':
                return <ProjectsView />;
            case 'contexts':
                return <ContextsView />;
            case 'review':
                return <ReviewView />;
            case 'tutorial':
                return <TutorialView />;
            case 'settings':
                return <SettingsView />;
            case 'archived':
                return <ArchiveView />;
            default:
                return <ListView title="Inbox" statusFilter="inbox" />;
        }
    };

    return (
        <ErrorBoundary>
            <Layout currentView={currentView} onViewChange={setCurrentView}>
                {renderView()}
                <GlobalSearch onNavigate={(view, _id) => setCurrentView(view)} />
            </Layout>
        </ErrorBoundary>
    );
}

export default App;
