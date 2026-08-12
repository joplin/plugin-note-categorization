import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { StrategySection } from '../components/StrategySection';
import { ClusterCard } from '../components/ClusterCard';

import { NoticeBanner } from '../components/NoticeBanner';

export const DashboardPage: React.FC = () => {
	const {
		isRunning,
		runPipeline,
		strategies,
		selectedStrategyIndex,
		changeStrategy,
		notes,
		updateClusterName,
		moveNoteToCluster,
		addCluster,
		isApplying,
		applyProgress,
		applyError,
		applySuccess,
		applyChanges,
		isUndoing,
		settings,
		isNativeAiUsed,
		isAiNamingUsed,
	} = useAppState();

	const selectedStrategy = strategies[selectedStrategyIndex];

	const [isAddingCluster, setIsAddingCluster] = React.useState(false);
	const [newClusterName, setNewClusterName] = React.useState('');
	const [duplicateError, setDuplicateError] = React.useState(false);

	const [isNativeAiDismissed, setIsNativeAiDismissed] = React.useState(false);
	const [isAiNamingDismissed, setIsAiNamingDismissed] = React.useState(false);

	const { clusters, noise, sortedClusterIds } = React.useMemo(() => {
		const clusters: { [key: number]: number[] } = {};
		const noise: number[] = [];

		if (selectedStrategy) {
			const assignments = selectedStrategy.assignments || [];

			assignments.forEach((clusterId, noteIdx) => {
				if (clusterId === -1) {
					noise.push(noteIdx);
				} else {
					if (!clusters[clusterId]) {
						clusters[clusterId] = [];
					}
					clusters[clusterId].push(noteIdx);
				}
			});
		}

		const sortedClusterIds = Object.keys(clusters)
			.map(Number)
			.sort((a, b) => a - b);

		return { clusters, noise, sortedClusterIds };
	}, [selectedStrategy]);

	const handleAddClusterSubmit = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const name = newClusterName.trim();
		if (name) {
			const success = addCluster(name);
			if (success) {
				setNewClusterName('');
				setIsAddingCluster(false);
				setDuplicateError(false);
			} else {
				setDuplicateError(true);
			}
		}
	};

	const handleApply = () => {
		if (applySuccess || isApplying || isUndoing) {
			return;
		}
		applyChanges({
			method: 'both',
			parentNotebookName: settings.parentNotebook || '',
		});
	};

	return (
		<div className="page-dashboard">
			<Header isRunning={isRunning} onRun={runPipeline} />

			{!isNativeAiUsed && !isNativeAiDismissed && (
				<NoticeBanner
					variant="info"
					title="Tip for faster performance"
					message="Using local webview embeddings. Enable Joplin Native AI in Settings for up to 5x faster indexing while keeping data 100% local."
					onClose={() => setIsNativeAiDismissed(true)}
				/>
			)}

			<StrategySection
				strategies={strategies}
				selectedStrategyIndex={selectedStrategyIndex}
				onStrategyChange={changeStrategy}
			/>

			{!isAiNamingUsed && !isAiNamingDismissed && (
				<NoticeBanner
					variant="warning"
					title="Basic Naming Mode"
					message="Cluster names were generated using basic keyword extraction and may be less descriptive. Enable Joplin AI for smarter category titles."
					onClose={() => setIsAiNamingDismissed(true)}
				/>
			)}

			<div className="cluster-list visible">
				{selectedStrategy &&
					sortedClusterIds.map((id) => (
						<ClusterCard
							key={id}
							title={selectedStrategy.clusterNames?.[id] || `Cluster ${id + 1}`}
							noteIndices={clusters[id]}
							notes={notes}
							tags={selectedStrategy.tags?.[id]}
							onRename={(newName) => updateClusterName(id, newName)}
							onNoteDrop={(noteIndex) => moveNoteToCluster(noteIndex, id)}
						/>
					))}

				{selectedStrategy && (
					<div className={`cluster-card add-cluster-card${isAddingCluster ? ' editing' : ''}`}>
						{isAddingCluster ? (
							<form onSubmit={handleAddClusterSubmit} className="add-cluster-form">
								<input
									type="text"
									className="cluster-title-input"
									placeholder="Category name..."
									value={newClusterName}
									onChange={(e) => {
										setNewClusterName(e.target.value);
										setDuplicateError(false);
									}}
									autoFocus
									onKeyDown={(e) => {
										if (e.key === 'Escape') {
											setIsAddingCluster(false);
											setNewClusterName('');
											setDuplicateError(false);
										}
									}}
								/>
								{duplicateError && <span className="add-cluster-error">Name already exists</span>}
								<div className="add-cluster-actions">
									<button type="submit" className="btn-add-confirm">
										Create
									</button>
									<button
										type="button"
										className="btn-add-cancel"
										onClick={() => {
											setIsAddingCluster(false);
											setNewClusterName('');
											setDuplicateError(false);
										}}
									>
										Cancel
									</button>
								</div>
							</form>
						) : (
							<button className="add-cluster-trigger-btn" onClick={() => setIsAddingCluster(true)}>
								<span className="add-cluster-icon">+</span> Add custom category
							</button>
						)}
					</div>
				)}

				{selectedStrategy && noise.length > 0 && (
					<ClusterCard
						title="Uncategorized"
						noteIndices={noise}
						notes={notes}
						isNoise={true}
						onNoteDrop={(noteIndex) => moveNoteToCluster(noteIndex, -1)}
					/>
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
						<button
							className="btn-apply-primary"
							onClick={handleApply}
							disabled={isApplying || isUndoing || applySuccess}
						>
							{isApplying
								? 'Applying changes...'
								: applySuccess
									? 'Categorization Applied'
									: 'Apply New Categorization'}
						</button>
					</div>

					{isApplying && (
						<div className="status-banner-apply info">
							Applying changes: {applyProgress.current} / {applyProgress.total} notes processed...
						</div>
					)}

					{applySuccess && (
						<div className="status-banner-apply success">
							Categorization applied successfully! To undo or clean up, go to Tools → Options → AI
							Categorization.
						</div>
					)}

					{applyError && <div className="status-banner-apply error">Error: {applyError}</div>}
				</div>
			)}
		</div>
	);
};
