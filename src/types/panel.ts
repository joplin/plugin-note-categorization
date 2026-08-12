import { BenchmarkResult } from './cluster';

export type { BenchmarkResult };

export interface PanelNote {
	noteId: string;
	title: string;
}

export interface ProgressState {
	current: number;
	total: number;
	cached: number;
	skipped: number;
}

export interface ApplyOptions {
	method: 'tags' | 'notebooks' | 'both';
	parentNotebookName: string;
}

export interface ApplyMessage {
	type: 'apply';
	options: ApplyOptions;
	notes: PanelNote[];
	assignments: number[];
	clusterNames: { [clusterId: number]: string };
	clusterTags: { [clusterId: number]: string[] };
}

// Plugin → Webview
export type PanelMessage =
	| { type: 'status'; text: string; isNativeAiUsed?: boolean }
	| { type: 'progress'; current: number; total: number; cached: number; skipped: number; isNativeAiUsed?: boolean }
	| {
			type: 'results';
			strategies: BenchmarkResult[];
			notes: PanelNote[];
			selectedStrategyIndex?: number;
			isNativeAiUsed?: boolean;
			isAiNamingUsed?: boolean;
			/* eslint-disable-next-line no-mixed-spaces-and-tabs */
	  }
	| { type: 'error'; message: string }
	| { type: 'apply_status'; text: string }
	| { type: 'apply_progress'; current: number; total: number }
	| { type: 'apply_complete' }
	| { type: 'apply_error'; message: string }
	| { type: 'undo_status'; text: string }
	| { type: 'undo_progress'; current: number; total: number }
	| { type: 'undo_complete' }
	| { type: 'undo_error'; message: string };

// Webview → Plugin
export type WebviewMessage =
	| { type: 'run' }
	| { type: 'poll' }
	| { type: 'getInitialState' }
	| { type: 'syncState'; strategies: BenchmarkResult[]; notes: PanelNote[]; selectedStrategyIndex: number }
	| { type: 'openNote'; noteId: string }
	| { type: 'getSettings' }
	| { type: 'updateSetting'; key: string; value: string }
	| ApplyMessage
	| { type: 'undo' };
