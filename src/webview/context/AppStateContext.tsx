import * as React from 'react';
import { PanelNote, BenchmarkResult, ProgressState } from '../../types/panel';

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

	const pollIntervalRef = React.useRef<any>(null);

	const stopPolling = React.useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
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

				case 'results':
					stopPolling();
					setIsRunning(false);
					setStrategies(msg.strategies || []);
					setNotes(msg.notes || []);
					setSelectedStrategyIndex(0);
					setError(null);
					setActiveView('dashboard');
					break;

				case 'error':
					stopPolling();
					setIsRunning(false);
					setError(msg.message || 'An unknown error occurred.');
					break;
			}
		},
		[stopPolling],
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
