import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { StrategySection } from '../components/StrategySection';
import { ClusterCard } from '../components/ClusterCard';

export const DashboardPage: React.FC = () => {
	const { isRunning, runPipeline, strategies, selectedStrategyIndex, changeStrategy, notes } = useAppState();

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

	return (
		<div className="page-dashboard">
			<Header isRunning={isRunning} onRun={runPipeline} />

			<StrategySection
				strategies={strategies}
				selectedStrategyIndex={selectedStrategyIndex}
				onStrategyChange={changeStrategy}
			/>

			<div className="cluster-list visible">
				{sortedClusterIds.map((id, idx) => (
					<ClusterCard
						key={id}
						title={`Cluster ${idx + 1}`}
						noteIndices={clusters[id]}
						notes={notes}
						tags={selectedStrategy.tags?.[id]}
					/>
				))}
				{noise.length > 0 && (
					<ClusterCard title="Uncategorized" noteIndices={noise} notes={notes} isNoise={true} />
				)}
			</div>
		</div>
	);
};
