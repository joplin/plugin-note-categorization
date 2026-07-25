import * as React from 'react';

export const SettingsPage: React.FC = () => {
	return (
		<div className="empty-state">
			<div className="empty-title">Settings</div>
			<div className="empty-subtitle">
				Model settings and clustering parameters will be configurable here in a future version.
			</div>
			<div className="config-card">
				<div className="config-card-header">Default Configuration:</div>
				<div className="config-card-item">
					• <strong>Model:</strong> Xenova/all-MiniLM-L6-v2 (384-dim)
				</div>
				<div className="config-card-item">
					• <strong>Metric:</strong> Cosine Similarity
				</div>
				<div className="config-card-item">
					• <strong>Limit:</strong> 200 Tokens/Chunk
				</div>
				<div className="config-card-item">
					• <strong>Strategies:</strong> K-Means, K-Medoids, HDBSCAN
				</div>
			</div>
		</div>
	);
};
