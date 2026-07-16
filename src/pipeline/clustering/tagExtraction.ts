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
