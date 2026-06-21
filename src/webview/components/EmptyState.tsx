import * as React from 'react';

export const EmptyState: React.FC = () => {
	return (
		<div className="empty-state">
			<div className="empty-title">No categories yet</div>
			<div className="empty-subtitle">Click Run to categorize your notes using on-device AI.</div>
		</div>
	);
};
