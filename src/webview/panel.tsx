import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { Navigation } from './components/Navigation';
import { DashboardPage } from './pages/DashboardPage';
import { EmptyStatePage } from './pages/EmptyStatePage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';

const AppContent: React.FC = () => {
	const { activeView, error } = useAppState();

	return (
		<div className="panel-container">
			<Navigation />

			{error && <div className="error-banner visible">Error: {error}</div>}

			<main className="panel-main">
				{activeView === 'idle' && <EmptyStatePage />}
				{activeView === 'dashboard' && <DashboardPage />}
				{activeView === 'history' && <HistoryPage />}
				{activeView === 'settings' && <SettingsPage />}
			</main>
		</div>
	);
};

const App: React.FC = () => {
	return (
		<AppStateProvider>
			<AppContent />
		</AppStateProvider>
	);
};

function init() {
	const container = document.getElementById('root');
	if (container) {
		const root = createRoot(container);
		root.render(<App />);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
