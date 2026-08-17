import joplin from 'api';
import { applyCategorizationChanges, undoCategorizationChanges } from '../../src/commands/applyChanges';
import {
	fetchAllFolders,
	initializeClusterNotebooks,
	moveNoteToFolder,
	restoreNotebook,
	deleteCreatedFolders,
	cleanUpFolders,
} from '../../src/commands/applyNotebooks';
import {
	fetchExistingTags,
	initializeClusterTags,
	applyTagsToNote,
	removeTagsFromNote,
	deleteCreatedTags,
} from '../../src/commands/applyTags';

jest.mock('api', () => ({
	__esModule: true,
	default: {
		data: {
			get: jest.fn(),
			put: jest.fn(),
			post: jest.fn(),
		},
		settings: {
			value: jest.fn(),
			setValue: jest.fn(),
		},
	},
}));

jest.mock('../../src/commands/applyNotebooks', () => ({
	fetchAllFolders: jest.fn(),
	initializeClusterNotebooks: jest.fn(),
	moveNoteToFolder: jest.fn(),
	restoreNotebook: jest.fn(),
	deleteCreatedFolders: jest.fn(),
	cleanUpFolders: jest.fn(),
}));

jest.mock('../../src/commands/applyTags', () => ({
	fetchExistingTags: jest.fn().mockResolvedValue(new Map()),
	initializeClusterTags: jest.fn().mockResolvedValue({}),
	applyTagsToNote: jest.fn().mockResolvedValue([]),
	removeTagsFromNote: jest.fn().mockResolvedValue(undefined),
	deleteCreatedTags: jest.fn().mockResolvedValue(undefined),
}));

describe('applyChanges commands', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('applyCategorizationChanges runs auto-cleanup after note moves in notebooks mode', async () => {
		(fetchAllFolders as jest.Mock).mockResolvedValue({
			byKey: new Map(),
			byId: new Map([['orig-folder-id', { title: 'Orig Folder', parent_id: 'grandparent-id' }]]),
		});
		(initializeClusterNotebooks as jest.Mock).mockResolvedValue({
			folderMap: { 0: 'target-folder-id' },
			uncategorizedFolderId: '',
		});
		(joplin.data.get as jest.Mock).mockResolvedValue({ parent_id: 'orig-folder-id', title: 'Note 1' });
		(moveNoteToFolder as jest.Mock).mockResolvedValue({ originalParentId: 'orig-folder-id', modified: true });

		await applyCategorizationChanges(
			{ method: 'notebooks', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{},
			jest.fn(),
		);

		expect(cleanUpFolders).toHaveBeenCalledTimes(1);
		const calledSet = (cleanUpFolders as jest.Mock).mock.calls[0][0];
		expect(calledSet).toEqual(new Set(['orig-folder-id']));
		expect(initializeClusterTags).not.toHaveBeenCalled();
		expect(applyTagsToNote).not.toHaveBeenCalled();
	});

	it('applyCategorizationChanges applies tags and skips folder operations in tags mode', async () => {
		(fetchExistingTags as jest.Mock).mockResolvedValue(new Map());
		(fetchAllFolders as jest.Mock).mockResolvedValue({
			byKey: new Map(),
			byId: new Map(),
		});
		(initializeClusterTags as jest.Mock).mockResolvedValue({ 0: 'tag-1' });
		(applyTagsToNote as jest.Mock).mockResolvedValue(['tag-1', 'tag-kw']);
		(joplin.data.get as jest.Mock).mockResolvedValue({
			parent_id: 'orig-folder-id',
			title: 'Note 1',
			body: 'body content',
		});

		await applyCategorizationChanges(
			{ method: 'tags', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{ 0: ['tag-kw'] },
			jest.fn(),
		);

		expect(initializeClusterTags).toHaveBeenCalledTimes(1);
		expect(applyTagsToNote).toHaveBeenCalledTimes(1);
		expect(initializeClusterNotebooks).not.toHaveBeenCalled();
		expect(moveNoteToFolder).not.toHaveBeenCalled();
		expect(cleanUpFolders).not.toHaveBeenCalled();

		const setValueCalls = (joplin.settings.setValue as jest.Mock).mock.calls;
		const changeLogCall = setValueCalls.find((call) => call[0] === 'categorization.changeLog');
		expect(changeLogCall).toBeDefined();

		const changeLog = JSON.parse(changeLogCall[1]);
		expect(changeLog.method).toBe('tags');
		expect(changeLog.notes[0].addedTagIds).toEqual(['tag-1', 'tag-kw']);
		expect(changeLog.notes[0].originalParentId).toBeUndefined();
	});

	it('applyCategorizationChanges applies both notebooks and tags in both mode', async () => {
		(fetchExistingTags as jest.Mock).mockResolvedValue(new Map());
		(fetchAllFolders as jest.Mock).mockResolvedValue({
			byKey: new Map(),
			byId: new Map([['orig-folder-id', { title: 'Orig Folder', parent_id: 'grandparent-id' }]]),
		});
		(initializeClusterTags as jest.Mock).mockResolvedValue({ 0: 'tag-1' });
		(initializeClusterNotebooks as jest.Mock).mockResolvedValue({
			folderMap: { 0: 'target-folder-id' },
			uncategorizedFolderId: '',
		});
		(applyTagsToNote as jest.Mock).mockResolvedValue(['tag-1']);
		(joplin.data.get as jest.Mock).mockResolvedValue({
			parent_id: 'orig-folder-id',
			title: 'Note 1',
			body: 'body',
		});
		(moveNoteToFolder as jest.Mock).mockResolvedValue({ originalParentId: 'orig-folder-id', modified: true });

		await applyCategorizationChanges(
			{ method: 'both', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{ 0: [] },
			jest.fn(),
		);

		expect(initializeClusterTags).toHaveBeenCalledTimes(1);
		expect(initializeClusterNotebooks).toHaveBeenCalledTimes(1);
		expect(applyTagsToNote).toHaveBeenCalledTimes(1);
		expect(moveNoteToFolder).toHaveBeenCalledTimes(1);
		expect(cleanUpFolders).toHaveBeenCalledTimes(1);

		const setValueCalls = (joplin.settings.setValue as jest.Mock).mock.calls;
		const changeLogCall = setValueCalls.find((call) => call[0] === 'categorization.changeLog');
		expect(changeLogCall).toBeDefined();

		const changeLog = JSON.parse(changeLogCall[1]);
		expect(changeLog.method).toBe('both');
		expect(changeLog.notes[0].addedTagIds).toEqual(['tag-1']);
		expect(changeLog.notes[0].originalParentId).toBe('orig-folder-id');
	});

	it('applyCategorizationChanges stores folder metadata in change log', async () => {
		(fetchAllFolders as jest.Mock).mockResolvedValue({
			byKey: new Map(),
			byId: new Map([['orig-folder-id', { title: 'Orig Folder', parent_id: 'grandparent-id' }]]),
		});
		(initializeClusterNotebooks as jest.Mock).mockResolvedValue({
			folderMap: { 0: 'target-folder-id' },
			uncategorizedFolderId: '',
		});
		(joplin.data.get as jest.Mock).mockResolvedValue({ parent_id: 'orig-folder-id', title: 'Note 1' });
		(moveNoteToFolder as jest.Mock).mockResolvedValue({ originalParentId: 'orig-folder-id', modified: true });

		await applyCategorizationChanges(
			{ method: 'notebooks', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{},
			jest.fn(),
		);

		const setValueCalls = (joplin.settings.setValue as jest.Mock).mock.calls;
		const changeLogCall = setValueCalls.find((call) => call[0] === 'categorization.changeLog');
		expect(changeLogCall).toBeDefined();

		const changeLog = JSON.parse(changeLogCall[1]);
		expect(changeLog.notes[0].originalParentTitle).toBe('Orig Folder');
		expect(changeLog.notes[0].originalParentGrandparentId).toBe('grandparent-id');
	});

	it('undoCategorizationChanges passes recreatedFolderMap to restoreNotebook', async () => {
		const mockLog = {
			timestamp: Date.now(),
			method: 'notebooks',
			notes: [
				{
					noteId: 'note-1',
					originalParentId: 'orig-folder-id',
					originalParentTitle: 'Orig Folder',
					originalParentGrandparentId: 'grandparent-id',
				},
			],
		};
		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify(mockLog));

		await undoCategorizationChanges(jest.fn());

		expect(restoreNotebook).toHaveBeenCalledWith(
			'note-1',
			'orig-folder-id',
			'Orig Folder',
			'grandparent-id',
			expect.any(Map),
			false,
		);
	});

	it('undoCategorizationChanges restores trashed folders before moving notes', async () => {
		const mockLog = {
			timestamp: Date.now(),
			method: 'notebooks',
			notes: [
				{
					noteId: 'note-1',
					originalParentId: 'trashed-folder-id',
					originalParentTitle: 'Test Bench',
					originalParentGrandparentId: '',
				},
			],
		};
		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify(mockLog));
		(joplin.data.get as jest.Mock).mockResolvedValue({ id: 'trashed-folder-id', deleted_time: 1722870000000 });

		await undoCategorizationChanges(jest.fn());

		// Should restore the folder from trash
		expect(joplin.data.put).toHaveBeenCalledWith(['folders', 'trashed-folder-id'], null, { deleted_time: 0 });

		// Should then restore the note to that folder (folderMissing = false)
		expect(restoreNotebook).toHaveBeenCalledWith(
			'note-1',
			'trashed-folder-id',
			'Test Bench',
			'',
			expect.any(Map),
			false,
		);
	});

	it('undoCategorizationChanges cleanly removes tags without touching folders for tags-only history', async () => {
		const mockLog = {
			timestamp: Date.now(),
			method: 'tags',
			notes: [
				{
					noteId: 'note-1',
					addedTagIds: ['created-tag-1', 'created-tag-2'],
				},
			],
			createdFolderIds: [],
			createdTagIds: ['created-tag-1', 'created-tag-2'],
		};
		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify(mockLog));

		await undoCategorizationChanges(jest.fn());

		expect(removeTagsFromNote).toHaveBeenCalledWith('note-1', ['created-tag-1', 'created-tag-2']);
		expect(deleteCreatedTags).toHaveBeenCalledWith(['created-tag-1', 'created-tag-2']);
		expect(restoreNotebook).not.toHaveBeenCalled();
		expect(deleteCreatedFolders).not.toHaveBeenCalled();
	});
});
