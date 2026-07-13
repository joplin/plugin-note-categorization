import * as React from 'react';
import { PanelNote, BenchmarkResult, ProgressState, ApplyOptions } from '../../types/panel';

const POLL_INTERVAL_MS = 500;

export type ViewType = 'idle' | 'dashboard' | 'history' | 'settings';

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
	updateSetting: (key: string, value: any) => Promise<void>;
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
	const [isRunning, setIsRunning] = React.useState(false);
	const [statusText, setStatusText] = React.useState('');
	const [progress, setProgress] = React.useState<ProgressState>({
		current: 0,
		total: 0,
		cached: 0,
		skipped: 0,
	});
	const [error, setError] = React.useState<string | null>(null);
	const [strategies, setStrategies] = React.useState<BenchmarkResult[]>([]);
	const [notes, setNotes] = React.useState<PanelNote[]>([]);
	const [selectedStrategyIndex, setSelectedStrategyIndex] = React.useState<number>(0);
	const [activeView, setActiveView] = React.useState<ViewType>('idle');

	const [isApplying, setIsApplying] = React.useState(false);
	const [applyProgress, setApplyProgress] = React.useState({ current: 0, total: 0 });
	const [applyError, setApplyError] = React.useState<string | null>(null);
	const [applySuccess, setApplySuccess] = React.useState(false);

	const [isUndoing, setIsUndoing] = React.useState(false);
	const [undoProgress, setUndoProgress] = React.useState({ current: 0, total: 0 });
	const [undoError, setUndoError] = React.useState<string | null>(null);
	const [undoSuccess, setUndoSuccess] = React.useState(false);

	const [isCleaningUp, setIsCleaningUp] = React.useState(false);
	const [cleanupError, setCleanupError] = React.useState<string | null>(null);
	const [cleanupSuccess, setCleanupSuccess] = React.useState<string | null>(null);

	const [settings, setSettings] = React.useState({
		metric: 'cosine',
		parentNotebook: 'AI Categorized Notes',
		changeLog: '',
	});

	const hasChangeLog = !!settings.changeLog;

	const pollIntervalRef = React.useRef<any>(null);

	const stopPolling = React.useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}
	}, []);

	const fetchSettings = React.useCallback(async () => {
		try {
			const res = await webviewApi.postMessage({ type: 'getSettings' });
			if (res) {
				setSettings({
					metric: (res as any)['categorization.metric'] || 'cosine',
					parentNotebook: (res as any)['categorization.parentNotebook'] || 'AI Categorized Notes',
					changeLog: (res as any)['categorization.changeLog'] || '',
				});
			}
		} catch (err) {
			console.error('Failed to fetch settings:', err);
		}
	}, []);

	const handlePollResponse = React.useCallback(
		(msg: any) => {
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
						(s: any) => !s.strategyName.startsWith('kmeans') && !s.strategyName.startsWith('kmedoids'),
					);
					setSelectedStrategyIndex(nonTestingIdx !== -1 ? nonTestingIdx : 0);
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
		[stopPolling, fetchSettings],
	);

	const startPolling = React.useCallback(() => {
		stopPolling();
		pollIntervalRef.current = setInterval(async () => {
			const state = await webviewApi.postMessage({ type: 'poll' });
			if (state) {
				handlePollResponse(state);
			}
		}, POLL_INTERVAL_MS);
	}, [stopPolling, handlePollResponse]);

	React.useEffect(() => {
		fetchSettings();
	}, [fetchSettings]);

	React.useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const runPipeline = async () => {
		setIsRunning(true);
		setStatusText('Starting pipeline...');
		setProgress({ current: 0, total: 0, cached: 0, skipped: 0 });
		setStrategies([]);
		setNotes([]);
		setError(null);
		setActiveView('idle');
		setApplySuccess(false);
		setApplyError(null);
		setUndoSuccess(false);
		setUndoError(null);
		setCleanupSuccess(null);
		setCleanupError(null);
		try {
			await webviewApi.postMessage({ type: 'run' });
		} catch (err) {
			setError('Failed to start pipeline: ' + String(err));
			setIsRunning(false);
			return;
		}
		startPolling();
	};

	const changeStrategy = (index: number) => {
		setSelectedStrategyIndex(index);
	};

	const setView = (view: ViewType) => {
		setActiveView(view);
	};

	const updateClusterName = (clusterId: number, newName: string) => {
		setStrategies((prev) => {
			const next = [...prev];
			if (next[selectedStrategyIndex]) {
				const strat = { ...next[selectedStrategyIndex] };
				const newClusterNames = { ...strat.clusterNames };
				newClusterNames[clusterId] = newName;
				strat.clusterNames = newClusterNames;
				next[selectedStrategyIndex] = strat;
			}
			return next;
		});
	};

	const moveNoteToCluster = (noteIndex: number, targetClusterId: number) => {
		setStrategies((prev) => {
			const next = [...prev];
			if (next[selectedStrategyIndex]) {
				const strat = { ...next[selectedStrategyIndex] };
				const newAssignments = [...strat.assignments];

				if (noteIndex < 0 || noteIndex >= newAssignments.length) return prev;
				if (newAssignments[noteIndex] === targetClusterId) return prev;

				newAssignments[noteIndex] = targetClusterId;
				strat.assignments = newAssignments;
				next[selectedStrategyIndex] = strat;
			}
			return next;
		});
	};

	const addCluster = (name: string): boolean => {
		const trimmedName = name.trim();
		if (!trimmedName) return false;

		const currentStrategy = strategies[selectedStrategyIndex];
		if (!currentStrategy) return false;

		const clusterNames = currentStrategy.clusterNames || {};
		const nameExists = Object.values(clusterNames).some((n) => n.toLowerCase() === trimmedName.toLowerCase());

		if (nameExists) {
			return false;
		}

		setStrategies((prev) => {
			const next = [...prev];
			const strat = next[selectedStrategyIndex];
			if (strat) {
				const newStrat = { ...strat };
				const newClusterNames = { ...strat.clusterNames };
				const newTags = { ...strat.tags };

				const clusterIds = Object.keys(newClusterNames).map(Number);
				const newClusterId = clusterIds.length > 0 ? Math.max(...clusterIds) + 1 : 0;

				newClusterNames[newClusterId] = trimmedName;
				newTags[newClusterId] = [];

				newStrat.clusterNames = newClusterNames;
				newStrat.tags = newTags;
				newStrat.clusterCount = (newStrat.clusterCount || 0) + 1;

				next[selectedStrategyIndex] = newStrat;
			}
			return next;
		});

		return true;
	};

	const updateSetting = async (key: string, value: any) => {
		try {
			await webviewApi.postMessage({
				type: 'updateSetting',
				key,
				value,
			});
			const localKey = key.replace('categorization.', '');
			setSettings((prev) => ({
				...prev,
				[localKey]: value,
			}));
		} catch (err) {
			console.error('Failed to update setting:', err);
		}
	};

	const applyChanges = async (options: ApplyOptions) => {
		const currentStrategy = strategies[selectedStrategyIndex];
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
		setCleanupSuccess(null);
		setCleanupError(null);

		try {
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
	};

	const undoChanges = async () => {
		setIsUndoing(true);
		setUndoProgress({ current: 0, total: 0 });
		setUndoError(null);
		setUndoSuccess(false);
		setApplySuccess(false);
		setApplyError(null);
		setCleanupSuccess(null);
		setCleanupError(null);

		try {
			await webviewApi.postMessage({ type: 'undo' });
			startPolling();
		} catch (err) {
			setUndoError('Failed to start undo operation: ' + String(err));
			setIsUndoing(false);
		}
	};

	const cleanUpNotebooks = async () => {
		setIsCleaningUp(true);
		setCleanupError(null);
		setCleanupSuccess(null);
		setApplySuccess(false);
		setApplyError(null);
		setUndoSuccess(false);
		setUndoError(null);

		try {
			await webviewApi.postMessage({ type: 'cleanUpEmptyNotebooks' });
			startPolling();
		} catch (err) {
			setCleanupError('Failed to start cleanup: ' + String(err));
			setIsCleaningUp(false);
		}
	};

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
				applyChanges,
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
