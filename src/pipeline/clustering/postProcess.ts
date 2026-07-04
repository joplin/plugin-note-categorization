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

	// More prepositions, adverbs, and common noise verbs (to clean up phrases)
	'without',
	'within',
	'throughout',
	'around',
	'going',
	'goes',
	'went',
	'getting',
	'got',
	'having',
	'making',
	'taking',
	'actually',
	'really',
	'basically',
	'simply',
	'mainly',
	'mostly',
	'highly',
	'fully',
	'totally',
	'completely',
	'extremely',
	'very',
	'quite',
	'pretty',
	'somewhat',
	'rather',
	'indeed',
	'always',
	'never',
	'sometimes',
	'often',
	'usually',
	'probably',
	'possibly',
	'maybe',
	'crazy',
	'easy',
	'hard',
	'difficult',
	'simple',
	'good',
	'bad',
	'best',
	'worst',
	'better',
	'worse',
	'new',
	'old',
	'first',
	'last',
	'next',
	'prev',
	'previous',
	'current',
	'different',
	'same',
	'other',
	'another',
	'each',
	'every',
	'many',
	'much',
	'few',
	'several',
	'some',
	'any',
	'no',
	'work',
	'thing',
	'things',
	'stuff',
	'name',
	'value',
	'data',
	'user',
	'item',
	'items',

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

/** Unigrams with character length at or below this threshold receive a 0.5x scoring penalty. */
const SHORT_UNIGRAM_THRESHOLD = 4;

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

/**
 * Generates unigrams, bigrams, and trigrams from a sequence of tokens.
 */
export function getNgrams(tokens: string[]): string[] {
	const ngrams: string[] = [];
	const N = tokens.length;
	for (let i = 0; i < N; i++) {
		// Unigram
		ngrams.push(tokens[i]);
		// Bigram
		if (i < N - 1) {
			ngrams.push(`${tokens[i]} ${tokens[i + 1]}`);
		}
		// Trigram
		if (i < N - 2) {
			ngrams.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
		}
	}
	return ngrams;
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
			// For IDF, we only need unique words/ngrams per document — no title weighting needed
			const uniqueWords = this.getUniqueDocumentWords(doc);
			for (const word of uniqueWords) {
				docFreqs[word] = (docFreqs[word] || 0) + 1;
			}
		}

		for (const word of Object.keys(docFreqs)) {
			const df = docFreqs[word];
			// Max DF rule: If a word/ngram appears in > 60% of all notes, it is too generic, ignore it.
			if (df / N > 0.6) {
				this.idfs[word] = 0;
			} else {
				this.idfs[word] = Math.log(N / df) + 1;
			}
		}
	}

	/**
	 * Splits the text by sentence/line boundaries and generates ngrams within segments.
	 * This prevents forming cross-boundary ngrams (like joining separate lines or sentences).
	 */
	private getSegmentNgrams(text: string): string[] {
		if (!text) return [];
		// Split by sentence punctuation, newlines, markdown headers, and list bullets
		const segments = text.split(/[.,?!;:\n\r\-*#()[\]]+/);
		const allNgrams: string[] = [];
		for (const seg of segments) {
			const tokens = tokenize(seg);
			const ngrams = getNgrams(tokens);
			for (const ng of ngrams) {
				// Filter out any ngrams with consecutive duplicate words (e.g. "day day")
				if (!hasConsecutiveDuplicates(ng)) {
					allNgrams.push(ng);
				}
			}
		}
		return allNgrams;
	}

	/**
	 * Returns the unique set of words/ngrams in a document (title + body), used for IDF counting.
	 * No title weighting — each document contributes at most 1 to each ngram's document frequency.
	 */
	private getUniqueDocumentWords(doc: DocumentText): Set<string> {
		const titleNgrams = this.getSegmentNgrams(doc.title || '');
		const bodyNgrams = this.getSegmentNgrams(doc.body || '');
		return new Set([...titleNgrams, ...bodyNgrams]);
	}

	/**
	 * Returns ngrams for TF scoring with title words weighted 5x higher.
	 * Uses push loops instead of spread to avoid excess intermediate array allocations.
	 */
	private getWeightedWords(doc: DocumentText): string[] {
		const titleNgrams = this.getSegmentNgrams(doc.title || '');
		const bodyNgrams = this.getSegmentNgrams(doc.body || '');
		const result: string[] = [];
		// Title ngrams appear 5 times to boost their term frequency
		for (let i = 0; i < 5; i++) {
			for (const ng of titleNgrams) {
				result.push(ng);
			}
		}
		for (const ng of bodyNgrams) {
			result.push(ng);
		}
		return result;
	}

	/**
	 * Computes sorted TF-IDF scores for ngrams in the cluster documents.
	 * Incorporates Cluster Frequency (CF) weighting, Length Boosting, and Title Match Boosting.
	 */
	public extractClusterNgramsWithScores(clusterDocuments: DocumentText[]): { ngram: string; score: number }[] {
		if (clusterDocuments.length === 0) return [];

		const tfs: { [ngram: string]: number } = {};
		let totalNgrams = 0;

		for (const doc of clusterDocuments) {
			const weighted = this.getWeightedWords(doc);
			for (const ng of weighted) {
				tfs[ng] = (tfs[ng] || 0) + 1;
				totalNgrams++;
			}
		}

		if (totalNgrams === 0) return [];

		// Count how many documents in the cluster contain each ngram
		const docCounts: { [ngram: string]: number } = {};
		for (const doc of clusterDocuments) {
			const titleNgrams = this.getSegmentNgrams(doc.title || '');
			const bodyNgrams = this.getSegmentNgrams(doc.body || '');
			const docNgrams = new Set([...titleNgrams, ...bodyNgrams]);
			for (const ng of docNgrams) {
				docCounts[ng] = (docCounts[ng] || 0) + 1;
			}
		}

		const scores: { ngram: string; score: number }[] = [];

		for (const ngram of Object.keys(tfs)) {
			const idf = this.idfs[ngram] || 0; // default to 0 if word is ignored/generic
			if (idf > 0) {
				const tf = tfs[ngram] / totalNgrams;
				const cf = (docCounts[ngram] || 0) / clusterDocuments.length;

				// Length boost: 1.0x for unigram, 1.5x for bigram, 2.0x for trigram
				const wordCount = ngram.split(' ').length;
				let lengthBoost = 1.0 + (wordCount - 1) * 0.5;

				// Penalize very short unigrams (length <= 4) to favor longer descriptive phrases
				if (wordCount === 1 && ngram.length <= SHORT_UNIGRAM_THRESHOLD) {
					lengthBoost *= 0.5;
				}

				// Title match boost: 1.5x if it appears in any note title in this cluster
				let appearsInTitle = false;
				for (const doc of clusterDocuments) {
					const titleNgrams = new Set(this.getSegmentNgrams(doc.title || ''));
					if (titleNgrams.has(ngram)) {
						appearsInTitle = true;
						break;
					}
				}
				const titleBoost = appearsInTitle ? 1.5 : 1.0;

				const finalScore = tf * idf * cf * lengthBoost * titleBoost;
				scores.push({ ngram, score: finalScore });
			}
		}

		scores.sort((a, b) => b.score - a.score);
		return scores;
	}

	/**
	 * Computes TF-IDF scores for ngrams in the cluster documents and returns the top K.
	 */
	public extractClusterTags(clusterDocuments: DocumentText[], topK = 5): string[] {
		const scores = this.extractClusterNgramsWithScores(clusterDocuments);
		return selectDedupedTags(scores, topK);
	}
}

/**
 * Checks if a phrase contains consecutive identical words.
 */
export function hasConsecutiveDuplicates(phrase: string): boolean {
	const words = phrase.toLowerCase().split(' ');
	for (let i = 0; i < words.length - 1; i++) {
		if (words[i] === words[i + 1]) return true;
	}
	return false;
}

/**
 * Filters out unigrams (single-word candidates) that are part of a stronger
 * multi-word candidate (bigram/trigram) with a score >= 50% of the unigram's score.
 */
export function filterDemotedUnigrams(scores: { ngram: string; score: number }[]): { ngram: string; score: number }[] {
	return scores.filter((candidate) => {
		const wordCount = candidate.ngram.split(' ').length;
		if (wordCount === 1) {
			const hasStrongerPhrase = scores.some((other) => {
				const otherWordCount = other.ngram.split(' ').length;
				if (otherWordCount > 1) {
					const constituentWords = new Set(other.ngram.toLowerCase().split(' '));
					if (constituentWords.has(candidate.ngram.toLowerCase()) && other.score >= candidate.score * 0.5) {
						return true;
					}
				}
				return false;
			});
			if (hasStrongerPhrase) {
				return false;
			}
		}
		return true;
	});
}

/**
 * Selects up to `topK` tags from pre-computed ngram scores using deduplication rules:
 * - Unigrams must be unique (no shared words with already-selected tags)
 * - Bigrams/trigrams can share at most 1 word with already-selected tags
 */
export function selectDedupedTags(scores: { ngram: string; score: number }[], topK: number): string[] {
	const filteredScores = filterDemotedUnigrams(scores);
	const selectedTags: string[] = [];
	const usedWords = new Set<string>();

	for (const candidate of filteredScores) {
		if (selectedTags.length >= topK) break;

		const constituentWords = candidate.ngram.split(' ');
		const limit = constituentWords.length === 1 ? 0 : 1;
		let sharedCount = 0;
		for (const w of constituentWords) {
			if (usedWords.has(w)) {
				sharedCount++;
			}
		}

		if (sharedCount <= limit) {
			selectedTags.push(candidate.ngram);
			for (const w of constituentWords) {
				usedWords.add(w);
			}
		}
	}

	return selectedTags;
}

const ACRONYMS = new Set(['sip', 'api', 'ui', 'url', 'html', 'css', 'js', 'db', 'sql', 'onnx']);

/**
 * Capitalizes a phrase to Title Case, preserving common acronyms in uppercase.
 */
export function toTitleCase(phrase: string): string {
	return phrase
		.split(' ')
		.map((word) => {
			const lower = word.toLowerCase();
			if (ACRONYMS.has(lower)) {
				return word.toUpperCase();
			}
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(' ');
}

/**
 * Checks if two phrases share any words (case-insensitive).
 */
export function shareWords(phraseA: string, phraseB: string): boolean {
	const wordsA = new Set(phraseA.toLowerCase().split(' '));
	const wordsB = phraseB.toLowerCase().split(' ');
	return wordsB.some((w) => wordsA.has(w));
}

const TAXONOMY_MAPPING: { keywords: string[]; category: string }[] = [
	{
		keywords: ['travel', 'flight', 'trip', 'train', 'vacation', 'backpacking', 'itinerary', 'packing', 'flights'],
		category: 'Travel',
	},
	{
		keywords: [
			'fund',
			'stock',
			'invest',
			'portfolio',
			'finance',
			'saving',
			'tax',
			'sip',
			'lump',
			'stocks',
			'funds',
			'investment',
			'investments',
		],
		category: 'Investment',
	},
	{
		keywords: ['prep', 'smoothie', 'protein', 'macro', 'macros', 'diet', 'nutrition', 'meal'],
		category: 'Meal Prep',
	},
	{
		keywords: [
			'recipe',
			'recipes',
			'starter',
			'sourdough',
			'flour',
			'baking',
			'bread',
			'banana',
			'pasta',
			'skillet',
			'cook',
			'cooking',
			'kitchen',
		],
		category: 'Recipes',
	},
	{
		keywords: [
			'workout',
			'overload',
			'stretch',
			'stretching',
			'routine',
			'pain',
			'fitness',
			'exercise',
			'gym',
			'cardio',
			'back',
			'sitting',
		],
		category: 'Workout',
	},
	{
		keywords: [
			'code',
			'program',
			'javascript',
			'typescript',
			'node',
			'git',
			'docker',
			'graphql',
			'rest',
			'api',
			'jest',
			'test',
			'error',
			'request',
			'programming',
			'software',
			'developer',
		],
		category: 'Programming',
	},
	{
		keywords: [
			'psychology',
			'money',
			'meaning',
			'philosophy',
			'ravikant',
			'almanack',
			'book',
			'quotes',
			'thoughts',
			'reading',
			'naval',
		],
		category: 'Books & Philosophy',
	},
];

/**
 * Checks the top 3 ngrams of a cluster against a static taxonomy to match common topics.
 */
export function getTaxonomyCategory(scores: { ngram: string; score: number }[]): string | null {
	const candidates = scores.slice(0, 3).map((s) => s.ngram.toLowerCase());

	for (const cand of candidates) {
		const words = cand.split(' ');
		for (const mapping of TAXONOMY_MAPPING) {
			for (const keyword of mapping.keywords) {
				if (words.includes(keyword) || cand === keyword) {
					return mapping.category;
				}
			}
		}
	}
	return null;
}

/**
 * Generates a descriptive name for a cluster using the scoring list and clusterId.
 */
export function generateClusterName(scores: { ngram: string; score: number }[], clusterId: number): string {
	const filteredScores = filterDemotedUnigrams(scores);

	if (filteredScores.length === 0 || filteredScores[0].score <= 0) {
		return clusterId % 2 === 0 ? 'General' : 'Miscellaneous';
	}

	// Try matching against high-level taxonomy first
	const taxonomyCategory = getTaxonomyCategory(filteredScores);
	if (taxonomyCategory) {
		return taxonomyCategory;
	}

	const top1 = filteredScores[0];
	let top2: { ngram: string; score: number } | undefined;

	// Find the next highest-scoring phrase that doesn't share any words with the first phrase
	for (let i = 1; i < filteredScores.length; i++) {
		if (filteredScores[i].score <= 0) break;
		if (!shareWords(top1.ngram, filteredScores[i].ngram)) {
			top2 = filteredScores[i];
			break;
		}
	}

	// Join them if the second has at least 60% of the score of the first
	if (top2 && top2.score >= top1.score * 0.6) {
		return `${toTitleCase(top1.ngram)} & ${toTitleCase(top2.ngram)}`;
	}

	return toTitleCase(top1.ngram);
}

/**
 * Enriches benchmark results with extracted TF-IDF tags and cluster names for each cluster.
 *
 * Builds the TF-IDF corpus from all pipeline documents once, then iterates
 * over each strategy result to extract the top tags and generated names per cluster.
 *
 * @param results    Benchmark results from the clustering pipeline
 * @param documents  All note documents used in the pipeline (same order as noteVectors)
 * @param topK       Number of tags to extract per cluster (default: 5)
 */
export function enrichResultsWithTags(results: BenchmarkResult[], documents: DocumentText[], topK = 5): void {
	const tfidfExtractor = new TfidfExtractor(documents);

	for (const result of results) {
		const tags: { [clusterId: number]: string[] } = {};
		const clusterNames: { [clusterId: number]: string } = {};

		const clusterIndices: { [clusterId: number]: number[] } = {};
		result.assignments.forEach((clusterId, noteIdx) => {
			if (clusterId !== -1) {
				if (!clusterIndices[clusterId]) {
					clusterIndices[clusterId] = [];
				}
				clusterIndices[clusterId].push(noteIdx);
			}
		});

		// Cache ngram scores to avoid recomputation during collision resolution
		const cachedScores: { [clusterId: number]: { ngram: string; score: number }[] } = {};

		for (const clusterIdStr of Object.keys(clusterIndices)) {
			const clusterId = Number(clusterIdStr);
			const indices = clusterIndices[clusterId];

			const clusterDocuments = indices.map((idx) => documents[idx]);
			const ngramScores = tfidfExtractor.extractClusterNgramsWithScores(clusterDocuments);
			cachedScores[clusterId] = ngramScores;

			tags[clusterId] = selectDedupedTags(ngramScores, topK);
			clusterNames[clusterId] = generateClusterName(ngramScores, clusterId);
		}

		// Count occurrences of each mapped name to identify collisions (e.g. multiple "Recipes" sections)
		const nameCounts: { [name: string]: number } = {};
		for (const idStr of Object.keys(clusterNames)) {
			const name = clusterNames[Number(idStr)];
			nameCounts[name] = (nameCounts[name] || 0) + 1;
		}

		// Resolve duplicates by appending the cluster's top-scoring candidate keyword in parentheses
		const usedNames = new Set<string>(
			Object.values(clusterNames).filter((name) => nameCounts[name] === 1),
		);

		for (const idStr of Object.keys(clusterNames)) {
			const id = Number(idStr);
			const name = clusterNames[id];
			if (nameCounts[name] > 1) {
				const filteredScores = filterDemotedUnigrams(cachedScores[id]);
				if (filteredScores.length > 0 && filteredScores[0].score > 0) {
					const subTopic = toTitleCase(filteredScores[0].ngram);
					let resolved = `${name} (${subTopic})`;
					// Guard against re-collision: append numeric suffix if still duplicate
					if (usedNames.has(resolved)) {
						let suffix = 2;
						while (usedNames.has(`${resolved} ${suffix}`)) suffix++;
						resolved = `${resolved} ${suffix}`;
					}
					clusterNames[id] = resolved;
					usedNames.add(resolved);
				}
			}
		}

		result.tags = tags;
		result.clusterNames = clusterNames;
	}
}
