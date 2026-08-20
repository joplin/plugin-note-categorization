import * as React from 'react';
import { FolderItem } from '../../types/notebook';

export interface TreeNodeProps {
	node: FolderItem;
	level: number;
	selectedIds: Set<string>;
	implicitIds: Set<string>;
	onToggle: (id: string) => void;
	searchQuery: string;
	parentMatched?: boolean;
	expandedIds: Set<string>;
	onToggleExpand: (id: string) => void;
	visibleFolderIds: Set<string> | null;
}

export const TreeNode: React.FC<TreeNodeProps> = ({
	node,
	level,
	selectedIds,
	implicitIds,
	onToggle,
	searchQuery,
	parentMatched,
	expandedIds,
	onToggleExpand,
	visibleFolderIds,
}) => {
	const isSelected = selectedIds.has(node.id);
	const isImplicit = !isSelected && implicitIds.has(node.id);
	const hasChildren = Boolean(node.children && node.children.length > 0);
	const isExpanded = expandedIds.has(node.id);

	const checkboxRef = React.useRef<HTMLInputElement>(null);

	// Set indeterminate state for implicitly selected checkboxes
	React.useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = isImplicit;
		}
	}, [isImplicit]);

	// Fast O(1) visibility check using precomputed visibleFolderIds set
	if (!parentMatched && visibleFolderIds && !visibleFolderIds.has(node.id)) {
		return null;
	}

	const thisNodeMatches = !searchQuery || node.title.toLowerCase().includes(searchQuery.toLowerCase());

	return (
		<div className="tree-node-wrapper" role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
			<div className="tree-node-row" style={{ paddingLeft: `${level * 16 + 8}px` }}>
				{hasChildren ? (
					<button
						type="button"
						className={`tree-expand-btn ${isExpanded ? 'expanded' : ''}`}
						onClick={(e) => {
							e.stopPropagation();
							onToggleExpand(node.id);
						}}
						aria-label={isExpanded ? `Collapse ${node.title}` : `Expand ${node.title}`}
					>
						<svg
							width="10"
							height="10"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>
				) : (
					<span className="tree-expand-spacer" />
				)}

				<label className={`tree-node-label${isImplicit ? ' tree-node-implicit' : ''}`}>
					<input
						ref={checkboxRef}
						type="checkbox"
						className="tree-node-checkbox"
						checked={isSelected || isImplicit}
						onChange={() => onToggle(node.id)}
					/>
					<svg
						className="tree-folder-icon"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
					>
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
					</svg>
					<span className="tree-node-title">{node.title}</span>
					<span className="tree-node-count">({node.noteCount ?? 0})</span>
				</label>
			</div>

			{hasChildren && (isExpanded || searchQuery.length > 0) && (
				<div className="tree-node-children" role="group">
					{node.children!.map((child) => (
						<TreeNode
							key={child.id}
							node={child}
							level={level + 1}
							selectedIds={selectedIds}
							implicitIds={implicitIds}
							onToggle={onToggle}
							searchQuery={searchQuery}
							parentMatched={parentMatched || thisNodeMatches}
							expandedIds={expandedIds}
							onToggleExpand={onToggleExpand}
							visibleFolderIds={visibleFolderIds}
						/>
					))}
				</div>
			)}
		</div>
	);
};
