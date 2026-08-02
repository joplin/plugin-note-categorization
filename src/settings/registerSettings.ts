import joplin from 'api';
import { SettingItemType as SettingType } from 'api/types';
import { log } from '../utils/logger';
import { undoCategorizationChanges, cleanUpEmptyNotebooks } from '../commands/applyChanges';

export interface OperationState {
	inProgress: boolean;
}

const OP_IN_PROGRESS_MSG = 'An operation is already in progress. Please wait for it to complete.';

export async function runNativeUndo(source: string, operationState: OperationState): Promise<void> {
	if (operationState.inProgress) {
		await joplin.views.dialogs.showMessageBox(OP_IN_PROGRESS_MSG);
		return;
	}
	operationState.inProgress = true;
	try {
		let lastMessage = '';
		await undoCategorizationChanges((state) => {
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
		await joplin.views.dialogs.showMessageBox(`Undo failed: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		operationState.inProgress = false;
	}
}

export async function runNativeCleanup(source: string, operationState: OperationState): Promise<void> {
	if (operationState.inProgress) {
		await joplin.views.dialogs.showMessageBox(OP_IN_PROGRESS_MSG);
		return;
	}
	operationState.inProgress = true;
	try {
		let lastMessage = '';
		await cleanUpEmptyNotebooks((state) => {
			log(`Native ${source} Cleanup: ${'text' in state ? state.text : state.type}`);
			if (state.type === 'cleanup_complete') {
				lastMessage = state.message;
			} else if (state.type === 'cleanup_error') {
				lastMessage = `Cleanup Error: ${state.message}`;
			}
		});
		if (lastMessage) {
			await joplin.views.dialogs.showMessageBox(lastMessage);
		}
	} catch (err) {
		await joplin.views.dialogs.showMessageBox(`Cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
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
				description: 'Default parent notebook where newly categorized sub-notebooks will be created (leave empty for root).',
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
			'categorization.undoAction': {
				value: false,
				type: SettingType.Bool,
				section: 'aiCategorization',
				public: true,
				label: 'Undo Last Categorization',
				description: 'Check this box and click Apply/OK to revert note movements and tags from the previous run.',
			},
			'categorization.cleanUpAction': {
				value: false,
				type: SettingType.Bool,
				section: 'aiCategorization',
				public: true,
				label: 'Clean Up Empty Notebooks',
				description: 'Check this box and click Apply/OK to check for and remove empty notebooks leftover after note moves.',
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
			if (event.keys.includes('categorization.cleanUpAction')) {
				const val = await joplin.settings.value('categorization.cleanUpAction');
				if (val) {
					await joplin.settings.setValue('categorization.cleanUpAction', false);
					log('Native Settings: triggering cleanUpEmptyNotebooks');
					await runNativeCleanup('Settings', operationState);
				}
			}
		});
	} catch (err) {
		log('Error registering settings: ' + err);
	}
}
