const LOG_PREFIX = '[ai-categorise]';

export const log = (...args: unknown[]) => {
	console.info(LOG_PREFIX, ...args);
};

export const logErr = (...args: unknown[]) => {
	console.error(LOG_PREFIX, ...args);
};
