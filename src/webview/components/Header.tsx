import * as React from 'react';

interface HeaderProps {
	isRunning: boolean;
	onRun: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isRunning, onRun }) => {
	return (
		<div className="panel-header">
			<div className="panel-header-title">Note Categorizer</div>
			<button id="btn-run" className="btn-run" onClick={onRun} disabled={isRunning}>
				Run
			</button>
		</div>
	);
};
