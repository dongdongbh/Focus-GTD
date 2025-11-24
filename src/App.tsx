import React, { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { ListView } from './components/views/ListView';
import { CalendarView } from './components/views/CalendarView';
import { BoardView } from './components/views/BoardView';
import { ProjectsView } from './components/views/ProjectsView';
import { ContextsView } from './components/views/ContextsView';
import { ReviewView } from './components/views/ReviewView';
import { useTaskStore } from './store/store';

function App() {
    const [currentView, setCurrentView] = useState('inbox');
    const { fetchData } = useTaskStore();

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const renderView = () => {
        switch (currentView) {
            case 'inbox':
                return <ListView title="Inbox" statusFilter="inbox" />;
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
            default:
                return <ListView title="Inbox" statusFilter="inbox" />;
        }
    };

    return (
        <Layout currentView={currentView} onViewChange={setCurrentView}>
            {renderView()}
        </Layout>
    );
}

export default App;
