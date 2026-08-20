import joplin from 'api';
import { runPipeline } from '../pipeline/runPipeline';
import { fetchAllFoldersList, buildFolderTree } from '../pipeline/noteReader';
import { PanelMessage, WebviewMessage, PanelNote } from '../types/panel';
import { BenchmarkResult } from '../types/cluster';
import { DEFAULT_NOTEBOOK_FILTER, NotebookFilterConfig, isValidFilterConfig } from '../types/notebook';
import { log } from '../utils/logger';
import { applyCategorizationChanges, undoCategorizationChanges } from '../commands/applyChanges';
import { OperationState } from '../settings/registerSettings';

export async function setupPanel(operationState: OperationState): Promise<string> {
	const installDir = await joplin.plugins.installationDir();

	const panel = await joplin.views.panels.create('aiCategorise.panel');
	await joplin.views.panels.setHtml(panel, '<div id="root"></div>');
	await joplin.views.panels.addScript(panel, './webview/panel.css');
	await joplin.views.panels.addScript(panel, './webview/panel.js');
	await joplin.views.panels.show(panel, false);

	let panelState: PanelMessage | { type: 'idle' } = { type: 'idle' };
	operationState.setPanelState = (state: PanelMessage) => {
		panelState = state;
	};

	let lastResultsState: {
		strategies: BenchmarkResult[];
		notes: PanelNote[];
		selectedStrategyIndex: number;
		isNativeAiUsed?: boolean;
		isAiNamingUsed?: boolean;
	} | null = null;

	await joplin.views.panels.onMessage(panel, async (msg: WebviewMessage) => {
		switch (msg.type) {
			case 'run': {
				panelState = { type: 'status', text: 'Starting pipeline...' };
				log('Panel: starting pipeline');

				let activeFilter = msg.filterConfig;
				if (!activeFilter) {
					try {
						const raw = await joplin.settings.value('categorization.notebookFilter');
						if (raw) {
							const parsed = JSON.parse(raw);
							activeFilter = isValidFilterConfig(parsed) ? parsed : DEFAULT_NOTEBOOK_FILTER;
						}
					} catch {
						activeFilter = DEFAULT_NOTEBOOK_FILTER;
					}
				}

				runPipeline(
					installDir,
					{
						onStatus: (text, isNativeAiUsed) => {
							panelState = { type: 'status', text, isNativeAiUsed };
						},
						onProgress: (current, total, cached, skipped, isNativeAiUsed) => {
							panelState = { type: 'progress', current, total, cached, skipped, isNativeAiUsed };
						},
						onComplete: (strategies, notes, isNativeAiUsed, isAiNamingUsed) => {
							lastResultsState = {
								strategies,
								notes,
								selectedStrategyIndex: 0,
								isNativeAiUsed,
								isAiNamingUsed,
							};
							panelState = { type: 'results', strategies, notes, isNativeAiUsed, isAiNamingUsed };
						},
						onError: (message) => {
							panelState = { type: 'error', message };
						},
					},
					activeFilter,
				);

				return panelState;
			}

			case 'poll':
				return panelState;

			case 'getInitialState':
				if (panelState.type === 'status' || panelState.type === 'progress') {
					return panelState;
				}
				if (lastResultsState) {
					const isApplyOrUndo =
						panelState.type === 'apply_status' ||
						panelState.type === 'apply_progress' ||
						panelState.type === 'apply_complete' ||
						panelState.type === 'apply_error' ||
						panelState.type === 'undo_status' ||
						panelState.type === 'undo_progress' ||
						panelState.type === 'undo_complete' ||
						panelState.type === 'undo_error';

					return {
						type: 'results',
						strategies: lastResultsState.strategies,
						notes: lastResultsState.notes,
						selectedStrategyIndex: lastResultsState.selectedStrategyIndex,
						isNativeAiUsed: lastResultsState.isNativeAiUsed,
						isAiNamingUsed: lastResultsState.isAiNamingUsed,
						panelState: isApplyOrUndo ? panelState : undefined,
					};
				}
				return panelState;

			case 'syncState':
				lastResultsState = {
					strategies: msg.strategies,
					notes: msg.notes,
					selectedStrategyIndex: msg.selectedStrategyIndex,
					isNativeAiUsed: lastResultsState?.isNativeAiUsed,
					isAiNamingUsed: lastResultsState?.isAiNamingUsed,
				};
				if (
					panelState.type === 'apply_complete' ||
					panelState.type === 'undo_complete' ||
					panelState.type === 'apply_error' ||
					panelState.type === 'undo_error'
				) {
					panelState = {
						type: 'results',
						strategies: msg.strategies,
						notes: msg.notes,
						selectedStrategyIndex: msg.selectedStrategyIndex,
						isNativeAiUsed: lastResultsState?.isNativeAiUsed,
						isAiNamingUsed: lastResultsState?.isAiNamingUsed,
					};
				}
				return { success: true };

			case 'openNote':
				if (msg.noteId) {
					await joplin.commands.execute('openNote', msg.noteId);
				}
				return;

			case 'getSettings':
				return {
					'categorization.parentNotebook': await joplin.settings.value('categorization.parentNotebook'),
					'categorization.changeLog': await joplin.settings.value('categorization.changeLog'),
					'categorization.applyMethod': await joplin.settings.value('categorization.applyMethod'),
				};

			case 'updateSetting':
				await joplin.settings.setValue(msg.key, msg.value);
				return { success: true };

			case 'getNotebooks': {
				try {
					const folders = await fetchAllFoldersList();
					const countsMap = new Map<string, number>();
					try {
						let page = 1;
						const MAX_PAGES = 500;
						while (page <= MAX_PAGES) {
							const res = await joplin.data.get(['notes'], { fields: ['parent_id'], page, limit: 100 });
							if (!res || !res.items) break;
							for (const n of res.items) {
								if (n && n.parent_id) {
									countsMap.set(n.parent_id, (countsMap.get(n.parent_id) || 0) + 1);
								}
							}
							if (!res.has_more) break;
							page++;
						}
					} catch (noteCountErr) {
						log('Warning: could not fetch note counts for notebooks: ' + noteCountErr);
					}
					const folderTree = buildFolderTree(folders, countsMap);
					const counts: { [folderId: string]: number } = {};
					countsMap.forEach((v, k) => {
						counts[k] = v;
					});
					return { folders, folderTree, counts };
				} catch (err) {
					log('Error in getNotebooks: ' + err);
					return { folders: [], folderTree: [], counts: {} };
				}
			}

			case 'getFilterConfig': {
				const raw = await joplin.settings.value('categorization.notebookFilter');
				let filterConfig: NotebookFilterConfig = DEFAULT_NOTEBOOK_FILTER;
				if (raw) {
					try {
						const parsed = JSON.parse(raw);
						filterConfig = isValidFilterConfig(parsed) ? parsed : DEFAULT_NOTEBOOK_FILTER;
					} catch {
						filterConfig = DEFAULT_NOTEBOOK_FILTER;
					}
				}
				return { filterConfig };
			}

			case 'saveFilterConfig': {
				await joplin.settings.setValue('categorization.notebookFilter', JSON.stringify(msg.filterConfig));
				return { success: true };
			}

			case 'apply':
				if (operationState.inProgress) {
					return { type: 'apply_error', message: 'Another operation is already in progress.' };
				}
				operationState.inProgress = true;
				panelState = { type: 'apply_status', text: 'Initializing application of categorization...' };
				applyCategorizationChanges(
					msg.options,
					msg.notes,
					msg.assignments,
					msg.clusterNames,
					msg.clusterTags,
					(state) => {
						panelState = state;
					},
				)
					.catch((err) => {
						log('Error in apply background task: ' + err);
						panelState = { type: 'apply_error', message: err.message || String(err) };
					})
					.finally(() => {
						operationState.inProgress = false;
					});
				return panelState;

			case 'undo':
				if (operationState.inProgress) {
					return { type: 'undo_error', message: 'Another operation is already in progress.' };
				}
				operationState.inProgress = true;
				panelState = { type: 'undo_status', text: 'Initializing undo...' };
				undoCategorizationChanges((state) => {
					panelState = state;
				})
					.catch((err) => {
						log('Error in undo background task: ' + err);
						panelState = { type: 'undo_error', message: err.message || String(err) };
					})
					.finally(() => {
						operationState.inProgress = false;
					});
				return panelState;
		}
	});

	log('Panel setup complete');
	return panel;
}
