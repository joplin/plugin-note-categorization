import type { WebviewMessage } from '../types/panel';

/**
 * Joplin injects this global into panel webviews at runtime.
 * postMessage sends a WebviewMessage to the plugin's onMessage handler
 * and returns the handler's response (PanelMessage or undefined).
 */
interface JoplinWebviewApi {
	postMessage<T = unknown>(message: WebviewMessage): Promise<T>;
}

declare global {
	// eslint-disable-next-line no-var
	var webviewApi: JoplinWebviewApi;
}

export {};
