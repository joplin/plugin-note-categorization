import * as React from 'react';
import { BenchmarkResult } from '../../types/panel';

interface StrategySectionProps {
	strategies: BenchmarkResult[];
	selectedStrategyIndex: number;
	onStrategyChange: (index: number) => void;
}

/** Returns display names for dropdown and pills, marking testing and recommended strategies */
function getStrategyDisplayName(name: string, isHighest: boolean): string {
	let baseName = name;
	if (name === 'hdbscan') {
		baseName = 'HDBSCAN';
	} else if (name.startsWith('kmeans')) {
		baseName = 'K-Means (Testing)';
	}

	if (isHighest) {
		return `${baseName} (Recommended)`;
	}
	return baseName;
}

export const StrategySection: React.FC<StrategySectionProps> = ({
	strategies,
	selectedStrategyIndex,
	onStrategyChange,
}) => {
	const selectedStrategy = strategies[selectedStrategyIndex];
	if (!selectedStrategy) return null;

	const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		onStrategyChange(parseInt(e.target.value, 10));
	};

	return (
		<div className="strategy-section visible">
			<div className="strategy-selector-row">
				<span className="strategy-selector-label">Strategy:</span>
				<select
					id="strategy-select"
					className="strategy-select"
					value={selectedStrategyIndex}
					onChange={handleSelectChange}
				>
					{strategies.map((s, idx) => (
						<option key={idx} value={idx}>
							{getStrategyDisplayName(s.strategyName, idx === 0)} ({s.silhouetteScore.toFixed(2)})
						</option>
					))}
				</select>
			</div>

			<div className="strategy-score">
				Score: <strong>{selectedStrategy.silhouetteScore.toFixed(2)}</strong> · {selectedStrategy.clusterCount}{' '}
				clusters
				{selectedStrategy.outlierCount > 0 ? ` · ${selectedStrategy.outlierCount} noise` : ''}
			</div>

			<div className="strategy-pills">
				{strategies
					.map((s, idx) => ({ s, idx }))
					.filter(({ s }) => !s.strategyName.startsWith('kmeans'))
					.map(({ s, idx }) => (
						<span key={idx} className={`strategy-pill${idx === selectedStrategyIndex ? ' active' : ''}`}>
							{getStrategyDisplayName(s.strategyName, false)}: {s.silhouetteScore.toFixed(2)}
						</span>
					))}
			</div>
		</div>
	);
};
