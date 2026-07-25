import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation, SettingItemType as SettingType } from 'api/types';
import { runPipeline } from './pipeline/runPipeline';
import { PanelMessage, WebviewMessage } from './types/panel';
import { log } from './utils/logger';
import { applyCategorizationChanges, undoCategorizationChanges, cleanUpEmptyNotebooks } from './commands/applyChanges';

joplin.plugins.register({
	onStart: async function () {
		log('Plugin started');

		// Register setting section
		await joplin.settings.registerSection('aiCategorization', {
			label: 'AI Categorization',
			iconName: 'fas fa-brain',
		});

		// Register setting items
		await joplin.settings.registerSettings({
			'categorization.changeLog': {
				value: '',
				type: SettingType.String,
				section: 'aiCategorization',
				public: false,
				label: 'Change Log',
				description: 'Stores previous states of moved and tagged notes for undo operations.',
			},
		});

		const installDir = await joplin.plugins.installationDir();

		// Panel starts hidden; user opens via toolbar button or View menu
		const panel = await joplin.views.panels.create('aiCategorise.panel');
		await joplin.views.panels.setHtml(panel, '<div id="root"></div>');
		await joplin.views.panels.addScript(panel, './webview/panel.css');
		await joplin.views.panels.addScript(panel, './webview/panel.js');
		await joplin.views.panels.show(panel, false);

		// Pipeline state shared between the onMessage handler and pipeline callbacks.
		// The webview polls this state via { type: 'poll' } messages.
		let panelState: PanelMessage | { type: 'idle' } = { type: 'idle' };
		let operationInProgress = false;

		await joplin.views.panels.onMessage(panel, async (msg: WebviewMessage) => {
			switch (msg.type) {
				case 'run':
					panelState = { type: 'status', text: 'Starting pipeline...' };
					log('Panel: starting pipeline');

					// Fire-and-forget — pipeline updates panelState via callbacks
					runPipeline(installDir, {
						onStatus: (text) => {
							panelState = { type: 'status', text };
						},
						onProgress: (current, total, cached, skipped) => {
							panelState = { type: 'progress', current, total, cached, skipped };
						},
						onComplete: (strategies, notes) => {
							panelState = { type: 'results', strategies, notes };
						},
						onError: (message) => {
							panelState = { type: 'error', message };
						},
					});

					return panelState;

				case 'poll':
					return panelState;

				case 'openNote':
					if (msg.noteId) {
						await joplin.commands.execute('openNote', msg.noteId);
					}
					return;

				case 'getSettings':
					return {
						'categorization.metric': 'cosine',
						'categorization.parentNotebook': '',
						'categorization.changeLog': await joplin.settings.value('categorization.changeLog'),
					};

				case 'updateSetting':
					await joplin.settings.setValue(msg.key, msg.value);
					return { success: true };

				case 'apply':
					if (operationInProgress) {
						return { type: 'apply_error', message: 'Another operation is already in progress.' };
					}
					operationInProgress = true;
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
							operationInProgress = false;
						});
					return panelState;

				case 'undo':
					if (operationInProgress) {
						return { type: 'undo_error', message: 'Another operation is already in progress.' };
					}
					operationInProgress = true;
					panelState = { type: 'undo_status', text: 'Initializing undo...' };
					undoCategorizationChanges((state) => {
						panelState = state;
					})
						.catch((err) => {
							log('Error in undo background task: ' + err);
							panelState = { type: 'undo_error', message: err.message || String(err) };
						})
						.finally(() => {
							operationInProgress = false;
						});
					return panelState;

				case 'cleanUpEmptyNotebooks':
					if (operationInProgress) {
						return { type: 'cleanup_error', message: 'Another operation is already in progress.' };
					}
					operationInProgress = true;
					panelState = { type: 'cleanup_status', text: 'Checking empty notebooks...' };
					cleanUpEmptyNotebooks((state) => {
						panelState = state;
					})
						.catch((err) => {
							log('Error in cleanup background task: ' + err);
							panelState = { type: 'cleanup_error', message: err.message || String(err) };
						})
						.finally(() => {
							operationInProgress = false;
						});
					return panelState;
			}
		});

		await joplin.commands.register({
			name: 'aiCategorise.togglePanel',
			label: 'AI Categorise: Toggle Panel',
			iconName: 'fas fa-brain',
			execute: async () => {
				const visible = await joplin.views.panels.visible(panel);
				await joplin.views.panels.show(panel, !visible);
			},
		});

		await joplin.views.menuItems.create(
			'aiCategorise.togglePanelMenuItem',
			'aiCategorise.togglePanel',
			MenuItemLocation.View,
		);

		await joplin.views.toolbarButtons.create(
			'aiCategorise.togglePanelToolbar',
			'aiCategorise.togglePanel',
			ToolbarButtonLocation.NoteToolbar,
		);

		log('Panel registered');
	},
});
