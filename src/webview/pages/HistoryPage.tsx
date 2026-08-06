import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import type { ChangeLogEntry } from '../../commands/applyChanges';

export const HistoryPage: React.FC = () => {
	const { settings, hasChangeLog, isUndoing, undoProgress, undoError, undoSuccess, undoChanges } = useAppState();

	let logDetails: ChangeLogEntry | null = null;
	if (hasChangeLog && settings.changeLog) {
		try {
			logDetails = JSON.parse(settings.changeLog);
		} catch (e) {
			console.error('Failed to parse changelog JSON', e);
		}
	}

	return (
		<div className="page-history">
			{hasChangeLog && logDetails ? (
				<div className="undo-history-card">
					<div className="undo-history-title">Active Categorization State</div>
					<div className="undo-history-detail">
						<div>
							<strong>Applied At:</strong> {new Date(logDetails.timestamp).toLocaleString()}
						</div>
						<div>
							<strong>Method Used:</strong>{' '}
							{logDetails.method === 'both'
								? 'Notebooks & Tags'
								: logDetails.method === 'notebooks'
									? 'Notebooks Only'
									: 'Tags Only'}
						</div>
						<div>
							<strong>Modified Items:</strong> {logDetails.notes?.length || 0} notes
						</div>
					</div>

					<button className="btn-undo" onClick={undoChanges} disabled={isUndoing}>
						{isUndoing ? 'Undoing changes...' : 'Undo Last Categorization'}
					</button>

					{isUndoing && (
						<div className="status-banner-apply info">
							Reverting changes: {undoProgress.current} / {undoProgress.total} notes processed...
						</div>
					)}

					{undoSuccess && <div className="status-banner-apply success">Reverted changes successfully!</div>}

					{undoError && <div className="status-banner-apply error">Error: {undoError}</div>}
				</div>
			) : (
				<div className="empty-state">
					<svg
						className="empty-illustration"
						width="64"
						height="64"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<polyline points="12 6 12 12 16 14" />
					</svg>
					<div className="empty-title">No history found</div>
					<div className="empty-subtitle">
						No active categorization state in the change log. Run the categorization pipeline and apply
						changes to see history here.
					</div>
					{undoSuccess && (
						<div
							className="status-banner-apply success"
							style={{ marginTop: '16px', width: '100%', maxWidth: '320px' }}
						>
							Reverted changes successfully!
						</div>
					)}
				</div>
			)}
		</div>
	);
};
