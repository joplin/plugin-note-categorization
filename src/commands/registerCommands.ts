import joplin from 'api';
import { MenuItemLocation, ToolbarButtonLocation } from 'api/types';
import { log } from '../utils/logger';
import { runNativeUndo, OperationState } from '../settings/registerSettings';

export async function registerPluginCommands(operationState: OperationState, panelHandle: string): Promise<void> {
	await joplin.commands.register({
		name: 'aiCategorise.undoLastCategorization',
		label: 'AI Categorise: Undo Last Categorization',
		iconName: 'fas fa-undo',
		execute: async () => {
			log('Menu: triggering undoCategorizationChanges');
			await runNativeUndo('Menu', operationState);
		},
	});

	await joplin.commands.register({
		name: 'aiCategorise.togglePanel',
		label: 'AI Categorise: Toggle Panel',
		iconName: 'fas fa-brain',
		execute: async () => {
			const visible = await joplin.views.panels.visible(panelHandle);
			await joplin.views.panels.show(panelHandle, !visible);
		},
	});

	await joplin.views.menuItems.create(
		'aiCategorise.undoMenuItem',
		'aiCategorise.undoLastCategorization',
		MenuItemLocation.Tools,
	);

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

	log('Commands and menu items registered');
}
