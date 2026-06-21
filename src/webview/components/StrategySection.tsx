import * as React from 'react';
import { BenchmarkResult } from '../../types/panel';

interface StrategySectionProps {
	strategies: BenchmarkResult[];
	selectedStrategyIndex: number;
	onStrategyChange: (index: number) => void;
}

/** Shortens 'hdbscan-5-ms2' → 'hdbscan-5' for pill labels */
function abbreviateStrategy(name: string): string {
	if (!name) return '';
	const parts = name.split('-');
	return parts.length > 2 ? parts[0] + '-' + parts[1] : name;
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
							{s.strategyName} ({s.silhouetteScore.toFixed(2)})
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
				{strategies.map((s, idx) => (
					<span key={idx} className={`strategy-pill${idx === selectedStrategyIndex ? ' active' : ''}`}>
						{abbreviateStrategy(s.strategyName)}: {s.silhouetteScore.toFixed(2)}
					</span>
				))}
			</div>
		</div>
	);
};
