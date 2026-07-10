import * as React from 'react';

interface HeaderProps {
	isRunning: boolean;
	onRun: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isRunning, onRun }) => {
	return (
		<div className="panel-header">
			<div className="panel-header-title">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
					<line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
				</svg>
				Note Categorizer
			</div>
			<button id="btn-run" className="btn-run" onClick={onRun} disabled={isRunning}>
				<svg
					width="11"
					height="11"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<polygon points="5 3 19 12 5 21 5 3" />
				</svg>
				{isRunning ? 'Running...' : 'Run'}
			</button>
		</div>
	);
};
