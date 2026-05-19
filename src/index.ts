import joplin from 'api';
import { MenuItemLocation } from 'api/types';
import { runTestEmbed } from './commands/testEmbed';
import { log } from './utils/logger';

joplin.plugins.register({
	onStart: async function () {
		log('Plugin started');

		const installDir = await joplin.plugins.installationDir();

		await joplin.commands.register({
			name: 'aiCategorise.testEmbed',
			label: 'AI Categorise: Test Embedding',
			execute: async () => runTestEmbed(installDir),
		});

		await joplin.views.menuItems.create(
			'aiCategorise.testEmbedMenuItem',
			'aiCategorise.testEmbed',
			MenuItemLocation.Tools,
		);

		log('Test command registered under Tools menu');
	},
});
