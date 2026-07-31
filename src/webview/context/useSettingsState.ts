import * as React from 'react';

interface SettingsResponse {
	'categorization.metric': string;
	'categorization.parentNotebook': string;
	'categorization.seed': number;
	'categorization.changeLog': string;
}

export function useSettingsState() {
	const [settings, setSettings] = React.useState({
		metric: 'cosine',
		parentNotebook: '',
		seed: 42,
		changeLog: '',
	});

	const fetchSettings = React.useCallback(async () => {
		try {
			if (typeof webviewApi === 'undefined') return;
			const res = await webviewApi.postMessage({ type: 'getSettings' });
			if (res) {
				const data = res as unknown as SettingsResponse;
				setSettings({
					metric: data['categorization.metric'] || 'cosine',
					parentNotebook: data['categorization.parentNotebook'] || '',
					seed: data['categorization.seed'] ?? 42,
					changeLog: data['categorization.changeLog'] || '',
				});
			}
		} catch (err) {
			console.error('Failed to fetch settings:', err);
		}
	}, []);

	const updateSetting = React.useCallback(async (key: string, value: string) => {
		try {
			if (typeof webviewApi === 'undefined') return;
			await webviewApi.postMessage({
				type: 'updateSetting',
				key,
				value,
			});
			const localKey = key.replace('categorization.', '');
			setSettings((prev) => ({
				...prev,
				[localKey]: value,
			}));
		} catch (err) {
			console.error('Failed to update setting:', err);
		}
	}, []);

	const hasChangeLog = !!settings.changeLog;

	return {
		settings,
		hasChangeLog,
		fetchSettings,
		updateSetting,
	};
}
