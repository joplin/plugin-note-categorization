import joplin from 'api';

export interface NoteItem {
	id: string;
	title: string;
	body: string;
	updated_time: number;
	user_updated_time: number;
	parent_id: string;
}

export const fetchAllNotes = async (): Promise<NoteItem[]> => {
	// Fetch all active folder IDs
	const activeFolderIds = new Set<string>();
	let folderPage = 1;
	while (true) {
		const result = await joplin.data.get(['folders'], {
			fields: ['id'],
			page: folderPage,
			limit: 50,
		});
		result.items.forEach((f: any) => activeFolderIds.add(f.id));
		if (!result.has_more) break;
		folderPage++;
	}

	// Fetch all notes
	let page = 1;
	const allNotes: NoteItem[] = [];
	while (true) {
		const result = await joplin.data.get(['notes'], {
			fields: ['id', 'title', 'body', 'updated_time', 'user_updated_time', 'parent_id'],
			page,
			limit: 50,
		});
		allNotes.push(...result.items);
		if (!result.has_more) break;
		page++;
	}

	// Filter out notes whose parent folder no longer exists (orphaned/deleted folders)
	const activeNotes = allNotes.filter((note) => activeFolderIds.has(note.parent_id));

	return activeNotes;
};
