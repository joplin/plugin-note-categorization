import * as React from 'react';

export function useSettingsState() {
	const [settings, setSettings] = React.useState({
		metric: 'cosine',
		parentNotebook: '',
		changeLog: '',
	});

	const fetchSettings = React.useCallback(async () => {
		try {
			const res = await webviewApi.postMessage({ type: 'getSettings' });
			if (res) {
				setSettings({
					metric: (res as any)['categorization.metric'] || 'cosine',
					parentNotebook: (res as any)['categorization.parentNotebook'] || '',
					changeLog: (res as any)['categorization.changeLog'] || '',
				});
			}
		} catch (err) {
			console.error('Failed to fetch settings:', err);
		}
	}, []);

	const updateSetting = React.useCallback(async (key: string, value: any) => {
		try {
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
