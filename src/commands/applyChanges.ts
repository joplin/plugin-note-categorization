import joplin from 'api';
import { ApplyOptions, PanelNote, PanelMessage } from '../types/panel';
import { log } from '../utils/logger';
import {
	fetchExistingTags,
	initializeClusterTags,
	applyTagsToNote,
	removeTagsFromNote,
	deleteCreatedTags,
} from './applyTags';
import {
	fetchExistingFolders,
	initializeClusterNotebooks,
	moveNoteToFolder,
	restoreNotebook,
	deleteCreatedFolders,
	cleanUpFolders,
} from './applyNotebooks';

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

		// Fetch existing items using modular helpers
		const existingTagsMap = await fetchExistingTags();
		const existingFoldersMap = await fetchExistingFolders();

		const uniqueClusterIds = Array.from(new Set(assignments.filter((id) => id >= 0)));

		// 1. Create/retrieve tags if needed
		const createdTagIds: string[] = [];
		let tagMap: { [clusterId: number]: string } = {};
		if (options.method === 'tags' || options.method === 'both') {
			tagMap = await initializeClusterTags(uniqueClusterIds, clusterNames, existingTagsMap, createdTagIds);
		}

		// 2. Create folders if needed
		const createdFolderIds: string[] = [];
		let folderMap: { [clusterId: number]: string } = {};
		let uncategorizedFolderId = '';
		if (options.method === 'notebooks' || options.method === 'both') {
			const initFolders = await initializeClusterNotebooks(
				uniqueClusterIds,
				clusterNames,
				assignments,
				existingFoldersMap,
				createdFolderIds,
			);
			folderMap = initFolders.folderMap;
			uncategorizedFolderId = initFolders.uncategorizedFolderId;
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

			// Handle tags using modular helper
			if ((options.method === 'tags' || options.method === 'both') && clusterId >= 0) {
				const addedTagIds = await applyTagsToNote(
					note,
					clusterId,
					noteTitle,
					noteBody,
					clusterNames,
					clusterTags,
					tagMap,
					existingTagsMap,
					createdTagIds,
				);
				if (addedTagIds.length > 0) {
					changeEntry.addedTagIds = addedTagIds;
					modified = true;
				}
			}

			// Handle folders using modular helper
			if (options.method === 'notebooks' || options.method === 'both') {
				const folderResult = await moveNoteToFolder(
					note.noteId,
					clusterId,
					originalParentId,
					folderMap,
					uncategorizedFolderId,
				);
				if (folderResult.modified) {
					changeEntry.originalParentId = folderResult.originalParentId;
					modified = true;
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
				await removeTagsFromNote(entry.noteId, [entry.addedTagId]);
			}

			// Remove added tags from note (new format)
			if (entry.addedTagIds) {
				await removeTagsFromNote(entry.noteId, entry.addedTagIds);
			}

			// Restore parent notebook
			if (entry.originalParentId) {
				await restoreNotebook(entry.noteId, entry.originalParentId);
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
			await deleteCreatedFolders(changeLog.createdFolderIds);
		}

		// 3. Delete created tags if they exist
		if (changeLog.createdTagIds && changeLog.createdTagIds.length > 0) {
			setPanelState({ type: 'undo_status', text: 'Deleting created tags...' });
			await deleteCreatedTags(changeLog.createdTagIds);
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

		const deletedCount = await cleanUpFolders(originalParentIds);

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
