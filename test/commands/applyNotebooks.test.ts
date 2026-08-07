import joplin from 'api';
import { restoreNotebook } from '../../src/commands/applyNotebooks';

jest.mock('api', () => ({
	__esModule: true,
	default: {
		data: {
			get: jest.fn(),
			put: jest.fn(),
			post: jest.fn(),
		},
	},
}));

describe('restoreNotebook', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('restoreNotebook moves note to originalParentId on success', async () => {
		(joplin.data.put as jest.Mock).mockResolvedValue(undefined);
		await restoreNotebook('note-1', 'folder-1');
		expect(joplin.data.put).toHaveBeenCalledWith(['notes', 'note-1'], null, { parent_id: 'folder-1' });
		expect(joplin.data.post).not.toHaveBeenCalled();
	});

	it('restoreNotebook re-creates folder on failure when title is available', async () => {
		(joplin.data.put as jest.Mock)
			.mockRejectedValueOnce(new Error('Folder deleted'))
			.mockResolvedValueOnce(undefined);
		(joplin.data.post as jest.Mock).mockResolvedValue({ id: 'new-folder-id' });

		const map = new Map<string, string>();
		await restoreNotebook('note-1', 'deleted-folder-id', 'Work Notes', 'grandparent-id', map);

		expect(joplin.data.post).toHaveBeenCalledWith(['folders'], null, {
			title: 'Work Notes',
			parent_id: 'grandparent-id',
		});
		expect(joplin.data.put).toHaveBeenNthCalledWith(2, ['notes', 'note-1'], null, {
			parent_id: 'new-folder-id',
		});
	});

	it('restoreNotebook uses recreatedFolderMap cache', async () => {
		const map = new Map<string, string>();
		const cacheKey = `Work Notes\x1Fgrandparent-id`;
		map.set(cacheKey, 'cached-folder-id');

		(joplin.data.put as jest.Mock)
			.mockRejectedValueOnce(new Error('Folder deleted'))
			.mockResolvedValueOnce(undefined);

		await restoreNotebook('note-1', 'deleted-folder-id', 'Work Notes', 'grandparent-id', map);

		expect(joplin.data.post).not.toHaveBeenCalled();
		expect(joplin.data.put).toHaveBeenNthCalledWith(2, ['notes', 'note-1'], null, {
			parent_id: 'cached-folder-id',
		});
	});

	it('restoreNotebook caches across multiple calls', async () => {
		const map = new Map<string, string>();
		(joplin.data.put as jest.Mock)
			.mockRejectedValueOnce(new Error('Folder deleted'))
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('Folder deleted'))
			.mockResolvedValueOnce(undefined);

		(joplin.data.post as jest.Mock).mockResolvedValue({ id: 'new-folder-id' });

		await restoreNotebook('note-1', 'deleted-folder-id', 'Work Notes', 'grandparent-id', map);
		await restoreNotebook('note-2', 'deleted-folder-id', 'Work Notes', 'grandparent-id', map);

		expect(joplin.data.post).toHaveBeenCalledTimes(1);
		expect(joplin.data.put).toHaveBeenNthCalledWith(2, ['notes', 'note-1'], null, {
			parent_id: 'new-folder-id',
		});
		expect(joplin.data.put).toHaveBeenNthCalledWith(4, ['notes', 'note-2'], null, {
			parent_id: 'new-folder-id',
		});
	});

	it('restoreNotebook logs and returns on failure without title (backward compat)', async () => {
		(joplin.data.put as jest.Mock).mockRejectedValue(new Error('Folder deleted'));

		await expect(restoreNotebook('note-1', 'deleted-folder-id', undefined)).resolves.not.toThrow();
		expect(joplin.data.post).not.toHaveBeenCalled();
	});

	it('restoreNotebook handles root-level folder re-creation', async () => {
		(joplin.data.put as jest.Mock)
			.mockRejectedValueOnce(new Error('Folder deleted'))
			.mockResolvedValueOnce(undefined);
		(joplin.data.post as jest.Mock).mockResolvedValue({ id: 'root-folder-id' });

		const map = new Map<string, string>();
		await restoreNotebook('note-1', 'deleted-folder-id', 'Root Notes', '', map);

		expect(joplin.data.post).toHaveBeenCalledWith(['folders'], null, {
			title: 'Root Notes',
			parent_id: undefined,
		});
	});

	it('restoreNotebook skips put and re-creates folder when folderMissing is true', async () => {
		(joplin.data.put as jest.Mock).mockResolvedValue(undefined);
		(joplin.data.post as jest.Mock).mockResolvedValue({ id: 'recreated-id' });

		const map = new Map<string, string>();
		await restoreNotebook('note-1', 'missing-folder-id', 'My Folder', 'parent-id', map, true);

		expect(joplin.data.post).toHaveBeenCalledWith(['folders'], null, {
			title: 'My Folder',
			parent_id: 'parent-id',
		});
		expect(joplin.data.put).toHaveBeenCalledTimes(1);
		expect(joplin.data.put).toHaveBeenCalledWith(['notes', 'note-1'], null, {
			parent_id: 'recreated-id',
		});
	});
});
