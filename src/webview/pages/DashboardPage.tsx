import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { StrategySection } from '../components/StrategySection';
import { ClusterCard } from '../components/ClusterCard';

export const DashboardPage: React.FC = () => {
	const {
		isRunning,
		runPipeline,
		strategies,
		selectedStrategyIndex,
		changeStrategy,
		notes,
		updateClusterName,
		isApplying,
		applyProgress,
		applyError,
		applySuccess,
		applyChanges,
		isUndoing,
		isCleaningUp,
	} = useAppState();

	const selectedStrategy = strategies[selectedStrategyIndex];

	const clusters: { [key: number]: number[] } = {};
	const noise: number[] = [];

	if (selectedStrategy) {
		selectedStrategy.assignments.forEach((clusterId, noteIndex) => {
			if (clusterId === -1) {
				noise.push(noteIndex);
			} else {
				if (!clusters[clusterId]) {
					clusters[clusterId] = [];
				}
				clusters[clusterId].push(noteIndex);
			}
		});
	}

	const sortedClusterIds = Object.keys(clusters)
		.map(Number)
		.sort((a, b) => clusters[b].length - clusters[a].length);

	const handleApply = () => {
		applyChanges({
			method: 'both',
			parentNotebookName: '',
		});
	};

	return (
		<div className="page-dashboard">
			<Header isRunning={isRunning} onRun={runPipeline} />

			<StrategySection
				strategies={strategies}
				selectedStrategyIndex={selectedStrategyIndex}
				onStrategyChange={changeStrategy}
			/>

			<div className="cluster-list visible">
				{sortedClusterIds.map((id) => (
					<ClusterCard
						key={id}
						title={selectedStrategy.clusterNames?.[id] || `Cluster ${id + 1}`}
						noteIndices={clusters[id]}
						notes={notes}
						tags={selectedStrategy.tags?.[id]}
						onRename={(newName) => updateClusterName(id, newName)}
					/>
				))}
				{noise.length > 0 && (
					<ClusterCard title="Uncategorized" noteIndices={noise} notes={notes} isNoise={true} />
				)}
			</div>

			{selectedStrategy && (
				<div className="apply-section">
					<div className="apply-header">
						<div className="apply-title">Apply the new categorization</div>
						<div className="apply-subtitle">
							This will automatically move notes into their corresponding notebooks and apply the semantic
							tags.
						</div>
					</div>
					<div className="apply-action-row">
						<button className="btn-apply-primary" onClick={handleApply} disabled={isApplying || isUndoing || isCleaningUp}>
							{isApplying ? 'Applying changes...' : 'Apply New Categorization'}
						</button>
					</div>

					{isApplying && (
						<div className="status-banner-apply info">
							Applying changes: {applyProgress.current} / {applyProgress.total} notes processed...
						</div>
					)}

					{applySuccess && (
						<div className="status-banner-apply success">Categorization applied successfully!</div>
					)}

					{applyError && <div className="status-banner-apply error">Error: {applyError}</div>}
				</div>
			)}
		</div>
	);
};
