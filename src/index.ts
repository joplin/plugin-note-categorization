import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { runTestEmbed } from './commands/testEmbed';
import { runPipeline } from './pipeline/runPipeline';
import { PanelMessage, WebviewMessage } from './types/panel';
import { log } from './utils/logger';

joplin.plugins.register({
	onStart: async function () {
		log('Plugin started');

		const installDir = await joplin.plugins.installationDir();

		await joplin.commands.register({
			name: 'aiCategorise.testEmbed',
			label: 'AI Categorise: Test Embedding',
			execute: async () => runTestEmbed(installDir),
		});

		await joplin.views.menuItems.create(
			'aiCategorise.testEmbedMenuItem',
			'aiCategorise.testEmbed',
			MenuItemLocation.Tools,
		);

		// Panel starts hidden; user opens via toolbar button or View menu
		const panel = await joplin.views.panels.create('aiCategorise.panel');
		await joplin.views.panels.setHtml(panel, '<div id="root"></div>');
		await joplin.views.panels.addScript(panel, './webview/panel.css');
		await joplin.views.panels.addScript(panel, './webview/panel.js');
		await joplin.views.panels.show(panel, false);

		// Pipeline state shared between the onMessage handler and pipeline callbacks.
		// The webview polls this state via { type: 'poll' } messages.
		let panelState: PanelMessage | { type: 'idle' } = { type: 'idle' };

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

		log('Test command registered under Tools menu');
		log('Panel registered');
	},
});
