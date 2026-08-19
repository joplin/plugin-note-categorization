import * as React from 'react';
import { FolderItem, NotebookFilterConfig, NotebookFilterMode } from '../../types/notebook';
import { TreeNode } from './TreeNode';

interface NotebookFilterModalProps {
	isOpen: boolean;
	onClose: () => void;
	filterConfig: NotebookFilterConfig;
	onSave: (config: NotebookFilterConfig) => void;
	folderTree: FolderItem[];
	folders: FolderItem[];
	counts: { [folderId: string]: number };
	isLoading: boolean;
	onRefresh: () => void;
}

export const NotebookFilterModal: React.FC<NotebookFilterModalProps> = ({
	isOpen,
	onClose,
	filterConfig,
	onSave,
	folderTree,
	folders,
	counts,
	isLoading,
	onRefresh,
}) => {
	const [mode, setMode] = React.useState<NotebookFilterMode>(filterConfig.mode);
	const [includeIds, setIncludeIds] = React.useState<Set<string>>(new Set());
	const [excludeIds, setExcludeIds] = React.useState<Set<string>>(new Set());
	const [includeSubNotebooks, setIncludeSubNotebooks] = React.useState<boolean>(
		filterConfig.includeSubNotebooks ?? true,
	);
	const [searchQuery, setSearchQuery] = React.useState<string>('');
	const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
	const wasOpenRef = React.useRef(false);

	// Derive the active selection from the current mode
	const selectedIds = mode === 'include' ? includeIds : excludeIds;
	const setSelectedIds = mode === 'include' ? setIncludeIds : setExcludeIds;

	// Memoized map of parentId -> child folder IDs
	const childrenMap = React.useMemo(() => {
		const map = new Map<string, string[]>();
		for (const f of folders) {
			const pid = f.parent_id || '';
			const list = map.get(pid) || [];
			list.push(f.id);
			map.set(pid, list);
		}
		return map;
	}, [folders]);

	// Fast BFS descendant collector
	const getDescendants = React.useCallback(
		(rootIds: Set<string>): Set<string> => {
			const res = new Set<string>();
			const queue = Array.from(rootIds);
			let idx = 0;
			while (idx < queue.length) {
				const cur = queue[idx++];
				res.add(cur);
				const kids = childrenMap.get(cur);
				if (kids) {
					for (const kid of kids) {
						if (!res.has(kid)) {
							res.add(kid);
							queue.push(kid);
						}
					}
				}
			}
			return res;
		},
		[childrenMap],
	);

	// Precomputed visible folder IDs for search matching (O(n) once per search query change)
	const visibleFolderIds = React.useMemo(() => {
		if (!searchQuery.trim()) return null;
		const query = searchQuery.trim().toLowerCase();
		const visible = new Set<string>();

		const checkVisibility = (node: FolderItem): boolean => {
			const selfMatch = node.title.toLowerCase().includes(query);
			let hasChildMatch = false;
			if (node.children && node.children.length > 0) {
				for (const child of node.children) {
					if (checkVisibility(child)) {
						hasChildMatch = true;
					}
				}
			}
			if (selfMatch || hasChildMatch) {
				visible.add(node.id);
				return true;
			}
			return false;
		};

		folderTree.forEach(checkVisibility);
		return visible;
	}, [searchQuery, folderTree]);

	// Compute implicitly selected folder IDs (children of selected parents when includeSubNotebooks is on)
	const implicitIds = React.useMemo(() => {
		if (!includeSubNotebooks || mode === 'all' || selectedIds.size === 0) return new Set<string>();

		const descendants = getDescendants(selectedIds);
		const result = new Set<string>();
		for (const id of descendants) {
			if (!selectedIds.has(id)) {
				result.add(id);
			}
		}
		return result;
	}, [includeSubNotebooks, mode, selectedIds, getDescendants]);

	// Expand all top-level nodes by default when folderTree is available
	React.useEffect(() => {
		if (folderTree && folderTree.length > 0) {
			setExpandedIds((prev) => {
				if (prev.size === 0) {
					return new Set(folderTree.map((f) => f.id));
				}
				return prev;
			});
		}
	}, [folderTree]);

	// Sync local state ONLY when modal transitions from closed to open
	React.useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			const savedMode = filterConfig.mode || 'all';
			const savedIds = new Set(filterConfig.selectedFolderIds || []);
			setMode(savedMode);
			// Load saved IDs into the correct mode's state; reset the other
			setIncludeIds(savedMode === 'include' ? savedIds : new Set());
			setExcludeIds(savedMode === 'exclude' ? savedIds : new Set());
			setIncludeSubNotebooks(filterConfig.includeSubNotebooks ?? true);
			setSearchQuery('');
			onRefresh();
		}
		wasOpenRef.current = isOpen;
	}, [isOpen]);

	// Handle Escape key to close modal
	React.useEffect(() => {
		if (!isOpen) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, onClose]);

	const handleToggleFolder = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleToggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleSelectAll = () => {
		setSelectedIds(new Set(folders.map((f) => f.id)));
	};

	const handleClearAll = () => {
		setSelectedIds(new Set());
	};

	const handleSave = () => {
		onSave({
			mode,
			selectedFolderIds: mode === 'all' ? [] : Array.from(selectedIds),
			includeSubNotebooks,
		});
		onClose();
	};

	// Calculate estimated matching notes count
	const estimatedNoteCount = React.useMemo(() => {
		const validFolderIds = new Set(folders.map((f) => f.id));

		if (mode === 'all') {
			return Object.entries(counts).reduce((sum, [id, count]) => (validFolderIds.has(id) ? sum + count : sum), 0);
		}

		const effectiveIds = includeSubNotebooks ? getDescendants(selectedIds) : selectedIds;

		if (mode === 'include') {
			let total = 0;
			effectiveIds.forEach((id) => {
				total += counts[id] || 0;
			});
			return total;
		}

		if (mode === 'exclude') {
			let total = 0;
			folders.forEach((f) => {
				if (!effectiveIds.has(f.id)) {
					total += counts[f.id] || 0;
				}
			});
			return total;
		}

		return 0;
	}, [mode, selectedIds, includeSubNotebooks, folders, counts, getDescendants]);

	const staleFolderCount = React.useMemo(() => {
		if (mode === 'all') return 0;
		const currentFolderIds = new Set(folders.map((f) => f.id));
		return Array.from(selectedIds).filter((id) => !currentFolderIds.has(id)).length;
	}, [mode, selectedIds, folders]);

	if (!isOpen) return null;

	return (
		<div className="filter-modal-overlay" onClick={onClose}>
			<div
				className="filter-modal-container"
				role="dialog"
				aria-modal="true"
				aria-labelledby="filter-modal-title"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="filter-modal-header">
					<div id="filter-modal-title" className="filter-modal-title">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						</svg>
						Notebook Filter
					</div>
					<button className="filter-modal-close-btn" onClick={onClose} aria-label="Close modal">
						&times;
					</button>
				</div>

				<div className="filter-modal-body">
					{/* Mode Segmented Control */}
					<div className="filter-mode-tabs" role="tablist">
						<button
							type="button"
							role="tab"
							aria-selected={mode === 'all'}
							className={`filter-mode-tab ${mode === 'all' ? 'active' : ''}`}
							onClick={() => setMode('all')}
						>
							<span className="tab-label-full">All Notebooks</span>
							<span className="tab-label-short">All</span>
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mode === 'include'}
							className={`filter-mode-tab ${mode === 'include' ? 'active' : ''}`}
							onClick={() => setMode('include')}
						>
							<span className="tab-label-full">Include Selected</span>
							<span className="tab-label-short">Include</span>
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mode === 'exclude'}
							className={`filter-mode-tab ${mode === 'exclude' ? 'active' : ''}`}
							onClick={() => setMode('exclude')}
						>
							<span className="tab-label-full">Exclude Selected</span>
							<span className="tab-label-short">Exclude</span>
						</button>
					</div>

					<div className="filter-mode-description">
						{mode === 'all' && 'Categorizes all active notes across your entire Joplin workspace.'}
						{mode === 'include' &&
							(includeSubNotebooks
								? 'Only categorizes notes residing in the selected notebooks and their sub-notebooks.'
								: 'Only categorizes notes residing in the selected notebooks (sub-notebooks not included).')}
						{mode === 'exclude' &&
							(includeSubNotebooks
								? 'Categorizes all notes EXCEPT those in the selected notebooks and their sub-notebooks.'
								: 'Categorizes all notes EXCEPT those directly in the selected notebooks.')}
					</div>

					{mode !== 'all' && (
						<>
							{/* Controls Row */}
							<div className="filter-controls-row">
								<div className="filter-search-box">
									<svg
										className="filter-search-icon"
										width="13"
										height="13"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<circle cx="11" cy="11" r="8" />
										<line x1="21" y1="21" x2="16.65" y2="16.65" />
									</svg>
									<input
										type="text"
										className="filter-search-input"
										placeholder="Search notebooks..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
									/>
									{searchQuery && (
										<button
											type="button"
											className="filter-search-clear"
											onClick={() => setSearchQuery('')}
										>
											&times;
										</button>
									)}
								</div>

								<div className="filter-selection-buttons">
									<button type="button" className="btn-filter-action" onClick={handleSelectAll}>
										Select All
									</button>
									<button type="button" className="btn-filter-action" onClick={handleClearAll}>
										Clear
									</button>
								</div>
							</div>

							{/* Recursive Sub-notebooks Toggle */}
							<label className="filter-recursive-toggle">
								<input
									type="checkbox"
									checked={includeSubNotebooks}
									onChange={(e) => setIncludeSubNotebooks(e.target.checked)}
								/>
								<span>Include sub-notebooks automatically</span>
							</label>

							{/* Tree View */}
							<div className="filter-tree-container" role="tree">
								{isLoading ? (
									<div className="filter-loading">Loading notebooks...</div>
								) : folderTree.length === 0 ? (
									<div className="filter-empty">No notebooks found.</div>
								) : (
									folderTree.map((node) => (
										<TreeNode
											key={node.id}
											node={node}
											level={0}
											selectedIds={selectedIds}
											implicitIds={implicitIds}
											onToggle={handleToggleFolder}
											searchQuery={searchQuery}
											expandedIds={expandedIds}
											onToggleExpand={handleToggleExpand}
											visibleFolderIds={visibleFolderIds}
										/>
									))
								)}
							</div>
						</>
					)}
				</div>

				<div className="filter-modal-footer">
					<div className="filter-summary-badge">
						<strong>{estimatedNoteCount}</strong> notes matching filter
						{staleFolderCount > 0 && (
							<span style={{ color: 'var(--accent)', marginLeft: '6px', fontSize: '0.9em' }}>
								{`⚠ ${staleFolderCount} selected notebook${staleFolderCount !== 1 ? 's' : ''} no longer exist${staleFolderCount === 1 ? 's' : ''}`}
							</span>
						)}
					</div>
					<div className="filter-footer-actions">
						<button type="button" className="btn-filter-cancel" onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className="btn-filter-save"
							onClick={handleSave}
							disabled={mode !== 'all' && selectedIds.size === 0}
							title={
								mode !== 'all' && selectedIds.size === 0 ? 'Select at least one notebook' : undefined
							}
						>
							Save Filter
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};
