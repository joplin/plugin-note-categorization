import * as React from 'react';
import { PanelNote, BenchmarkResult, ProgressState, ApplyOptions, PanelMessage } from '../../types/panel';
import { useSettingsState } from './useSettingsState';
import { useApplyState } from './useApplyState';
import { usePipelineState } from './usePipelineState';

const POLL_INTERVAL_MS = 500;

export type ViewType = 'idle' | 'dashboard';

interface AppStateContextType {
	isRunning: boolean;
	statusText: string;
	progress: ProgressState;
	error: string | null;
	strategies: BenchmarkResult[];
	notes: PanelNote[];
	selectedStrategyIndex: number;
	activeView: ViewType;
	runPipeline: () => void;
	changeStrategy: (index: number) => void;
	setView: (view: ViewType) => void;
	updateClusterName: (clusterId: number, newName: string) => void;
	moveNoteToCluster: (noteIndex: number, targetClusterId: number) => void;
	addCluster: (name: string) => boolean;

	// settings states
	settings: {
		metric: string;
		parentNotebook: string;
		changeLog: string;
	};
	updateSetting: (key: string, value: string) => Promise<void>;
	fetchSettings: () => Promise<void>;

	// apply states
	isApplying: boolean;
	applyProgress: { current: number; total: number };
	applyError: string | null;
	applySuccess: boolean;
	applyChanges: (options: ApplyOptions) => Promise<void>;

	// undo states
	isUndoing: boolean;
	undoProgress: { current: number; total: number };
	undoError: string | null;
	undoSuccess: boolean;
	undoChanges: () => Promise<void>;
	hasChangeLog: boolean;

	// cleanup states
	isCleaningUp: boolean;
	cleanupError: string | null;
	cleanupSuccess: string | null;
	cleanUpNotebooks: () => Promise<void>;
}

const AppStateContext = React.createContext<AppStateContextType | undefined>(undefined);

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = React.useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}
	}, []);

	// Initialize settings hook
	const { settings, hasChangeLog, fetchSettings, updateSetting } = useSettingsState();

	// Initialize apply state hook
	const {
		isApplying,
		applyProgress,
		applyError,
		applySuccess,
		isUndoing,
		undoProgress,
		undoError,
		undoSuccess,
		isCleaningUp,
		cleanupError,
		cleanupSuccess,
		resetApplyState,
		applyChanges,
		undoChanges,
		cleanUpNotebooks,
		setIsApplying,
		setApplyProgress,
		setApplyError,
		setApplySuccess,
		setIsUndoing,
		setUndoProgress,
		setUndoError,
		setUndoSuccess,
		setIsCleaningUp,
		setCleanupError,
		setCleanupSuccess,
	} = useApplyState(() => startPolling());

	// Initialize pipeline state hook
	const {
		isRunning,
		statusText,
		progress,
		error,
		strategies,
		notes,
		selectedStrategyIndex,
		activeView,
		runPipeline,
		changeStrategy,
		setView,
		updateClusterName,
		moveNoteToCluster,
		addCluster,
		setIsRunning,
		setStatusText,
		setProgress,
		setStrategies,
		setNotes,
		setSelectedStrategyIndex,
		setError,
		setActiveView,
	} = usePipelineState(() => startPolling(), resetApplyState);

	const handlePollResponse = React.useCallback(
		(msg: PanelMessage | { type: 'idle' }) => {
			if (!msg || !msg.type) return;

			switch (msg.type) {
				case 'status':
					setStatusText(msg.text || '');
					break;

				case 'progress':
					setProgress({
						current: msg.current || 0,
						total: msg.total || 0,
						cached: msg.cached || 0,
						skipped: msg.skipped || 0,
					});
					break;

				case 'results': {
					stopPolling();
					setIsRunning(false);
					setStrategies(msg.strategies || []);
					setNotes(msg.notes || []);
					const nonTestingIdx = (msg.strategies || []).findIndex(
						(s: BenchmarkResult) =>
							!s.strategyName.startsWith('kmeans') && !s.strategyName.startsWith('kmedoids'),
					);
					const fallbackIdx = nonTestingIdx !== -1 ? nonTestingIdx : 0;
					setSelectedStrategyIndex(msg.selectedStrategyIndex ?? fallbackIdx);
					setError(null);
					setActiveView('dashboard');
					break;
				}

				case 'error':
					stopPolling();
					setIsRunning(false);
					setError(msg.message || 'An unknown error occurred.');
					break;

				case 'apply_status':
					setIsApplying(true);
					setApplyError(null);
					setApplySuccess(false);
					break;

				case 'apply_progress':
					setIsApplying(true);
					setApplyProgress({
						current: msg.current || 0,
						total: msg.total || 0,
					});
					break;

				case 'apply_complete':
					stopPolling();
					setIsApplying(false);
					setApplySuccess(true);
					fetchSettings();
					break;

				case 'apply_error':
					stopPolling();
					setIsApplying(false);
					setApplyError(msg.message || 'An unknown error occurred.');
					break;

				case 'undo_status':
					setIsUndoing(true);
					setUndoError(null);
					setUndoSuccess(false);
					break;

				case 'undo_progress':
					setIsUndoing(true);
					setUndoProgress({
						current: msg.current || 0,
						total: msg.total || 0,
					});
					break;

				case 'undo_complete':
					stopPolling();
					setIsUndoing(false);
					setUndoSuccess(true);
					fetchSettings();
					break;

				case 'undo_error':
					stopPolling();
					setIsUndoing(false);
					setUndoError(msg.message || 'An unknown error occurred.');
					break;

				case 'cleanup_status':
					setIsCleaningUp(true);
					setCleanupError(null);
					setCleanupSuccess(null);
					break;

				case 'cleanup_complete':
					stopPolling();
					setIsCleaningUp(false);
					setCleanupSuccess(msg.message || 'Cleaned up empty notebooks.');
					fetchSettings();
					break;

				case 'cleanup_error':
					stopPolling();
					setIsCleaningUp(false);
					setCleanupError(msg.message || 'Failed to clean up folders.');
					break;
			}
		},
		[
			stopPolling,
			fetchSettings,
			setStatusText,
			setProgress,
			setStrategies,
			setNotes,
			setSelectedStrategyIndex,
			setError,
			setActiveView,
			setIsRunning,
			setIsApplying,
			setApplyProgress,
			setApplyError,
			setApplySuccess,
			setIsUndoing,
			setUndoProgress,
			setUndoError,
			setUndoSuccess,
			setIsCleaningUp,
			setCleanupError,
			setCleanupSuccess,
		],
	);

	const startPolling = React.useCallback(() => {
		stopPolling();
		pollIntervalRef.current = setInterval(async () => {
			if (typeof webviewApi === 'undefined') return;
			try {
				const state = await webviewApi.postMessage({ type: 'poll' });
				if (state) {
					handlePollResponse(state);
				}
			} catch (err) {
				console.error('Polling error:', err);
			}
		}, POLL_INTERVAL_MS);
	}, [stopPolling, handlePollResponse]);

	React.useEffect(() => {
		fetchSettings();
		if (typeof webviewApi !== 'undefined') {
			webviewApi
				.postMessage({ type: 'getInitialState' })
				.then((initialState) => {
					if (initialState) {
						handlePollResponse(initialState);
						if (initialState.type === 'status' || initialState.type === 'progress') {
							startPolling();
						}
					}
				})
				.catch((err) => {
					console.error('getInitialState error:', err);
				});
		}
	}, [fetchSettings, handlePollResponse, startPolling]);

	React.useEffect(() => {
		if (typeof webviewApi !== 'undefined' && strategies && strategies.length > 0) {
			webviewApi
				.postMessage({
					type: 'syncState',
					strategies,
					notes,
					selectedStrategyIndex,
				})
				.catch((err) => {
					console.error('syncState error:', err);
				});
		}
	}, [strategies, notes, selectedStrategyIndex]);

	React.useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const handleApplyChanges = React.useCallback(
		async (options: ApplyOptions) => {
			const currentStrategy = strategies[selectedStrategyIndex];
			await applyChanges(options, notes, currentStrategy);
		},
		[strategies, selectedStrategyIndex, notes, applyChanges],
	);

	return (
		<AppStateContext.Provider
			value={{
				isRunning,
				statusText,
				progress,
				error,
				strategies,
				notes,
				selectedStrategyIndex,
				activeView,
				runPipeline,
				changeStrategy,
				setView,
				updateClusterName,
				moveNoteToCluster,
				addCluster,
				settings,
				updateSetting,
				fetchSettings,
				isApplying,
				applyProgress,
				applyError,
				applySuccess,
				applyChanges: handleApplyChanges,
				isUndoing,
				undoProgress,
				undoError,
				undoSuccess,
				undoChanges,
				hasChangeLog,
				isCleaningUp,
				cleanupError,
				cleanupSuccess,
				cleanUpNotebooks,
			}}
		>
			{children}
		</AppStateContext.Provider>
	);
};

export const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (context === undefined) {
		throw new Error('useAppState must be used within an AppStateProvider');
	}
	return context;
};
