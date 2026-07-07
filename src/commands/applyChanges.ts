import joplin from 'api';
import { ApplyOptions, PanelNote, PanelMessage } from '../types/panel';
import { log } from '../utils/logger';

export interface ChangeLogEntry {
	timestamp: number;
	method: 'tags' | 'notebooks' | 'both';
	notes: {
		noteId: string;
		originalParentId?: string;
		addedTagId?: string;
		addedTagIds?: string[];
	}[];
	createdFolderIds?: string[];
	createdTagIds?: string[];
}

function matchesKeyword(title: string, body: string, keyword: string): boolean {
	const lowerKeyword = keyword.toLowerCase();
	const lowerTitle = title.toLowerCase();
	const lowerBody = body.toLowerCase();

	try {
		const escaped = lowerKeyword.replace(/[-\x2f\\^$*+?.()|[\]{}]/g, '\\$&');
		// Unicode-aware word boundary matching
		const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}])` + escaped + `(?:$|[^\\p{L}\\p{N}])`, 'u');
		return regex.test(lowerTitle) || regex.test(lowerBody);
	} catch (e) {
		return lowerTitle.includes(lowerKeyword) || lowerBody.includes(lowerKeyword);
	}
}

export async function applyCategorizationChanges(
	options: ApplyOptions,
	notes: PanelNote[],
	assignments: number[],
	clusterNames: { [clusterId: number]: string },
	clusterTags: { [clusterId: number]: string[] },
	setPanelState: (state: PanelMessage) => void,
) {
	try {
		setPanelState({ type: 'apply_status', text: 'Fetching existing folders and tags...' });

		const MAX_PAGES = 500;

		// Fetch all existing tags once to map titles to IDs
		const allTags: any[] = [];
		let tagPage = 1;
		while (tagPage <= MAX_PAGES) {
			const res = await joplin.data.get(['tags'], { page: tagPage, limit: 100, fields: ['id', 'title'] });
			allTags.push(...res.items);
			if (!res.has_more) break;
			tagPage++;
		}
		const existingTagsMap = new Map<string, string>(allTags.map((t: any) => [t.title.toLowerCase(), t.id]));

		// Fetch all folders once to map titles and parent_ids to IDs
		const allFoldersList: any[] = [];
		let folderPage = 1;
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
		const existingFoldersMap = new Map<string, string>(
			allFoldersList.map((f: any) => [`${f.title.toLowerCase()}\x1F${f.parent_id || ''}`, f.id]),
		);

		// Optimized helper to get or create tag
		const getOrCreateTagOptimized = async (title: string): Promise<{ id: string; created: boolean }> => {
			const lowerTitle = title.toLowerCase();
			const cachedId = existingTagsMap.get(lowerTitle);
			if (cachedId) {
				return { id: cachedId, created: false };
			}
			const created = await joplin.data.post(['tags'], null, { title });
			existingTagsMap.set(lowerTitle, created.id);
			return { id: created.id, created: true };
		};

		// Optimized helper to get or create folder
		const getOrCreateFolderOptimized = async (
			title: string,
			parentId = '',
		): Promise<{ id: string; created: boolean }> => {
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
		};

		const uniqueClusterIds = Array.from(new Set(assignments.filter((id) => id >= 0)));

		// 1. Create/retrieve tags if needed
		const tagMap: { [clusterId: number]: string } = {};
		const createdTagIds: string[] = [];
		if (options.method === 'tags' || options.method === 'both') {
			for (const clusterId of uniqueClusterIds) {
				const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
				const tagName = clusterName;
				const { id: tagId, created } = await getOrCreateTagOptimized(tagName);
				tagMap[clusterId] = tagId;
				if (created) {
					createdTagIds.push(tagId);
				}
			}
		}

		// 2. Create folders if needed
		const folderMap: { [clusterId: number]: string } = {};
		const createdFolderIds: string[] = [];
		let uncategorizedFolderId = '';
		if (options.method === 'notebooks' || options.method === 'both') {
			for (const clusterId of uniqueClusterIds) {
				const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
				const { id: childFolderId, created } = await getOrCreateFolderOptimized(clusterName);
				folderMap[clusterId] = childFolderId;
				if (created) {
					createdFolderIds.push(childFolderId);
				}
			}

			if (assignments.includes(-1)) {
				const { id: noiseFolderId, created } = await getOrCreateFolderOptimized('Uncategorized');
				uncategorizedFolderId = noiseFolderId;
				if (created) {
					createdFolderIds.push(noiseFolderId);
				}
			}
		}

		// 3. Process notes & build change log
		const total = notes.length;
		const changeLogNotes: {
			noteId: string;
			originalParentId?: string;
			addedTagId?: string;
			addedTagIds?: string[];
		}[] = [];

		for (let i = 0; i < total; i++) {
			const note = notes[i];
			const clusterId = assignments[i];

			const changeEntry: {
				noteId: string;
				originalParentId?: string;
				addedTagId?: string;
				addedTagIds?: string[];
			} = {
				noteId: note.noteId,
			};

			let modified = false;

			// Fetch note metadata and content once for both parent_id check and keyword matching
			let noteTitle = '';
			let noteBody = '';
			let originalParentId = '';
			const needsBody = options.method === 'tags' || options.method === 'both';
			try {
				const noteFields = needsBody ? ['parent_id', 'title', 'body'] : ['parent_id', 'title'];
				const noteObj = await joplin.data.get(['notes', note.noteId], {
					fields: noteFields,
				});
				originalParentId = noteObj.parent_id || '';
				noteTitle = noteObj.title || '';
				noteBody = needsBody ? noteObj.body || '' : '';
			} catch (fetchErr) {
				log(`Error fetching note data for ${note.noteId}: ${fetchErr}`);
				continue;
			}

			// Handle tags
			if ((options.method === 'tags' || options.method === 'both') && clusterId >= 0) {
				const addedTagIds: string[] = [];

				// Apply the main cluster name tag (as grouping tag)
				const mainTagId = tagMap[clusterId];
				if (mainTagId) {
					try {
						await joplin.data.post(['tags', mainTagId, 'notes'], null, { id: note.noteId });
						addedTagIds.push(mainTagId);
					} catch (tagErr) {
						log(`Tag ${mainTagId} may already be on note ${note.noteId}: ${tagErr}`);
					}
				}

				// Get all extracted specific tags for this cluster
				const specificTags = clusterTags[clusterId] || [];
				for (const tagText of specificTags) {
					// Don't duplicate the main cluster tag if it's already applied
					const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
					if (tagText.toLowerCase() === clusterName.toLowerCase()) {
						continue;
					}

					if (matchesKeyword(noteTitle, noteBody, tagText)) {
						const { id: tagId, created } = await getOrCreateTagOptimized(tagText);
						try {
							await joplin.data.post(['tags', tagId, 'notes'], null, { id: note.noteId });
							addedTagIds.push(tagId);
							if (created) {
								createdTagIds.push(tagId);
							}
						} catch (tagErr) {
							log(`Tag ${tagId} may already be on note ${note.noteId}: ${tagErr}`);
						}
					}
				}

				if (addedTagIds.length > 0) {
					changeEntry.addedTagIds = addedTagIds;
					modified = true;
				}
			}

			// Handle folders
			if (options.method === 'notebooks' || options.method === 'both') {
				let targetFolderId = '';
				if (clusterId >= 0) {
					targetFolderId = folderMap[clusterId];
				} else if (clusterId === -1 && uncategorizedFolderId) {
					targetFolderId = uncategorizedFolderId;
				}

				if (targetFolderId && targetFolderId !== originalParentId) {
					try {
						await joplin.data.put(['notes', note.noteId], null, { parent_id: targetFolderId });
						changeEntry.originalParentId = originalParentId;
						modified = true;
					} catch (moveErr) {
						log(`Failed to move note ${note.noteId} to folder ${targetFolderId}: ${moveErr}`);
					}
				}
			}

			if (modified) {
				changeLogNotes.push(changeEntry);
			}

			setPanelState({
				type: 'apply_progress',
				current: i + 1,
				total,
			});
		}

		// Save change log
		const changeLogEntry: ChangeLogEntry = {
			timestamp: Date.now(),
			method: options.method,
			notes: changeLogNotes,
			createdFolderIds,
			createdTagIds,
		};
		await joplin.settings.setValue('categorization.changeLog', JSON.stringify(changeLogEntry));

		setPanelState({ type: 'apply_complete' });
	} catch (err: any) {
		log('Error in applyCategorizationChanges: ' + err);
		setPanelState({
			type: 'apply_error',
			message: err.message || String(err),
		});
	}
}

export async function undoCategorizationChanges(setPanelState: (state: PanelMessage) => void) {
	try {
		setPanelState({ type: 'undo_status', text: 'Initializing undo operation...' });

		const changeLogStr = await joplin.settings.value('categorization.changeLog');
		if (!changeLogStr) {
			throw new Error('No change log found to undo.');
		}

		const changeLog: ChangeLogEntry = JSON.parse(changeLogStr);
		const total = changeLog.notes.length;

		// 1. Restore parent notebooks and remove tag associations from notes
		for (let i = 0; i < total; i++) {
			const entry = changeLog.notes[i];

			// Remove added tag from note (old format)
			if (entry.addedTagId) {
				try {
					await joplin.data.delete(['tags', entry.addedTagId, 'notes', entry.noteId]);
				} catch (tagErr) {
					log(`Undo: tag ${entry.addedTagId} removal failed for note ${entry.noteId}: ${tagErr}`);
				}
			}

			// Remove added tags from note (new format)
			if (entry.addedTagIds) {
				for (const tagId of entry.addedTagIds) {
					try {
						await joplin.data.delete(['tags', tagId, 'notes', entry.noteId]);
					} catch (tagErr) {
						log(`Undo: tag ${tagId} removal failed for note ${entry.noteId}: ${tagErr}`);
					}
				}
			}

			// Restore parent notebook
			if (entry.originalParentId) {
				try {
					await joplin.data.put(['notes', entry.noteId], null, { parent_id: entry.originalParentId });
				} catch (folderErr) {
					log(
						`Undo: restoring folder ${entry.originalParentId} failed for note ${entry.noteId}: ${folderErr}`,
					);
				}
			}

			setPanelState({
				type: 'undo_progress',
				current: i + 1,
				total,
			});
		}

		// 2. Delete created folders if they exist (check for notes AND subfolders)
		if (changeLog.createdFolderIds && changeLog.createdFolderIds.length > 0) {
			setPanelState({ type: 'undo_status', text: 'Deleting created notebooks...' });

			// Fetch all folders once to check for subfolders in memory
			const undoAllFolders: any[] = [];
			let undoPage = 1;
			while (undoPage <= 500) {
				const res = await joplin.data.get(['folders'], {
					page: undoPage,
					limit: 100,
					fields: ['id', 'parent_id'],
				});
				undoAllFolders.push(...res.items);
				if (!res.has_more) break;
				undoPage++;
			}
			const undoParentIds = new Set<string>(undoAllFolders.map((f: any) => f.parent_id).filter((pid) => !!pid));

			for (const folderId of changeLog.createdFolderIds) {
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

		// 3. Delete created tags if they exist
		if (changeLog.createdTagIds && changeLog.createdTagIds.length > 0) {
			setPanelState({ type: 'undo_status', text: 'Deleting created tags...' });
			for (const tagId of changeLog.createdTagIds) {
				try {
					await joplin.data.delete(['tags', tagId]);
				} catch (tagErr) {
					log(`Undo: failed to delete created tag ${tagId}: ${tagErr}`);
				}
			}
		}

		// Clear change log
		await joplin.settings.setValue('categorization.changeLog', '');

		setPanelState({ type: 'undo_complete' });
	} catch (err: any) {
		log('Error in undoCategorizationChanges: ' + err);
		setPanelState({
			type: 'undo_error',
			message: err.message || String(err),
		});
	}
}

export async function cleanUpEmptyNotebooks(setPanelState: (state: PanelMessage) => void) {
	try {
		setPanelState({ type: 'cleanup_status', text: 'Checking empty notebooks...' });

		const changeLogStr = await joplin.settings.value('categorization.changeLog');
		if (!changeLogStr) {
			throw new Error('No active categorization history found.');
		}
		const changeLog: ChangeLogEntry = JSON.parse(changeLogStr);

		// Get all unique original parent IDs
		const originalParentIds = new Set<string>();
		for (const note of changeLog.notes) {
			if (note.originalParentId) {
				originalParentIds.add(note.originalParentId);
			}
		}

		if (originalParentIds.size === 0) {
			setPanelState({ type: 'cleanup_complete', message: 'No original notebooks to clean up.' });
			return;
		}

		let deletedCount = 0;

		// Fetch all folders once to map parent-child relationships in memory
		const allFolders: any[] = [];
		let page = 1;
		while (page <= 500) {
			const res = await joplin.data.get(['folders'], { page, limit: 100, fields: ['id', 'parent_id'] });
			allFolders.push(...res.items);
			if (!res.has_more) break;
			page++;
		}
		const parentFolderIds = new Set<string>(allFolders.map((f: any) => f.parent_id).filter((pid) => !!pid));

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

		setPanelState({
			type: 'cleanup_complete',
			message: `Cleaned up ${deletedCount} empty original notebook(s) successfully!`,
		});
	} catch (err: any) {
		log('Error in cleanUpEmptyNotebooks: ' + err);
		setPanelState({
			type: 'cleanup_error',
			message: err.message || String(err),
		});
	}
}
