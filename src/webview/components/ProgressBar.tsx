import * as React from 'react';
import { ProgressState } from '../../types/panel';

interface ProgressBarProps {
	statusText: string;
	progress: ProgressState;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ statusText, progress }) => {
	const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
	const progressLabelParts = [];
	if (progress.cached > 0) progressLabelParts.push(`${progress.cached} cached`);
	if (progress.skipped > 0) progressLabelParts.push(`${progress.skipped} skipped`);

	return (
		<div className="status-bar visible">
			<div className="status-text">{statusText}</div>
			<div className="progress-container">
				<div className="progress-fill" style={{ width: `${percent}%` }}></div>
			</div>
			<div className="progress-label">
				<span>{progress.total > 0 ? `${progress.current}/${progress.total} notes` : ''}</span>
				<span>{progressLabelParts.join(' · ')}</span>
			</div>
		</div>
	);
};
