import { TAXONOMY_MAPPING } from './data/taxonomy';
import { filterDemotedUnigrams } from './tagExtraction';

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
