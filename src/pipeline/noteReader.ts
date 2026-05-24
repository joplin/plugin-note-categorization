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

	return allNotes;
};
