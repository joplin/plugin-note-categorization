import * as React from 'react';
import { ApplyOptions, PanelNote, BenchmarkResult } from '../../types/panel';

export function useApplyState(startPolling: () => void) {
	const [isApplying, setIsApplying] = React.useState(false);
	const [applyProgress, setApplyProgress] = React.useState({ current: 0, total: 0 });
	const [applyError, setApplyError] = React.useState<string | null>(null);
	const [applySuccess, setApplySuccess] = React.useState(false);

	const [isUndoing, setIsUndoing] = React.useState(false);
	const [undoProgress, setUndoProgress] = React.useState({ current: 0, total: 0 });
	const [undoError, setUndoError] = React.useState<string | null>(null);
	const [undoSuccess, setUndoSuccess] = React.useState(false);

	const resetApplyState = React.useCallback(() => {
		setApplySuccess(false);
		setApplyError(null);
		setUndoSuccess(false);
		setUndoError(null);
	}, []);

	const applyChanges = React.useCallback(
		async (options: ApplyOptions, notes: PanelNote[], currentStrategy: BenchmarkResult | undefined) => {
			if (!currentStrategy) {
				setApplyError('No active strategy selected.');
				return;
			}

			setIsApplying(true);
			setApplyProgress({ current: 0, total: notes.length });
			setApplyError(null);
			setApplySuccess(false);
			setUndoSuccess(false);
			setUndoError(null);

			try {
				if (typeof webviewApi === 'undefined') {
					setApplyError('Joplin API not available');
					setIsApplying(false);
					return;
				}
				await webviewApi.postMessage({
					type: 'apply',
					options,
					notes,
					assignments: currentStrategy.assignments,
					clusterNames: currentStrategy.clusterNames || {},
					clusterTags: currentStrategy.tags || {},
				});
				startPolling();
			} catch (err) {
				setApplyError('Failed to apply changes: ' + String(err));
				setIsApplying(false);
			}
		},
		[startPolling],
	);

	const undoChanges = React.useCallback(async () => {
		setIsUndoing(true);
		setUndoProgress({ current: 0, total: 0 });
		setUndoError(null);
		setUndoSuccess(false);
		setApplySuccess(false);
		setApplyError(null);

		try {
			if (typeof webviewApi === 'undefined') {
				setUndoError('Joplin API not available');
				setIsUndoing(false);
				return;
			}
			await webviewApi.postMessage({ type: 'undo' });
			startPolling();
		} catch (err) {
			setUndoError('Failed to start undo operation: ' + String(err));
			setIsUndoing(false);
		}
	}, [startPolling]);

	return {
		isApplying,
		applyProgress,
		applyError,
		applySuccess,
		isUndoing,
		undoProgress,
		undoError,
		undoSuccess,
		resetApplyState,
		applyChanges,
		undoChanges,
		setIsApplying,
		setApplyProgress,
		setApplyError,
		setApplySuccess,
		setIsUndoing,
		setUndoProgress,
		setUndoError,
		setUndoSuccess,
	};
}
