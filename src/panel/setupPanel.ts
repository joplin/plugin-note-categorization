import joplin from 'api';
import { runPipeline } from '../pipeline/runPipeline';
import { PanelMessage, WebviewMessage, PanelNote } from '../types/panel';
import { BenchmarkResult } from '../types/cluster';
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
	let lastResultsState: {
		strategies: BenchmarkResult[];
		notes: PanelNote[];
		selectedStrategyIndex: number;
	} | null = null;

	await joplin.views.panels.onMessage(panel, async (msg: WebviewMessage) => {
		switch (msg.type) {
			case 'run':
				panelState = { type: 'status', text: 'Starting pipeline...' };
				log('Panel: starting pipeline');

				runPipeline(installDir, {
					onStatus: (text) => {
						panelState = { type: 'status', text };
					},
					onProgress: (current, total, cached, skipped) => {
						panelState = { type: 'progress', current, total, cached, skipped };
					},
					onComplete: (strategies, notes) => {
						lastResultsState = { strategies, notes, selectedStrategyIndex: 0 };
						panelState = { type: 'results', strategies, notes };
					},
					onError: (message) => {
						panelState = { type: 'error', message };
					},
				});

				return panelState;

			case 'poll':
				return panelState;

			case 'getInitialState':
				if (panelState.type === 'status' || panelState.type === 'progress') {
					return panelState;
				}
				if (lastResultsState) {
					return {
						type: 'results',
						strategies: lastResultsState.strategies,
						notes: lastResultsState.notes,
						selectedStrategyIndex: lastResultsState.selectedStrategyIndex,
					};
				}
				return panelState;

			case 'syncState':
				lastResultsState = {
					strategies: msg.strategies,
					notes: msg.notes,
					selectedStrategyIndex: msg.selectedStrategyIndex,
				};
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
				};

			case 'updateSetting':
				await joplin.settings.setValue(msg.key, msg.value);
				return { success: true };

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
