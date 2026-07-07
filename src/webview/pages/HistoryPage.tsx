import * as React from 'react';
import { useAppState } from '../context/AppStateContext';

export const HistoryPage: React.FC = () => {
	const {
		settings,
		hasChangeLog,
		isUndoing,
		undoProgress,
		undoError,
		undoSuccess,
		undoChanges,
		isCleaningUp,
		cleanupError,
		cleanupSuccess,
		cleanUpNotebooks,
	} = useAppState();

	let logDetails: any = null;
	if (hasChangeLog && settings.changeLog) {
		try {
			logDetails = JSON.parse(settings.changeLog);
		} catch (e) {
			console.error('Failed to parse changelog JSON', e);
		}
	}

	return (
		<div className="empty-state">
			<div className="empty-title">Change Log / History</div>

			{hasChangeLog && logDetails ? (
				<div className="undo-history-card">
					<div className="undo-history-title">Active Categorization State</div>
					<div className="undo-history-detail">
						<div>
							<strong>Applied At:</strong> {new Date(logDetails.timestamp).toLocaleString()}
						</div>
						<div>
							<strong>Method Used:</strong> {logDetails.method}
						</div>
						<div>
							<strong>Modified Items:</strong> {logDetails.notes?.length || 0} notes
						</div>
					</div>

					<button className="btn-undo" onClick={undoChanges} disabled={isUndoing || isCleaningUp}>
						{isUndoing ? 'Undoing changes...' : 'Undo Last Categorization'}
					</button>

					<button
						className="btn-cleanup"
						onClick={cleanUpNotebooks}
						disabled={isUndoing || isCleaningUp}
						style={{ marginTop: '8px' }}
					>
						{isCleaningUp ? 'Cleaning up...' : 'Clean Up Empty Original Notebooks'}
					</button>

					<div className="cleanup-note">
						<strong>Note:</strong> Cleaning up empty original notebooks will delete previous notebooks that
						became empty. Reverting changes after this will place restored notes in your default notebook
						folder.
					</div>

					{isUndoing && (
						<div className="status-banner-apply info">
							Reverting changes: {undoProgress.current} / {undoProgress.total} notes processed...
						</div>
					)}

					{isCleaningUp && (
						<div className="status-banner-apply info">Checking & cleaning up empty notebooks...</div>
					)}

					{undoSuccess && <div className="status-banner-apply success">Reverted changes successfully!</div>}

					{cleanupSuccess && <div className="status-banner-apply success">{cleanupSuccess}</div>}

					{undoError && <div className="status-banner-apply error">Error: {undoError}</div>}

					{cleanupError && <div className="status-banner-apply error">Error: {cleanupError}</div>}
				</div>
			) : (
				<>
					<div className="empty-subtitle">
						No active categorization state in the change log. Run the categorization pipeline and apply
						changes to see history here.
					</div>
					{undoSuccess && (
						<div className="status-banner-apply success" style={{ marginTop: '16px' }}>
							Reverted changes successfully!
						</div>
					)}
					{cleanupSuccess && (
						<div className="status-banner-apply success" style={{ marginTop: '16px' }}>
							{cleanupSuccess}
						</div>
					)}
				</>
			)}
		</div>
	);
};
