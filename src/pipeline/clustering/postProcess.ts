import { BenchmarkResult } from '../../types/cluster';

export const STOP_WORDS = new Set([
	// English articles, prepositions, conjunctions, pronouns (all length >= 3)
	'about',
	'above',
	'after',
	'again',
	'against',
	'all',
	'and',
	'any',
	'are',
	'arent',
	'because',
	'been',
	'before',
	'being',
	'below',
	'between',
	'both',
	'but',
	'cant',
	'cannot',
	'could',
	'couldnt',
	'did',
	'didnt',
	'does',
	'doesnt',
	'doing',
	'dont',
	'down',
	'during',
	'each',
	'few',
	'for',
	'from',
	'further',
	'had',
	'hadnt',
	'has',
	'hasnt',
	'have',
	'havent',
	'having',
	'hed',
	'hell',
	'hes',
	'her',
	'here',
	'heres',
	'hers',
	'herself',
	'him',
	'himself',
	'his',
	'how',
	'hows',
	'ill',
	'its',
	'itself',
	'lets',
	'more',
	'most',
	'mustnt',
	'myself',
	'nor',
	'not',
	'off',
	'once',
	'only',
	'other',
	'ought',
	'our',
	'ours',
	'ourselves',
	'out',
	'over',
	'own',
	'same',
	'shant',
	'she',
	'shed',
	'shell',
	'shes',
	'should',
	'shouldnt',
	'some',
	'such',
	'than',
	'that',
	'thats',
	'the',
	'their',
	'theirs',
	'them',
	'themselves',
	'then',
	'there',
	'theres',
	'these',
	'they',
	'theyd',
	'theyll',
	'theyre',
	'theyve',
	'this',
	'those',
	'through',
	'too',
	'under',
	'until',
	'very',
	'was',
	'wasnt',
	'wed',
	'well',
	'were',
	'weve',
	'werent',
	'what',
	'whats',
	'when',
	'whens',
	'where',
	'wheres',
	'which',
	'while',
	'who',
	'whos',
	'whom',
	'why',
	'whys',
	'with',
	'wont',
	'would',
	'wouldnt',
	'youd',
	'youll',
	'youre',
	'youve',
	'your',
	'yours',
	'yourself',
	'yourselves',

	// Markdown/HTML structure words or general noise words (all length >= 3)
	'http',
	'https',
	'www',
	'com',
	'org',
	'net',
	'html',
	'xml',
	'css',
	'img',
	'href',
	'src',
	'div',
	'span',
	'class',
	'get',
	'post',
	'put',
	'delete',
	'use',
	'using',
	'used',
	'make',
	'made',
	'take',
	'took',
	'see',
	'saw',
	'also',
	'like',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten',
	'first',
	'second',
	'third',

	// Code keywords / programming syntax
	'const',
	'let',
	'var',
	'function',
	'return',
	'class',
	'interface',
	'type',
	'import',
	'export',
	'void',
	'string',
	'number',
	'boolean',
	'any',
	'public',
	'private',
	'protected',
	'async',
	'await',
	'null',
	'undefined',
	'true',
	'false',
	'switch',
	'case',
	'break',

	// Generic Joplin / note-taking fillers (often pollute tags in this context)
	'note',
	'notes',
	'joplin',
	'plugin',
	'folder',
	'folders',
	'notebook',
	'notebooks',
	'tag',
	'tags',
	'todo',
	'todos',
	'task',
	'tasks',
	'file',
	'files',
	'page',
	'pages',
	'data',
	'info',
	'information',
]);

/** Words that look like plurals but should not be singularized. */
const SINGULAR_EXCEPTIONS = new Set(['series', 'species', 'means', 'news', 'analysis', 'basis', 'crisis']);

/**
 * Strips code blocks, inline code, HTML tags, markdown links/images, and URLs
 * from text to avoid polluting tag extraction.
 */
export function cleanText(text: string): string {
	if (!text) return '';
	let cleaned = text;
	// Strip triple-backtick markdown code blocks
	cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');
	// Strip inline code backticks
	cleaned = cleaned.replace(/`[^`]*`/g, ' ');
	// Strip markdown images ![alt](url) and links [text](url) — keep the text, remove syntax
	cleaned = cleaned.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
	// Strip HTML tags
	cleaned = cleaned.replace(/<[^>]*>/g, ' ');
	// Strip URLs
	cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');
	return cleaned;
}

/**
 * A lightweight, dependency-free helper to stem basic English plural words to their singular form.
 * Handles common cases like -ies -> -y, -es -> - (e.g. boxes -> box), and trailing -s (notes -> note).
 */
export function singularize(word: string): string {
	if (word.length <= 3) return word;
	if (SINGULAR_EXCEPTIONS.has(word)) return word;
	if (word.endsWith('ss')) return word; // e.g. class, process
	if (word.endsWith('ies')) return word.slice(0, -3) + 'y'; // e.g. categories -> category
	if (word.endsWith('es')) {
		const base = word.slice(0, -2);
		if (
			base.endsWith('ss') ||
			base.endsWith('ch') ||
			base.endsWith('sh') ||
			base.endsWith('x') ||
			base.endsWith('z')
		) {
			return base; // e.g. classes -> class, boxes -> box
		}
		return word.slice(0, -1); // e.g. databases -> database, lines -> line
	}
	if (word.endsWith('s') && !word.endsWith('us') && !word.endsWith('is') && !word.endsWith('as')) {
		return word.slice(0, -1); // e.g. notes -> note, tasks -> task
	}
	return word;
}

/**
 * Lowercases text, cleans it, singularizes it, and tokenizes into alphabetic words
 * of length >= 3 that are not in the stop words list.
 */
export function tokenize(text: string): string[] {
	const cleaned = cleanText(text).toLowerCase().replace(/[’']/g, '');
	const matches = cleaned.match(/[a-z]+/g) || [];
	return matches.map(singularize).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export interface DocumentText {
	title: string;
	body: string;
}

/**
 * Extracts descriptive tags from documents in a cluster using TF-IDF.
 */
export class TfidfExtractor {
	private idfs: { [word: string]: number } = {};

	constructor(allDocuments: DocumentText[]) {
		const N = allDocuments.length;
		if (N === 0) return;

		const docFreqs: { [word: string]: number } = {};

		for (const doc of allDocuments) {
			// For IDF, we only need unique words per document — no title weighting needed
			const uniqueWords = this.getUniqueDocumentWords(doc);
			for (const word of uniqueWords) {
				docFreqs[word] = (docFreqs[word] || 0) + 1;
			}
		}

		for (const word of Object.keys(docFreqs)) {
			const df = docFreqs[word];
			// Max DF rule: If a word appears in > 60% of all notes, it is too generic, ignore it.
			if (df / N > 0.6) {
				this.idfs[word] = 0;
			} else {
				this.idfs[word] = Math.log(N / df) + 1;
			}
		}
	}

	/**
	 * Returns the unique set of words in a document (title + body), used for IDF counting.
	 * No title weighting — each document contributes at most 1 to each word's document frequency.
	 */
	private getUniqueDocumentWords(doc: DocumentText): Set<string> {
		const titleWords = tokenize(doc.title || '');
		const bodyWords = tokenize(doc.body || '');
		return new Set([...titleWords, ...bodyWords]);
	}

	/**
	 * Returns words for TF scoring with title words weighted 3x higher.
	 * Uses push loops instead of spread to avoid excess intermediate array allocations.
	 */
	private getWeightedWords(doc: DocumentText): string[] {
		const titleWords = tokenize(doc.title || '');
		const bodyWords = tokenize(doc.body || '');
		const result: string[] = [];
		// Title words appear 3 times to boost their term frequency
		for (let i = 0; i < 3; i++) {
			for (const w of titleWords) {
				result.push(w);
			}
		}
		for (const w of bodyWords) {
			result.push(w);
		}
		return result;
	}

	/**
	 * Computes TF-IDF scores for words in the cluster documents and returns the top K.
	 */
	public extractClusterTags(clusterDocuments: DocumentText[], topK = 5): string[] {
		if (clusterDocuments.length === 0) return [];

		const tfs: { [word: string]: number } = {};
		let totalWords = 0;

		for (const doc of clusterDocuments) {
			const weighted = this.getWeightedWords(doc);
			for (const w of weighted) {
				tfs[w] = (tfs[w] || 0) + 1;
				totalWords++;
			}
		}

		if (totalWords === 0) return [];

		const scores: { word: string; score: number }[] = [];

		for (const word of Object.keys(tfs)) {
			const tf = tfs[word] / totalWords;
			const idf = this.idfs[word] || 0; // default to 0 if word is ignored/generic
			if (idf > 0) {
				scores.push({ word, score: tf * idf });
			}
		}

		scores.sort((a, b) => b.score - a.score);
		return scores.slice(0, topK).map((s) => s.word);
	}
}

/**
 * Enriches benchmark results with extracted TF-IDF tags for each cluster.
 *
 * Builds the TF-IDF corpus from all pipeline documents once, then iterates
 * over each strategy result to extract the top tags per cluster.
 *
 * @param results    Benchmark results from the clustering pipeline
 * @param documents  All note documents used in the pipeline (same order as noteVectors)
 * @param topK       Number of tags to extract per cluster (default: 5)
 */
export function enrichResultsWithTags(results: BenchmarkResult[], documents: DocumentText[], topK = 5): void {
	const tfidfExtractor = new TfidfExtractor(documents);

	for (const result of results) {
		const tags: { [clusterId: number]: string[] } = {};

		const clusterIndices: { [clusterId: number]: number[] } = {};
		result.assignments.forEach((clusterId, noteIdx) => {
			if (clusterId !== -1) {
				if (!clusterIndices[clusterId]) {
					clusterIndices[clusterId] = [];
				}
				clusterIndices[clusterId].push(noteIdx);
			}
		});

		for (const clusterIdStr of Object.keys(clusterIndices)) {
			const clusterId = Number(clusterIdStr);
			const indices = clusterIndices[clusterId];

			const clusterDocuments = indices.map((idx) => documents[idx]);
			tags[clusterId] = tfidfExtractor.extractClusterTags(clusterDocuments, topK);
		}

		result.tags = tags;
	}
}
