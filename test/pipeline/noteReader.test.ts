import joplin from 'api';
import {
	buildFolderChildrenMap,
	getDescendantFolderIds,
	resolveEffectiveFolderIds,
	buildFolderTree,
	fetchAllNotes,
	fetchAllJoplinNoteIds,
} from '../../src/pipeline/noteReader';
import { FolderItem, NotebookFilterConfig } from '../../src/types/notebook';

jest.mock('api', () => ({
	__esModule: true,
	default: {
		data: {
			get: jest.fn(),
		},
	},
}));

describe('noteReader pipeline and filtering helpers', () => {
	const mockFolders: FolderItem[] = [
		{ id: 'f-root-1', title: 'Work', parent_id: '' },
		{ id: 'f-child-1', title: 'Project A', parent_id: 'f-root-1' },
		{ id: 'f-subchild-1', title: 'Specs', parent_id: 'f-child-1' },
		{ id: 'f-child-2', title: 'Project B', parent_id: 'f-root-1' },
		{ id: 'f-root-2', title: 'Personal', parent_id: '' },
		{ id: 'f-child-3', title: 'Finance', parent_id: 'f-root-2' },
	];

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('buildFolderChildrenMap and getDescendantFolderIds', () => {
		it('builds a map of parent folder ID to children IDs correctly', () => {
			const map = buildFolderChildrenMap(mockFolders);
			expect(map.get('')).toEqual(['f-root-1', 'f-root-2']);
			expect(map.get('f-root-1')).toEqual(['f-child-1', 'f-child-2']);
			expect(map.get('f-child-1')).toEqual(['f-subchild-1']);
			expect(map.get('f-root-2')).toEqual(['f-child-3']);
		});

		it('collects all descendants recursively', () => {
			const map = buildFolderChildrenMap(mockFolders);
			const descendants = getDescendantFolderIds(['f-root-1'], map);
			expect(descendants).toEqual(new Set(['f-root-1', 'f-child-1', 'f-subchild-1', 'f-child-2']));
		});
	});

	describe('resolveEffectiveFolderIds', () => {
		it('returns all folder IDs when mode is "all" or filterConfig is undefined', () => {
			const allIds = new Set(mockFolders.map((f) => f.id));
			expect(resolveEffectiveFolderIds(mockFolders, undefined)).toEqual(allIds);
			expect(
				resolveEffectiveFolderIds(mockFolders, {
					mode: 'all',
					selectedFolderIds: [],
					includeSubNotebooks: true,
				}),
			).toEqual(allIds);
		});

		it('includes only selected folders when includeSubNotebooks is false in include mode', () => {
			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: ['f-root-1'],
				includeSubNotebooks: false,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			expect(result).toEqual(new Set(['f-root-1']));
		});

		it('includes selected folders and all sub-folders recursively when includeSubNotebooks is true', () => {
			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: ['f-root-1'],
				includeSubNotebooks: true,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			expect(result).toEqual(new Set(['f-root-1', 'f-child-1', 'f-subchild-1', 'f-child-2']));
		});

		it('returns empty set if include mode has empty selection', () => {
			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: [],
				includeSubNotebooks: true,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			expect(result).toEqual(new Set());
		});

		it('excludes selected folders and their sub-folders when in exclude mode', () => {
			const filter: NotebookFilterConfig = {
				mode: 'exclude',
				selectedFolderIds: ['f-root-1'],
				includeSubNotebooks: true,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			expect(result).toEqual(new Set(['f-root-2', 'f-child-3']));
		});

		it('excludes only direct selected folder when includeSubNotebooks is false in exclude mode', () => {
			const filter: NotebookFilterConfig = {
				mode: 'exclude',
				selectedFolderIds: ['f-root-1'],
				includeSubNotebooks: false,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			expect(result).toEqual(new Set(['f-child-1', 'f-subchild-1', 'f-child-2', 'f-root-2', 'f-child-3']));
		});
	});

	describe('buildFolderTree', () => {
		it('builds a nested tree structure with note counts', () => {
			const counts = new Map<string, number>([
				['f-root-1', 5],
				['f-child-1', 10],
				['f-subchild-1', 2],
				['f-root-2', 8],
			]);
			const tree = buildFolderTree(mockFolders, counts);

			expect(tree).toHaveLength(2);
			expect(tree[0].id).toBe('f-root-1');
			expect(tree[0].noteCount).toBe(5);
			expect(tree[0].children).toHaveLength(2);
			expect(tree[0].children![0].id).toBe('f-child-1');
			expect(tree[0].children![0].noteCount).toBe(10);
			expect(tree[0].children![0].children![0].id).toBe('f-subchild-1');
			expect(tree[0].children![0].children![0].noteCount).toBe(2);

			expect(tree[1].id).toBe('f-root-2');
			expect(tree[1].noteCount).toBe(8);
			expect(tree[1].children![0].id).toBe('f-child-3');
			expect(tree[1].children![0].noteCount).toBe(0);
		});
	});

	describe('fetchAllNotes API integration', () => {
		it('fetches and filters notes based on effective folder IDs', async () => {
			(joplin.data.get as jest.Mock).mockImplementation((path: string[]) => {
				if (path[0] === 'folders') {
					return Promise.resolve({
						items: mockFolders,
						has_more: false,
					});
				}
				if (path[0] === 'notes') {
					return Promise.resolve({
						items: [
							{
								id: 'n1',
								title: 'Work note',
								body: 'b1',
								updated_time: 1,
								user_updated_time: 1,
								parent_id: 'f-child-1',
							},
							{
								id: 'n2',
								title: 'Personal note',
								body: 'b2',
								updated_time: 1,
								user_updated_time: 1,
								parent_id: 'f-child-3',
							},
							{
								id: 'n3',
								title: 'Orphan note',
								body: 'b3',
								updated_time: 1,
								user_updated_time: 1,
								parent_id: 'non-existent-folder',
							},
						],
						has_more: false,
					});
				}
				return Promise.resolve({ items: [], has_more: false });
			});

			// Filter to include only Personal
			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: ['f-root-2'],
				includeSubNotebooks: true,
			};

			const notes = await fetchAllNotes(filter);
			expect(notes).toHaveLength(1);
			expect(notes[0].id).toBe('n2');
		});

		it('returns empty array when filter matches 0 folders', async () => {
			(joplin.data.get as jest.Mock).mockImplementation((path: string[]) => {
				if (path[0] === 'folders') {
					return Promise.resolve({
						items: mockFolders,
						has_more: false,
					});
				}
				return Promise.resolve({ items: [], has_more: false });
			});

			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: [],
				includeSubNotebooks: true,
			};

			const notes = await fetchAllNotes(filter);
			expect(notes).toEqual([]);
		});
	});

	describe('fetchAllJoplinNoteIds', () => {
		it('fetches all note IDs across multiple pages', async () => {
			(joplin.data.get as jest.Mock).mockImplementation((_path: string[], opts: { page: number }) => {
				if (opts.page === 1) {
					return Promise.resolve({
						items: [{ id: 'n1' }, { id: 'n2' }],
						has_more: true,
					});
				}
				return Promise.resolve({
					items: [{ id: 'n3' }],
					has_more: false,
				});
			});

			const ids = await fetchAllJoplinNoteIds();
			expect(ids).toEqual(new Set(['n1', 'n2', 'n3']));
			expect(ids.size).toBe(3);
		});

		it('returns empty set when Joplin has no notes', async () => {
			(joplin.data.get as jest.Mock).mockResolvedValue({
				items: [],
				has_more: false,
			});

			const ids = await fetchAllJoplinNoteIds();
			expect(ids.size).toBe(0);
		});
	});

	describe('fetchAllNotes edge cases', () => {
		it('returns all active notes when filterConfig is undefined', async () => {
			(joplin.data.get as jest.Mock).mockImplementation((path: string[]) => {
				if (path[0] === 'folders') {
					return Promise.resolve({
						items: mockFolders,
						has_more: false,
					});
				}
				if (path[0] === 'notes') {
					return Promise.resolve({
						items: [
							{
								id: 'n1',
								title: 'Work note',
								body: 'b1',
								updated_time: 1,
								user_updated_time: 1,
								parent_id: 'f-child-1',
							},
							{
								id: 'n2',
								title: 'Personal note',
								body: 'b2',
								updated_time: 1,
								user_updated_time: 1,
								parent_id: 'f-child-3',
							},
						],
						has_more: false,
					});
				}
				return Promise.resolve({ items: [], has_more: false });
			});

			const notes = await fetchAllNotes(undefined);
			expect(notes).toHaveLength(2);
		});

		it('silently ignores stale folder IDs in selectedFolderIds', () => {
			const filter: NotebookFilterConfig = {
				mode: 'include',
				selectedFolderIds: ['f-root-1', 'non-existent-folder-id'],
				includeSubNotebooks: false,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			// Only the valid folder should be included
			expect(result).toEqual(new Set(['f-root-1']));
			expect(result.has('non-existent-folder-id')).toBe(false);
		});

		it('returns all folders when exclude mode has only stale IDs', () => {
			const filter: NotebookFilterConfig = {
				mode: 'exclude',
				selectedFolderIds: ['non-existent-1', 'non-existent-2'],
				includeSubNotebooks: true,
			};
			const result = resolveEffectiveFolderIds(mockFolders, filter);
			// All stale IDs are filtered out, selectedSet becomes empty, so all folders returned
			expect(result).toEqual(new Set(mockFolders.map((f) => f.id)));
		});
	});
});
