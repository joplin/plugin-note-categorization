import joplin from 'api';
import { applyCategorizationChanges, undoCategorizationChanges } from '../../src/commands/applyChanges';
import {
	fetchAllFolders,
	initializeClusterNotebooks,
	moveNoteToFolder,
	restoreNotebook,
	cleanUpFolders,
} from '../../src/commands/applyNotebooks';

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

	it('applyCategorizationChanges runs auto-cleanup after note moves', async () => {
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
	});

	it('applyCategorizationChanges skips cleanup for tags-only method', async () => {
		(fetchAllFolders as jest.Mock).mockResolvedValue({
			byKey: new Map(),
			byId: new Map(),
		});
		(joplin.data.get as jest.Mock).mockResolvedValue({ parent_id: 'orig-folder-id', title: 'Note 1', body: '' });

		await applyCategorizationChanges(
			{ method: 'tags', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{},
			jest.fn(),
		);

		expect(cleanUpFolders).not.toHaveBeenCalled();
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
});
