import * as React from 'react';
import { BenchmarkResult } from '../../types/panel';

interface StrategySectionProps {
	strategies: BenchmarkResult[];
	selectedStrategyIndex: number;
	onStrategyChange: (index: number) => void;
}

/** Returns clean display names for dropdown */
function getStrategyDisplayName(name: string): string {
	if (name === 'hdbscan') {
		return 'HDBSCAN';
	} else if (name.startsWith('kmeans')) {
		return 'K-Means';
	}
	return name;
}

/** Returns info badge title & description for each strategy */
function getStrategyDetails(name: string): { tag: string; desc: string } {
	if (name === 'hdbscan') {
		return {
			tag: 'Natural Discovery',
			desc: 'Finds natural topic clusters and filters out unrelated notes. May leave some notes uncategorized.',
		};
	} else if (name.startsWith('kmeans')) {
		return {
			tag: 'Balanced Grouping',
			desc: 'Categorizes 100% of notes into balanced clusters. May group loosely related topics together.',
		};
	}
	return {
		tag: 'Clustering',
		desc: '',
	};
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

	const details = getStrategyDetails(selectedStrategy.strategyName);

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
							{getStrategyDisplayName(s.strategyName)}
						</option>
					))}
				</select>
			</div>

			<div className="strategy-score">
				{selectedStrategy.clusterCount} clusters
				{selectedStrategy.outlierCount > 0 ? ` · ${selectedStrategy.outlierCount} noise` : ''}
			</div>

			<div className="strategy-hint-card">
				<div className="strategy-hint-header">
					<span className="strategy-hint-tag">{details.tag}</span>
				</div>
				<p className="strategy-hint-desc">{details.desc}</p>
			</div>
		</div>
	);
};
