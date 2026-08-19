import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { DashboardPage } from './pages/DashboardPage';
import { EmptyStatePage } from './pages/EmptyStatePage';
import { NotebookFilterModal } from './components/NotebookFilterModal';

const AppContent: React.FC = () => {
	const {
		activeView,
		error,
		isFilterModalOpen,
		setIsFilterModalOpen,
		filterConfig,
		saveFilter,
		folderTree,
		folders,
		counts,
		isLoadingNotebooks,
		fetchNotebooksAndFilter,
	} = useAppState();

	return (
		<div className="panel-container">
			{error && <div className="error-banner visible">Error: {error}</div>}

			<main className="panel-main">{activeView === 'idle' ? <EmptyStatePage /> : <DashboardPage />}</main>

			<NotebookFilterModal
				isOpen={isFilterModalOpen}
				onClose={() => setIsFilterModalOpen(false)}
				filterConfig={filterConfig}
				onSave={saveFilter}
				folderTree={folderTree}
				folders={folders}
				counts={counts}
				isLoading={isLoadingNotebooks}
				onRefresh={fetchNotebooksAndFilter}
			/>
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
