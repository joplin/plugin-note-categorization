import * as React from 'react';

interface SettingsResponse {
	'categorization.parentNotebook': string;
	'categorization.changeLog': string;
	'categorization.applyMethod'?: 'both' | 'tags' | 'notebooks';
}

export function useSettingsState() {
	const [settings, setSettings] = React.useState<{
		parentNotebook: string;
		changeLog: string;
		applyMethod: 'both' | 'tags' | 'notebooks';
	}>({
		parentNotebook: '',
		changeLog: '',
		applyMethod: 'both',
	});

	const fetchSettings = React.useCallback(async () => {
		try {
			if (typeof webviewApi === 'undefined') return;
			const res = await webviewApi.postMessage({ type: 'getSettings' });
			if (res) {
				const data = res as unknown as SettingsResponse;
				setSettings({
					parentNotebook: data['categorization.parentNotebook'] || '',
					changeLog: data['categorization.changeLog'] || '',
					applyMethod: data['categorization.applyMethod'] || 'both',
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
