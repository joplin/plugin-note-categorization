import joplin from 'api';
import { PanelNote } from '../types/panel';
import { log } from '../utils/logger';

interface JoplinTag {
	id: string;
	title: string;
}

function matchesKeyword(title: string, body: string, keyword: string): boolean {
	const lowerKeyword = keyword.toLowerCase();
	const lowerTitle = title.toLowerCase();
	const lowerBody = body.toLowerCase();

	try {
		const escaped = lowerKeyword.replace(/[-\x2f\\^$*+?.()|[\]{}]/g, '\\$&');
		// Unicode-aware word boundary matching
		const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}])` + escaped + `(?:$|[^\\p{L}\\p{N}])`, 'u');
		return regex.test(lowerTitle) || regex.test(lowerBody);
	} catch (e) {
		return lowerTitle.includes(lowerKeyword) || lowerBody.includes(lowerKeyword);
	}
}

export async function fetchExistingTags(): Promise<Map<string, string>> {
	const allTags: JoplinTag[] = [];
	let tagPage = 1;
	const MAX_PAGES = 500;
	while (tagPage <= MAX_PAGES) {
		const res = await joplin.data.get(['tags'], { page: tagPage, limit: 100, fields: ['id', 'title'] });
		allTags.push(...res.items);
		if (!res.has_more) break;
		tagPage++;
	}
	return new Map<string, string>(allTags.map((t) => [t.title.toLowerCase(), t.id]));
}

export async function getOrCreateTag(
	existingTagsMap: Map<string, string>,
	title: string,
): Promise<{ id: string; created: boolean }> {
	const lowerTitle = title.toLowerCase();
	const cachedId = existingTagsMap.get(lowerTitle);
	if (cachedId) {
		return { id: cachedId, created: false };
	}
	const created = await joplin.data.post(['tags'], null, { title });
	existingTagsMap.set(lowerTitle, created.id);
	return { id: created.id, created: true };
}

export async function initializeClusterTags(
	uniqueClusterIds: number[],
	clusterNames: { [clusterId: number]: string },
	existingTagsMap: Map<string, string>,
	createdTagIds: string[],
): Promise<{ [clusterId: number]: string }> {
	const tagMap: { [clusterId: number]: string } = {};
	for (const clusterId of uniqueClusterIds) {
		const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
		const { id: tagId, created } = await getOrCreateTag(existingTagsMap, clusterName);
		tagMap[clusterId] = tagId;
		if (created) {
			createdTagIds.push(tagId);
		}
	}
	return tagMap;
}

export async function applyTagsToNote(
	note: PanelNote,
	clusterId: number,
	noteTitle: string,
	noteBody: string,
	clusterNames: { [clusterId: number]: string },
	clusterTags: { [clusterId: number]: string[] },
	tagMap: { [clusterId: number]: string },
	existingTagsMap: Map<string, string>,
	createdTagIds: string[],
): Promise<string[]> {
	const addedTagIds: string[] = [];

	// Apply the main cluster name tag (as grouping tag)
	const mainTagId = tagMap[clusterId];
	if (mainTagId) {
		try {
			await joplin.data.post(['tags', mainTagId, 'notes'], null, { id: note.noteId });
			addedTagIds.push(mainTagId);
		} catch (tagErr) {
			log(`Tag ${mainTagId} may already be on note ${note.noteId}: ${tagErr}`);
		}
	}

	// Get all extracted specific tags for this cluster
	const specificTags = clusterTags[clusterId] || [];
	for (const tagText of specificTags) {
		// Don't duplicate the main cluster tag if it's already applied
		const clusterName = clusterNames[clusterId] || `Cluster ${clusterId + 1}`;
		if (tagText.toLowerCase() === clusterName.toLowerCase()) {
			continue;
		}

		if (matchesKeyword(noteTitle, noteBody, tagText)) {
			const { id: tagId, created } = await getOrCreateTag(existingTagsMap, tagText);
			try {
				await joplin.data.post(['tags', tagId, 'notes'], null, { id: note.noteId });
				addedTagIds.push(tagId);
				if (created) {
					createdTagIds.push(tagId);
				}
			} catch (tagErr) {
				log(`Tag ${tagId} may already be on note ${note.noteId}: ${tagErr}`);
			}
		}
	}

	return addedTagIds;
}

export async function removeTagsFromNote(noteId: string, addedTagIds: string[]) {
	for (const tagId of addedTagIds) {
		try {
			await joplin.data.delete(['tags', tagId, 'notes', noteId]);
		} catch (tagErr) {
			log(`Undo: tag ${tagId} removal failed for note ${noteId}: ${tagErr}`);
		}
	}
}

export async function deleteCreatedTags(createdTagIds: string[]) {
	for (const tagId of createdTagIds) {
		try {
			await joplin.data.delete(['tags', tagId]);
		} catch (tagErr) {
			log(`Undo: failed to delete created tag ${tagId}: ${tagErr}`);
		}
	}
}
