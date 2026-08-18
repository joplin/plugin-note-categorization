import * as React from 'react';
import { useAppState } from '../context/AppStateContext';

export const SettingsPage: React.FC = () => {
	const { settings } = useAppState();

	return (
		<div className="empty-state" style={{ padding: '24px 16px' }}>
			<div className="empty-title">Plugin Settings</div>
			<div className="empty-subtitle">
				Settings are managed in Joplin&apos;s native Options window. Go to{' '}
				<strong>Tools &rarr; Options &rarr; AI Categorization</strong> to configure the plugin.
			</div>

			<div
				className="config-card"
				style={{ width: '100%', maxWidth: '320px', textAlign: 'left', marginTop: '20px' }}
			>
				<div className="config-card-header">Active Configuration:</div>
				<div className="config-card-item">
					• <strong>Distance Metric:</strong> Cosine Similarity
				</div>
				<div className="config-card-item">
					• <strong>Target Notebook:</strong> {settings.parentNotebook || '(Root Notebooks)'}
				</div>
				<div className="config-card-item">
					• <strong>Apply Method:</strong>{' '}
					{settings.applyMethod === 'both'
						? 'Both (Notebooks & Tags)'
						: settings.applyMethod === 'notebooks'
							? 'Notebooks only'
							: 'Tags only'}
				</div>
				<div className="config-card-item">
					• <strong>Embedding Model:</strong> all-MiniLM-L6-v2 (384-dim)
				</div>
				<div className="config-card-item">
					• <strong>Clustering Strategies:</strong> Auto K-Means, HDBSCAN
				</div>
			</div>
		</div>
	);
};
