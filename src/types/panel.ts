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

// Plugin → Webview
export type PanelMessage =
	| { type: 'status'; text: string }
	| { type: 'progress'; current: number; total: number; cached: number; skipped: number }
	| { type: 'results'; strategies: BenchmarkResult[]; notes: PanelNote[] }
	| { type: 'error'; message: string };

// Webview → Plugin
export type WebviewMessage = { type: 'run' } | { type: 'poll' } | { type: 'openNote'; noteId: string };
