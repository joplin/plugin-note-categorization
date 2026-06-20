import * as React from 'react';

export const HistoryPage: React.FC = () => {
	return (
		<div className="empty-state">
			<div className="empty-title">Change Log</div>
			<div className="empty-subtitle">
				A history of categorization runs and note changes will be displayed here once persistence is implemented
				in a future update.
			</div>
		</div>
	);
};
