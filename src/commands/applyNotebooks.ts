import joplin from 'api';
import { log } from '../utils/logger';

interface JoplinFolder {
	id: string;
	title: string;
	parent_id: string;
}

export async function fetchExistingFolders(): Promise<Map<string, string>> {
	const allFoldersList: JoplinFolder[] = [];
	let folderPage = 1;
	const MAX_PAGES = 500;
	while (folderPage <= MAX_PAGES) {
		const res = await joplin.data.get(['folders'], {
			page: folderPage,
			limit: 100,
			fields: ['id', 'title', 'parent_id'],
		});
		allFoldersList.push(...res.items);
		if (!res.has_more) break;
		folderPage++;
	}
	return new Map<string, string>(
		allFoldersList.map((f) => [`${f.title.toLowerCase()}\x1F${f.parent_id || ''}`, f.id]),
	);
}

export async function getOrCreateFolder(
	existingFoldersMap: Map<string, string>,
	title: string,
	parentId = '',
): Promise<{ id: string; created: boolean }> {
	const key = `${title.toLowerCase()}\x1F${parentId}`;
	const cachedId = existingFoldersMap.get(key);
	if (cachedId) {
		return { id: cachedId, created: false };
	}
	const created = await joplin.data.post(['folders'], null, {
		title,
		parent_id: parentId || undefined,
	});
	existingFoldersMap.set(key, created.id);
	return { id: created.id, created: true };
}

export async function initializeClusterNotebooks(
	uniqueClusterIds: number[],
	clusterNames: { [clusterId: number]: string },
	assignments: number[],
	existingFoldersMap: Map<string, string>,
	createdFolderIds: string[],
): Promise<{ folderMap: { [clusterId: number]: string }; uncategorizedFolderId: string }> {
	const folderMap: { [clusterId: number]: string } = {};
	let uncategorizedFolderId = '';

	for (const clusterId of uniqueClusterIds) {
		const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
		const { id: childFolderId, created } = await getOrCreateFolder(existingFoldersMap, clusterName);
		folderMap[clusterId] = childFolderId;
		if (created) {
			createdFolderIds.push(childFolderId);
		}
	}

	if (assignments.includes(-1)) {
		const { id: noiseFolderId, created } = await getOrCreateFolder(existingFoldersMap, 'Uncategorized');
		uncategorizedFolderId = noiseFolderId;
		if (created) {
			createdFolderIds.push(noiseFolderId);
		}
	}

	return { folderMap, uncategorizedFolderId };
}

export async function moveNoteToFolder(
	noteId: string,
	clusterId: number,
	originalParentId: string,
	folderMap: { [clusterId: number]: string },
	uncategorizedFolderId: string,
): Promise<{ originalParentId?: string; modified: boolean }> {
	let targetFolderId = '';
	if (clusterId >= 0) {
		targetFolderId = folderMap[clusterId];
	} else if (clusterId === -1 && uncategorizedFolderId) {
		targetFolderId = uncategorizedFolderId;
	}

	if (targetFolderId && targetFolderId !== originalParentId) {
		try {
			await joplin.data.put(['notes', noteId], null, { parent_id: targetFolderId });
			return { originalParentId, modified: true };
		} catch (moveErr) {
			log(`Failed to move note ${noteId} to folder ${targetFolderId}: ${moveErr}`);
		}
	}

	return { modified: false };
}

export async function restoreNotebook(noteId: string, originalParentId: string) {
	try {
		await joplin.data.put(['notes', noteId], null, { parent_id: originalParentId });
	} catch (folderErr) {
		log(`Undo: restoring folder ${originalParentId} failed for note ${noteId}: ${folderErr}`);
	}
}

export async function deleteCreatedFolders(createdFolderIds: string[]) {
	// Fetch all folders once to check for subfolders in memory
	const undoAllFolders: JoplinFolder[] = [];
	let undoPage = 1;
	const MAX_PAGES = 500;
	while (undoPage <= MAX_PAGES) {
		const res = await joplin.data.get(['folders'], {
			page: undoPage,
			limit: 100,
			fields: ['id', 'parent_id'],
		});
		undoAllFolders.push(...res.items);
		if (!res.has_more) break;
		undoPage++;
	}
	const undoParentIds = new Set<string>(undoAllFolders.map((f) => f.parent_id).filter((pid) => !!pid));

	for (const folderId of createdFolderIds) {
		try {
			// Skip if folder has subfolders
			if (undoParentIds.has(folderId)) {
				log(`Undo: skipping folder ${folderId} — has subfolders`);
				continue;
			}
			// Skip if folder still has notes
			const notesInFolder = await joplin.data.get(['folders', folderId, 'notes'], { limit: 1 });
			if (notesInFolder.items.length > 0) {
				log(`Undo: skipping non-empty folder ${folderId}`);
				continue;
			}
			await joplin.data.delete(['folders', folderId]);
		} catch (folderErr) {
			log(`Undo: failed to delete created folder ${folderId}: ${folderErr}`);
		}
	}
}

export async function cleanUpFolders(originalParentIds: Set<string>): Promise<number> {
	let deletedCount = 0;

	// Fetch all folders once to map parent-child relationships in memory
	const allFolders: JoplinFolder[] = [];
	let page = 1;
	const MAX_PAGES = 500;
	while (page <= MAX_PAGES) {
		const res = await joplin.data.get(['folders'], { page, limit: 100, fields: ['id', 'parent_id'] });
		allFolders.push(...res.items);
		if (!res.has_more) break;
		page++;
	}
	const parentFolderIds = new Set<string>(allFolders.map((f) => f.parent_id).filter((pid) => !!pid));

	for (const folderId of originalParentIds) {
		try {
			// 1. Check if it has subfolders in memory
			if (parentFolderIds.has(folderId)) {
				continue;
			}

			// 2. Check notes count in this folder
			const notesInFolder = await joplin.data.get(['folders', folderId, 'notes'], { limit: 1 });
			if (notesInFolder.items.length === 0) {
				await joplin.data.delete(['folders', folderId]);
				deletedCount++;
			}
		} catch (err) {
			log(`Cleanup: failed to check or delete folder ${folderId}: ${err}`);
		}
	}

	return deletedCount;
}
