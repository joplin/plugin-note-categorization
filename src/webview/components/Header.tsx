import * as React from 'react';
import { NotebookFilterConfig, FolderItem } from '../../types/notebook';

interface HeaderProps {
	isRunning: boolean;
	onRun: () => void;
	filterConfig?: NotebookFilterConfig;
	folders?: FolderItem[];
	onOpenFilterModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isRunning, onRun, filterConfig, folders, onOpenFilterModal }) => {
	const { fullLabel, shortLabel } = React.useMemo(() => {
		if (!filterConfig || filterConfig.mode === 'all') {
			return { fullLabel: 'All Notebooks', shortLabel: 'All' };
		}
		// Filter out stale folder IDs that no longer exist
		const folderIdSet = folders && folders.length > 0 ? new Set(folders.map((f) => f.id)) : null;
		const validCount = folderIdSet
			? filterConfig.selectedFolderIds.filter((id) => folderIdSet.has(id)).length
			: filterConfig.selectedFolderIds.length;
		if (filterConfig.mode === 'include') {
			return { fullLabel: `Include (${validCount})`, shortLabel: `Inc (${validCount})` };
		}
		if (filterConfig.mode === 'exclude') {
			return { fullLabel: `Exclude (${validCount})`, shortLabel: `Exc (${validCount})` };
		}
		return { fullLabel: 'Notebooks', shortLabel: 'Filter' };
	}, [filterConfig, folders]);

	const isFiltered = filterConfig && filterConfig.mode !== 'all';

	return (
		<div className="panel-header">
			<div className="panel-header-title">
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
					<line x1="7" y1="7" x2="7.01" y2="7" strokeWidth="2.5" />
				</svg>
				Note Categorizer
			</div>
			<div className="panel-header-actions">
				{onOpenFilterModal && (
					<button
						type="button"
						id="btn-notebook-filter"
						className={`btn-notebook-filter ${isFiltered ? 'active-filter' : ''}`}
						onClick={onOpenFilterModal}
						disabled={isRunning}
						title="Filter included or excluded notebooks"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						</svg>
						<span className="btn-filter-text">
							<span className="filter-label-full">{fullLabel}</span>
							<span className="filter-label-short">{shortLabel}</span>
						</span>
					</button>
				)}
				<button id="btn-run" className="btn-run" onClick={onRun} disabled={isRunning}>
					<svg
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polygon points="5 3 19 12 5 21 5 3" />
					</svg>
					{isRunning ? 'Running...' : 'Run'}
				</button>
			</div>
		</div>
	);
};
