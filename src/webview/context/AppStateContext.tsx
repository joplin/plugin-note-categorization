import * as React from 'react';
import { PanelNote, BenchmarkResult, ProgressState, ApplyOptions, PanelMessage } from '../../types/panel';
import { NotebookFilterConfig, FolderItem } from '../../types/notebook';
import { useSettingsState } from './useSettingsState';
import { useApplyState } from './useApplyState';
import { usePipelineState } from './usePipelineState';
import { useNotebookFilter } from './useNotebookFilter';

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
	isNativeAiUsed: boolean;
	isAiNamingUsed: boolean;
	runPipeline: (filterConfig?: NotebookFilterConfig) => void;
	changeStrategy: (index: number) => void;
	setView: (view: ViewType) => void;
	updateClusterName: (clusterId: number, newName: string) => void;
	moveNoteToCluster: (noteIndex: number, targetClusterId: number) => void;
	addCluster: (name: string) => boolean;

	// settings states
	settings: {
		parentNotebook: string;
		changeLog: string;
		applyMethod: 'both' | 'tags' | 'notebooks';
	};
	updateSetting: (key: string, value: string) => Promise<void>;
	fetchSettings: () => Promise<void>;

	// notebook filter states
	filterConfig: NotebookFilterConfig;
	folders: FolderItem[];
	folderTree: FolderItem[];
	counts: { [folderId: string]: number };
	isFilterModalOpen: boolean;
	isLoadingNotebooks: boolean;
	setIsFilterModalOpen: (open: boolean) => void;
	fetchNotebooksAndFilter: () => Promise<void>;
	saveFilter: (newConfig: NotebookFilterConfig) => Promise<void>;

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

	// Initialize notebook filter hook
	const {
		filterConfig,
		folders,
		folderTree,
		counts,
		isFilterModalOpen,
		isLoadingNotebooks,
		setIsFilterModalOpen,
		fetchNotebooksAndFilter,
		saveFilter,
	} = useNotebookFilter();

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
		isNativeAiUsed,
		isAiNamingUsed,
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
		setIsNativeAiUsed,
		setIsAiNamingUsed,
	} = usePipelineState(() => startPolling(), resetApplyState);

	const handleRunPipeline = React.useCallback(
		(overrideFilter?: NotebookFilterConfig) => {
			runPipeline(overrideFilter || filterConfig);
		},
		[runPipeline, filterConfig],
	);

	const handlePollResponse = React.useCallback(
		(msg: PanelMessage | { type: 'idle' }) => {
			const processMessage = (m: PanelMessage | { type: 'idle' }) => {
				if (!m || !m.type) return;

				switch (m.type) {
					case 'status':
						setIsRunning(true);
						setStatusText(m.text || '');
						if (typeof m.isNativeAiUsed === 'boolean') {
							setIsNativeAiUsed(m.isNativeAiUsed);
						}
						break;

					case 'progress':
						setIsRunning(true);
						setProgress({
							current: m.current || 0,
							total: m.total || 0,
							cached: m.cached || 0,
							skipped: m.skipped || 0,
						});
						if (typeof m.isNativeAiUsed === 'boolean') {
							setIsNativeAiUsed(m.isNativeAiUsed);
						}
						break;

					case 'results': {
						stopPolling();
						setIsRunning(false);
						setStrategies(m.strategies || []);
						setNotes(m.notes || []);
						const kmeansIdx = (m.strategies || []).findIndex((s: BenchmarkResult) =>
							s.strategyName.startsWith('kmeans'),
						);
						const defaultIdx = kmeansIdx !== -1 ? kmeansIdx : 0;
						setSelectedStrategyIndex(m.selectedStrategyIndex ?? defaultIdx);
						if (typeof m.isNativeAiUsed === 'boolean') {
							setIsNativeAiUsed(m.isNativeAiUsed);
						}
						if (typeof m.isAiNamingUsed === 'boolean') {
							setIsAiNamingUsed(m.isAiNamingUsed);
						}
						setError(null);
						setActiveView('dashboard');
						if (m.panelState) {
							processMessage(m.panelState);
						}
						break;
					}

					case 'error':
						stopPolling();
						setIsRunning(false);
						setError(m.message || 'An unknown error occurred.');
						break;

					case 'apply_status':
						setIsApplying(true);
						setApplyError(null);
						setApplySuccess(false);
						setUndoSuccess(false);
						setUndoError(null);
						break;

					case 'apply_progress':
						setIsApplying(true);
						setApplyProgress({
							current: m.current || 0,
							total: m.total || 0,
						});
						break;

					case 'apply_complete':
						stopPolling();
						setIsApplying(false);
						setApplySuccess(true);
						setUndoSuccess(false);
						fetchSettings();
						break;

					case 'apply_error':
						stopPolling();
						setIsApplying(false);
						setApplyError(m.message || 'An unknown error occurred.');
						break;

					case 'undo_status':
						setIsUndoing(true);
						setUndoError(null);
						setUndoSuccess(false);
						setApplySuccess(false);
						setApplyError(null);
						break;

					case 'undo_progress':
						setIsUndoing(true);
						setUndoProgress({
							current: m.current || 0,
							total: m.total || 0,
						});
						break;

					case 'undo_complete':
						stopPolling();
						setIsUndoing(false);
						setUndoSuccess(true);
						setApplySuccess(false);
						fetchSettings();
						break;

					case 'undo_error':
						stopPolling();
						setIsUndoing(false);
						setUndoError(m.message || 'An unknown error occurred.');
						break;
				}
			};

			processMessage(msg);
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
			setIsNativeAiUsed,
			setIsAiNamingUsed,
		],
	);

	const handlePollResponseRef = React.useRef(handlePollResponse);
	React.useEffect(() => {
		handlePollResponseRef.current = handlePollResponse;
	}, [handlePollResponse]);

	const startPolling = React.useCallback(() => {
		stopPolling();
		pollIntervalRef.current = setInterval(async () => {
			if (typeof webviewApi === 'undefined') return;
			try {
				const state = await webviewApi.postMessage<PanelMessage | { type: 'idle' }>({ type: 'poll' });
				if (state) {
					handlePollResponseRef.current(state);
				}
			} catch (err) {
				console.error('Polling error:', err);
			}
		}, POLL_INTERVAL_MS);
	}, [stopPolling]);

	React.useEffect(() => {
		fetchSettings();
		if (typeof webviewApi !== 'undefined') {
			webviewApi
				.postMessage<PanelMessage | { type: 'idle' }>({ type: 'getInitialState' })
				.then((initialState) => {
					if (initialState) {
						handlePollResponse(initialState);
						const activeState =
							initialState.type === 'results' && initialState.panelState
								? initialState.panelState
								: initialState;
						if (
							activeState.type === 'status' ||
							activeState.type === 'progress' ||
							activeState.type === 'apply_status' ||
							activeState.type === 'apply_progress' ||
							activeState.type === 'undo_status' ||
							activeState.type === 'undo_progress'
						) {
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
				isNativeAiUsed,
				isAiNamingUsed,
				runPipeline: handleRunPipeline,
				changeStrategy,
				setView,
				updateClusterName,
				moveNoteToCluster,
				addCluster,
				settings,
				updateSetting,
				fetchSettings,
				filterConfig,
				folders,
				folderTree,
				counts,
				isFilterModalOpen,
				isLoadingNotebooks,
				setIsFilterModalOpen,
				fetchNotebooksAndFilter,
				saveFilter,
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
