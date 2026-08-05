import joplin from 'api';
import { log } from './utils/logger';
import { registerPluginSettings, OperationState } from './settings/registerSettings';
import { registerPluginCommands } from './commands/registerCommands';
import { setupPanel } from './panel/setupPanel';

joplin.plugins.register({
	onStart: async function () {
		log('Plugin started');

		// Shared operation lock across webview IPC and native triggers
		const operationState: OperationState = { inProgress: false };

		// 1. Register plugin settings section & items
		await registerPluginSettings(operationState);

		// 2. Setup webview side panel & IPC onMessage loop
		const panelHandle = await setupPanel(operationState);

		// 3. Register Joplin commands, menu items, & toolbar buttons
		await registerPluginCommands(operationState, panelHandle);

		log('Plugin setup complete');
	},
});
