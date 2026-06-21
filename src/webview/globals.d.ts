import type { WebviewMessage, PanelMessage } from '../types/panel';

/**
 * Joplin injects this global into panel webviews at runtime.
 * postMessage sends a WebviewMessage to the plugin's onMessage handler
 * and returns the handler's response (PanelMessage or undefined).
 */
interface JoplinWebviewApi {
	postMessage(message: WebviewMessage): Promise<PanelMessage | { type: 'idle' } | undefined>;
}

declare global {
	// eslint-disable-next-line no-var
	var webviewApi: JoplinWebviewApi;
}

export {};
