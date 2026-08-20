import joplin from 'api';
import { FolderItem, NotebookFilterConfig } from '../types/notebook';

export interface NoteItem {
	id: string;
	title: string;
	body: string;
	updated_time: number;
	user_updated_time: number;
	parent_id: string;
}

/**
 * Fetches all active folders from Joplin.
 */
export const fetchAllFoldersList = async (): Promise<FolderItem[]> => {
	const folders: FolderItem[] = [];
	let page = 1;
	while (true) {
		const result = await joplin.data.get(['folders'], {
			fields: ['id', 'title', 'parent_id'],
			page,
			limit: 50,
		});
		folders.push(...result.items);
		if (!result.has_more) break;
		page++;
	}
	return folders;
};

/**
 * Given a list of folders, builds a map of parentId -> child folder IDs.
 */
export const buildFolderChildrenMap = (folders: FolderItem[]): Map<string, string[]> => {
	const childrenMap = new Map<string, string[]>();
	for (const folder of folders) {
		const parentId = folder.parent_id || '';
		const children = childrenMap.get(parentId) || [];
		children.push(folder.id);
		childrenMap.set(parentId, children);
	}
	return childrenMap;
};

/**
 * Recursively collects all descendant folder IDs for a given set of target folder IDs.
 */
export const getDescendantFolderIds = (targetFolderIds: string[], childrenMap: Map<string, string[]>): Set<string> => {
	const result = new Set<string>();
	const queue = [...targetFolderIds];

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		result.add(currentId);
		const children = childrenMap.get(currentId);
		if (children) {
			for (const childId of children) {
				if (!result.has(childId)) {
					queue.push(childId);
				}
			}
		}
	}

	return result;
};

/**
 * Resolves the effective set of folder IDs permitted by the given filter configuration.
 */
export const resolveEffectiveFolderIds = (
	allFolders: FolderItem[],
	filterConfig?: NotebookFilterConfig,
): Set<string> => {
	const allFolderIds = new Set(allFolders.map((f) => f.id));

	if (!filterConfig || filterConfig.mode === 'all') {
		return allFolderIds;
	}

	const selectedSet = new Set(filterConfig.selectedFolderIds.filter((id) => allFolderIds.has(id)));
	const childrenMap = buildFolderChildrenMap(allFolders);

	if (filterConfig.mode === 'include') {
		if (selectedSet.size === 0) {
			return new Set<string>();
		}
		if (filterConfig.includeSubNotebooks) {
			return getDescendantFolderIds(Array.from(selectedSet), childrenMap);
		}
		return selectedSet;
	}

	if (filterConfig.mode === 'exclude') {
		if (selectedSet.size === 0) {
			return allFolderIds;
		}
		const excludedSet = filterConfig.includeSubNotebooks
			? getDescendantFolderIds(Array.from(selectedSet), childrenMap)
			: selectedSet;

		const allowed = new Set<string>();
		for (const id of allFolderIds) {
			if (!excludedSet.has(id)) {
				allowed.add(id);
			}
		}
		return allowed;
	}

	return allFolderIds;
};

/**
 * Builds a hierarchical tree of folders from a flat list.
 */
export const buildFolderTree = (
	folders: FolderItem[],
	noteCountsByFolder: Map<string, number> = new Map(),
): FolderItem[] => {
	const folderMap = new Map<string, FolderItem>();
	for (const f of folders) {
		folderMap.set(f.id, {
			id: f.id,
			title: f.title,
			parent_id: f.parent_id || '',
			noteCount: noteCountsByFolder.get(f.id) || 0,
			children: [],
		});
	}

	const rootFolders: FolderItem[] = [];
	for (const f of folders) {
		const node = folderMap.get(f.id)!;
		if (f.parent_id && folderMap.has(f.parent_id)) {
			folderMap.get(f.parent_id)!.children!.push(node);
		} else {
			rootFolders.push(node);
		}
	}

	return rootFolders;
};

/**
 * Fetches all note IDs from Joplin (useful for global cache reconciliation).
 */
export const fetchAllJoplinNoteIds = async (): Promise<Set<string>> => {
	let page = 1;
	const allNoteIds = new Set<string>();
	while (true) {
		const result = await joplin.data.get(['notes'], {
			fields: ['id'],
			page,
			limit: 100,
		});
		result.items.forEach((n: { id: string }) => allNoteIds.add(n.id));
		if (!result.has_more) break;
		page++;
	}
	return allNoteIds;
};

/**
 * Fetches notes from Joplin filtered by the provided notebook filter configuration.
 */
export const fetchAllNotes = async (filterConfig?: NotebookFilterConfig): Promise<NoteItem[]> => {
	// Fetch all active folders
	const allFolders = await fetchAllFoldersList();
	const effectiveFolderIds = resolveEffectiveFolderIds(allFolders, filterConfig);

	if (effectiveFolderIds.size === 0) {
		return [];
	}

	// Fetch all notes
	let page = 1;
	const allNotes: NoteItem[] = [];
	while (true) {
		const result = await joplin.data.get(['notes'], {
			fields: ['id', 'title', 'body', 'updated_time', 'user_updated_time', 'parent_id'],
			page,
			limit: 50,
		});
		allNotes.push(...result.items);
		if (!result.has_more) break;
		page++;
	}

	// Filter out notes whose parent folder is not in the allowed active set
	const activeNotes = allNotes.filter((note) => effectiveFolderIds.has(note.parent_id));

	return activeNotes;
};
