import * as React from 'react';
import { PanelNote, BenchmarkResult, ProgressState } from '../../types/panel';
import { ViewType } from './AppStateContext';

export function usePipelineState(startPolling: () => void, resetApplyState: () => void) {
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

	const runPipeline = async () => {
		setIsRunning(true);
		setStatusText('Starting pipeline...');
		setProgress({ current: 0, total: 0, cached: 0, skipped: 0 });
		setStrategies([]);
		setNotes([]);
		setError(null);
		setActiveView('idle');

		// Reset apply/undo/cleanup states
		resetApplyState();

		try {
			await webviewApi.postMessage({ type: 'run' });
		} catch (err) {
			setError('Failed to start pipeline: ' + String(err));
			setIsRunning(false);
			return;
		}
		startPolling();
	};

	const changeStrategy = React.useCallback((index: number) => {
		setSelectedStrategyIndex(index);
	}, []);

	const setView = React.useCallback((view: ViewType) => {
		setActiveView(view);
	}, []);

	const updateClusterName = React.useCallback(
		(clusterId: number, newName: string) => {
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
		},
		[selectedStrategyIndex],
	);

	const moveNoteToCluster = React.useCallback(
		(noteIndex: number, targetClusterId: number) => {
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
		},
		[selectedStrategyIndex],
	);

	const addCluster = React.useCallback(
		(name: string): boolean => {
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
		},
		[strategies, selectedStrategyIndex],
	);

	return {
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
	};
}
