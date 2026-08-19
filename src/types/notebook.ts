export type NotebookFilterMode = 'all' | 'include' | 'exclude';

export interface NotebookFilterConfig {
	mode: NotebookFilterMode;
	selectedFolderIds: string[];
	includeSubNotebooks: boolean;
}

export interface FolderItem {
	id: string;
	title: string;
	parent_id: string;
	noteCount?: number;
	children?: FolderItem[];
}

export const DEFAULT_NOTEBOOK_FILTER: NotebookFilterConfig = {
	mode: 'all',
	selectedFolderIds: [],
	includeSubNotebooks: true,
};

export function isValidFilterConfig(obj: unknown): obj is NotebookFilterConfig {
	if (typeof obj !== 'object' || obj === null) return false;
	const o = obj as Record<string, unknown>;
	return (
		(o.mode === 'all' || o.mode === 'include' || o.mode === 'exclude') &&
		Array.isArray(o.selectedFolderIds) &&
		o.selectedFolderIds.every((id) => typeof id === 'string') &&
		typeof o.includeSubNotebooks === 'boolean'
	);
}
