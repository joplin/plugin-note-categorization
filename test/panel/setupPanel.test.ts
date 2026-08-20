/* eslint-disable @typescript-eslint/no-explicit-any */
import joplin from 'api';
import { setupPanel } from '../../src/panel/setupPanel';
import { OperationState } from '../../src/settings/registerSettings';
import { WebviewMessage } from '../../src/types/panel';
import { NotebookFilterConfig, DEFAULT_NOTEBOOK_FILTER } from '../../src/types/notebook';

jest.mock('api', () => ({
	__esModule: true,
	default: {
		plugins: {
			installationDir: jest.fn().mockResolvedValue('/mock/install/dir'),
		},
		views: {
			panels: {
				create: jest.fn().mockResolvedValue('aiCategorise.panel'),
				setHtml: jest.fn().mockResolvedValue(undefined),
				addScript: jest.fn().mockResolvedValue(undefined),
				show: jest.fn().mockResolvedValue(undefined),
				onMessage: jest.fn(),
			},
		},
		data: {
			get: jest.fn(),
		},
		commands: {
			execute: jest.fn().mockResolvedValue(undefined),
		},
		settings: {
			value: jest.fn(),
			setValue: jest.fn(),
		},
	},
}));

jest.mock('../../src/pipeline/runPipeline', () => ({
	runPipeline: jest.fn(),
}));

jest.mock('../../src/commands/applyChanges', () => ({
	applyCategorizationChanges: jest.fn(),
	undoCategorizationChanges: jest.fn(),
}));

describe('setupPanel & getInitialState persistence', () => {
	let messageHandler: (msg: WebviewMessage) => Promise<any>;
	let operationState: OperationState;

	beforeEach(async () => {
		jest.clearAllMocks();
		operationState = { inProgress: false };

		(joplin.views.panels.onMessage as jest.Mock).mockImplementation((_panel, handler) => {
			messageHandler = handler;
		});

		await setupPanel(operationState);
	});

	it('returns idle state initially on getInitialState', async () => {
		const state = await messageHandler({ type: 'getInitialState' });
		expect(state).toEqual({ type: 'idle' });
	});

	it('preserves results when syncState is called', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k3',
					algorithm: 'kmeans',
					clusterCount: 3,
					assignments: [0, 1, 2],
					clusterSizes: [1, 1, 1],
					silhouetteScore: 0.8,
					outlierCount: 0,
					timeMs: 10,
					clusterNames: { 0: 'A', 1: 'B', 2: 'C' },
				},
			],
			notes: [
				{ noteId: '1', title: 'Note 1' },
				{ noteId: '2', title: 'Note 2' },
				{ noteId: '3', title: 'Note 3' },
			],
			selectedStrategyIndex: 0,
		});

		const state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.strategies).toHaveLength(1);
		expect(state.notes).toHaveLength(3);
		expect(state.panelState).toBeUndefined();
	});

	it('preserves apply_progress and results on getInitialState', async () => {
		// Sync results
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k3',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.8,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		// Trigger apply via setPanelState / apply message
		operationState.setPanelState!({ type: 'apply_progress', current: 1, total: 5 });

		const state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.strategies).toHaveLength(1);
		expect(state.panelState).toEqual({ type: 'apply_progress', current: 1, total: 5 });
	});

	it('preserves apply_complete and results on getInitialState', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		operationState.setPanelState!({ type: 'apply_complete' });

		const state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toEqual({ type: 'apply_complete' });
	});

	it('preserves undo_progress and undo_complete on getInitialState', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		// Native undo in progress
		operationState.setPanelState!({ type: 'undo_progress', current: 2, total: 4 });
		let state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toEqual({ type: 'undo_progress', current: 2, total: 4 });

		// Native undo complete
		operationState.setPanelState!({ type: 'undo_complete' });
		state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toEqual({ type: 'undo_complete' });
	});

	it('returns undo_complete directly if no prior results exist', async () => {
		operationState.setPanelState!({ type: 'undo_complete' });
		const state = await messageHandler({ type: 'getInitialState' });
		expect(state).toEqual({ type: 'undo_complete' });
	});

	it('preserves apply_error and undo_error on getInitialState', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		operationState.setPanelState!({ type: 'apply_error', message: 'Move failed' });
		let state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toEqual({ type: 'apply_error', message: 'Move failed' });

		operationState.setPanelState!({ type: 'undo_error', message: 'Revert failed' });
		state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toEqual({ type: 'undo_error', message: 'Revert failed' });
	});

	it('resets terminal apply_complete state on syncState when mutations occur', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		operationState.setPanelState!({ type: 'apply_complete' });
		let state = await messageHandler({ type: 'getInitialState' });
		expect(state.panelState).toEqual({ type: 'apply_complete' });

		// User edits a cluster or moves a note -> syncState fires
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
					clusterNames: { 0: 'Renamed Cluster' },
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		// panelState should no longer bundle apply_complete
		state = await messageHandler({ type: 'getInitialState' });
		expect(state.type).toBe('results');
		expect(state.panelState).toBeUndefined();
	});

	it('returns pipeline status/progress early on getInitialState during re-run', async () => {
		await messageHandler({
			type: 'syncState',
			strategies: [
				{
					strategyName: 'kmeans_k2',
					algorithm: 'kmeans',
					clusterCount: 1,
					assignments: [0],
					clusterSizes: [1],
					silhouetteScore: 0.7,
					outlierCount: 0,
					timeMs: 10,
				},
			],
			notes: [{ noteId: '1', title: 'Note 1' }],
			selectedStrategyIndex: 0,
		});

		operationState.setPanelState!({ type: 'apply_complete' });

		// User clicks Run
		const runResult = await messageHandler({ type: 'run' });
		expect(runResult.type).toBe('status');

		// Webview remounts while status is active
		let state = await messageHandler({ type: 'getInitialState' });
		expect(state).toEqual({ type: 'status', text: 'Starting pipeline...' });

		// Pipeline advances to progress
		operationState.setPanelState!({
			type: 'progress',
			current: 5,
			total: 10,
			cached: 2,
			skipped: 0,
			isNativeAiUsed: true,
		});
		state = await messageHandler({ type: 'getInitialState' });
		expect(state).toEqual({
			type: 'progress',
			current: 5,
			total: 10,
			cached: 2,
			skipped: 0,
			isNativeAiUsed: true,
		});
	});

	it('returns categorization.applyMethod in getSettings handler', async () => {
		(joplin.settings.value as jest.Mock).mockImplementation((key: string) => {
			if (key === 'categorization.parentNotebook') return Promise.resolve('My Parent');
			if (key === 'categorization.changeLog') return Promise.resolve('{}');
			if (key === 'categorization.applyMethod') return Promise.resolve('tags');
			return Promise.resolve('');
		});

		const settings = await messageHandler({ type: 'getSettings' });
		expect(settings).toEqual({
			'categorization.parentNotebook': 'My Parent',
			'categorization.changeLog': '{}',
			'categorization.applyMethod': 'tags',
		});
	});

	it('passes options.method when handling apply message', async () => {
		const { applyCategorizationChanges } = jest.requireMock('../../src/commands/applyChanges');
		(applyCategorizationChanges as jest.Mock).mockResolvedValue(undefined);

		await messageHandler({
			type: 'apply',
			options: { method: 'tags', parentNotebookName: '' },
			notes: [{ noteId: 'note-1', title: 'Note 1' }],
			assignments: [0],
			clusterNames: { 0: 'Cluster 1' },
			clusterTags: { 0: ['tag-1'] },
		});

		expect(applyCategorizationChanges).toHaveBeenCalledWith(
			{ method: 'tags', parentNotebookName: '' },
			[{ noteId: 'note-1', title: 'Note 1' }],
			[0],
			{ 0: 'Cluster 1' },
			{ 0: ['tag-1'] },
			expect.any(Function),
		);
	});

	it('handles getFilterConfig and saveFilterConfig', async () => {
		const mockFilter: NotebookFilterConfig = {
			mode: 'include',
			selectedFolderIds: ['folder-1'],
			includeSubNotebooks: true,
		};
		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify(mockFilter));

		const res = await messageHandler({ type: 'getFilterConfig' });
		expect(res.filterConfig).toEqual(mockFilter);

		const updatedFilter: NotebookFilterConfig = {
			mode: 'exclude',
			selectedFolderIds: ['folder-2'],
			includeSubNotebooks: false,
		};
		await messageHandler({
			type: 'saveFilterConfig',
			filterConfig: updatedFilter,
		});

		expect(joplin.settings.setValue).toHaveBeenCalledWith(
			'categorization.notebookFilter',
			JSON.stringify(updatedFilter),
		);
	});

	it('handles getFilterConfig when setting has invalid/corrupted JSON', async () => {
		// Corrupted string
		(joplin.settings.value as jest.Mock).mockResolvedValue('not-valid-json{');
		let res = await messageHandler({ type: 'getFilterConfig' });
		expect(res.filterConfig).toEqual(DEFAULT_NOTEBOOK_FILTER);

		// Invalid schema shape
		(joplin.settings.value as jest.Mock).mockResolvedValue(
			JSON.stringify({ mode: 'invalid_mode', selectedFolderIds: 123 }),
		);
		res = await messageHandler({ type: 'getFilterConfig' });
		expect(res.filterConfig).toEqual(DEFAULT_NOTEBOOK_FILTER);
	});

	it('passes filterConfig to runPipeline when run message is received', async () => {
		const { runPipeline } = jest.requireMock('../../src/pipeline/runPipeline');
		const mockFilter: NotebookFilterConfig = {
			mode: 'include',
			selectedFolderIds: ['folder-123'],
			includeSubNotebooks: true,
		};

		await messageHandler({
			type: 'run',
			filterConfig: mockFilter,
		});

		expect(runPipeline).toHaveBeenCalledWith('/mock/install/dir', expect.any(Object), mockFilter);
	});

	it('getNotebooks handler returns folders, folderTree, and counts', async () => {
		const mockFolders = [
			{ id: 'f1', title: 'Work', parent_id: '' },
			{ id: 'f2', title: 'Personal', parent_id: '' },
			{ id: 'f3', title: 'Sub-Work', parent_id: 'f1' },
		];

		(joplin.data.get as jest.Mock).mockImplementation((path: string[]) => {
			if (path[0] === 'folders') {
				return Promise.resolve({ items: mockFolders, has_more: false });
			}
			if (path[0] === 'notes') {
				return Promise.resolve({
					items: [{ parent_id: 'f1' }, { parent_id: 'f1' }, { parent_id: 'f2' }],
					has_more: false,
				});
			}
			return Promise.resolve({ items: [], has_more: false });
		});

		const result = await messageHandler({ type: 'getNotebooks' });
		expect(result.folders).toHaveLength(3);
		expect(result.folderTree).toHaveLength(2); // 2 root folders
		expect(result.counts['f1']).toBe(2);
		expect(result.counts['f2']).toBe(1);
		expect(result.counts['f3']).toBeUndefined();
	});

	it('run handler falls back to saved notebookFilter setting when msg.filterConfig is undefined', async () => {
		const { runPipeline } = jest.requireMock('../../src/pipeline/runPipeline');
		const savedFilter: NotebookFilterConfig = {
			mode: 'exclude',
			selectedFolderIds: ['folder-abc'],
			includeSubNotebooks: false,
		};

		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify(savedFilter));

		await messageHandler({ type: 'run' });

		expect(runPipeline).toHaveBeenCalledWith('/mock/install/dir', expect.any(Object), savedFilter);
	});

	it('run handler falls back to DEFAULT_NOTEBOOK_FILTER when saved setting is corrupt/invalid', async () => {
		const { runPipeline } = jest.requireMock('../../src/pipeline/runPipeline');

		(joplin.settings.value as jest.Mock).mockResolvedValue('invalid-json{{{');
		await messageHandler({ type: 'run' });
		expect(runPipeline).toHaveBeenCalledWith('/mock/install/dir', expect.any(Object), DEFAULT_NOTEBOOK_FILTER);

		(joplin.settings.value as jest.Mock).mockResolvedValue(JSON.stringify({ mode: 'invalid_mode' }));
		await messageHandler({ type: 'run' });
		expect(runPipeline).toHaveBeenCalledWith('/mock/install/dir', expect.any(Object), DEFAULT_NOTEBOOK_FILTER);
	});
});
