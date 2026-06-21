import * as React from 'react';
import { useAppState, ViewType } from '../context/AppStateContext';

export const Navigation: React.FC = () => {
	const { activeView, setView, strategies } = useAppState();

	const hasResults = strategies && strategies.length > 0;

	const handleTabClick = (view: ViewType) => {
		setView(view);
	};

	return (
		<div className="panel-navigation">
			<button
				className={`nav-tab${activeView === 'idle' || activeView === 'dashboard' ? ' active' : ''}`}
				onClick={() => handleTabClick(hasResults ? 'dashboard' : 'idle')}
			>
				Dashboard
			</button>
			{hasResults && (
				<button
					className={`nav-tab${activeView === 'history' ? ' active' : ''}`}
					onClick={() => handleTabClick('history')}
				>
					Change Log
				</button>
			)}
			<button
				className={`nav-tab${activeView === 'settings' ? ' active' : ''}`}
				onClick={() => handleTabClick('settings')}
			>
				Settings
			</button>
		</div>
	);
};
