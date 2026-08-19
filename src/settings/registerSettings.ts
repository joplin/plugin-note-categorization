import joplin from 'api';
import { SettingItemType as SettingType } from 'api/types';
import { log } from '../utils/logger';
import { undoCategorizationChanges } from '../commands/applyChanges';

import { PanelMessage } from '../types/panel';

export interface OperationState {
	inProgress: boolean;
	setPanelState?: (state: PanelMessage) => void;
}

const OP_IN_PROGRESS_MSG = 'An operation is already in progress. Please wait for it to complete.';

/**
 * Executes undo operation triggered natively (from Tools menu or Joplin Settings).
 * Updates backend panelState via operationState.setPanelState so that when the webview
 * remounts, getInitialState surfaces the undo status/completion banner.
 * Direct modal user feedback during native options execution is provided via showMessageBox.
 */
export async function runNativeUndo(source: string, operationState: OperationState): Promise<void> {
	if (operationState.inProgress) {
		await joplin.views.dialogs.showMessageBox(OP_IN_PROGRESS_MSG);
		return;
	}
	operationState.inProgress = true;
	operationState.setPanelState?.({ type: 'undo_status', text: 'Initializing undo...' });
	try {
		let lastMessage = '';
		await undoCategorizationChanges((state) => {
			operationState.setPanelState?.(state);
			log(`Native ${source} Undo: ${'text' in state ? state.text : state.type}`);
			if (state.type === 'undo_complete') {
				lastMessage = 'Reverted categorization changes successfully!';
			} else if (state.type === 'undo_error') {
				lastMessage = `Undo Error: ${state.message}`;
			}
		});
		if (lastMessage) {
			await joplin.views.dialogs.showMessageBox(lastMessage);
		}
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		operationState.setPanelState?.({ type: 'undo_error', message: errMsg });
		await joplin.views.dialogs.showMessageBox(`Undo failed: ${errMsg}`);
	} finally {
		operationState.inProgress = false;
	}
}

export async function registerPluginSettings(operationState: OperationState): Promise<void> {
	try {
		await joplin.settings.registerSection('aiCategorization', {
			label: 'AI Categorization',
			iconName: 'fas fa-brain',
		});

		await joplin.settings.registerSettings({
			'categorization.parentNotebook': {
				value: '',
				type: SettingType.String,
				section: 'aiCategorization',
				public: true,
				label: 'Default Target Notebook',
				description:
					'Default parent notebook where newly categorized sub-notebooks will be created (leave empty for root).',
			},
			'categorization.applyMethod': {
				value: 'both',
				type: SettingType.String,
				section: 'aiCategorization',
				public: true,
				isEnum: true,
				options: {
					both: 'Both (Notebooks & Tags)',
					tags: 'Tags only',
					notebooks: 'Notebooks only',
				},
				label: 'Categorization Apply Method',
				description: 'Choose whether categorization moves notes to notebooks, applies tags, or both.',
			},
			'categorization.changeLog': {
				value: '',
				type: SettingType.String,
				section: 'aiCategorization',
				public: false,
				label: 'Change Log',
				description: 'Stores previous states of moved and tagged notes for undo operations.',
			},
			'categorization.changeLogSummary': {
				value: 'No categorization has been applied yet.',
				type: SettingType.String,
				section: 'aiCategorization',
				public: true,
				label: 'Last Categorization Summary',
				description: 'Summary of the last applied categorization.',
			},
			'categorization.notebookFilter': {
				value: '',
				type: SettingType.String,
				section: 'aiCategorization',
				public: false,
				label: 'Notebook Filter Configuration',
				description: 'Internal configuration for included/excluded notebooks in categorization.',
			},
			'categorization.undoAction': {
				value: false,
				type: SettingType.Bool,
				section: 'aiCategorization',
				public: true,
				label: 'Undo Last Categorization',
				description:
					'Check this box and click Apply/OK to revert note movements and tags from the previous run.',
			},
		});

		// Handle native options checkbox triggers
		await joplin.settings.onChange(async (event: { keys: string[] }) => {
			if (event.keys.includes('categorization.undoAction')) {
				const val = await joplin.settings.value('categorization.undoAction');
				if (val) {
					await joplin.settings.setValue('categorization.undoAction', false);
					log('Native Settings: triggering undoCategorizationChanges');
					await runNativeUndo('Settings', operationState);
				}
			}
		});
	} catch (err) {
		log('Error registering settings: ' + err);
	}
}
