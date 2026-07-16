import { STOP_WORDS } from './data/stopWords';
import { selectDedupedTags } from './tagExtraction';

const SINGULAR_EXCEPTIONS = new Set(['series', 'species', 'means', 'news', 'analysis', 'basis', 'crisis']);
const SHORT_UNIGRAM_THRESHOLD = 4;

export interface DocumentText {
	title: string;
	body: string;
}

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
