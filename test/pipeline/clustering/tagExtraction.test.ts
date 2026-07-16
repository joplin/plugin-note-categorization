import { filterDemotedUnigrams, selectDedupedTags } from '../../../src/pipeline/clustering/tagExtraction';

describe('filterDemotedUnigrams', () => {
	it('keeps unigram when no stronger multi-word phrase exists', () => {
		const scores = [{ ngram: 'python', score: 10 }];
		expect(filterDemotedUnigrams(scores)).toEqual(scores);
	});

	it('removes unigram subsumed by bigram at >= 50% score', () => {
		const scores = [
			{ ngram: 'machine', score: 8 },
			{ ngram: 'machine learning', score: 5 }, // 5 >= 8 * 0.5 = 4
		];
		const result = filterDemotedUnigrams(scores);
		expect(result.find((s) => s.ngram === 'machine')).toBeUndefined();
		expect(result.find((s) => s.ngram === 'machine learning')).toBeDefined();
	});

	it('keeps unigram when bigram score < 50%', () => {
		const scores = [
			{ ngram: 'machine', score: 10 },
			{ ngram: 'machine learning', score: 3 }, // 3 < 10 * 0.5 = 5
		];
		const result = filterDemotedUnigrams(scores);
		expect(result).toHaveLength(2);
	});

	it('never removes multi-word phrases', () => {
		const scores = [
			{ ngram: 'deep learning', score: 10 },
			{ ngram: 'deep', score: 20 },
		];
		const result = filterDemotedUnigrams(scores);
		expect(result.find((s) => s.ngram === 'deep learning')).toBeDefined();
	});

	it('returns empty for empty input', () => {
		expect(filterDemotedUnigrams([])).toEqual([]);
	});
});

describe('selectDedupedTags', () => {
	it('respects topK limit', () => {
		const scores = Array.from({ length: 10 }, (_, i) => ({
			ngram: `word${i}`,
			score: 10 - i,
		}));
		expect(selectDedupedTags(scores, 3).length).toBeLessThanOrEqual(3);
	});

	it('rejects duplicate unigrams (shared word)', () => {
		const scores = [
			{ ngram: 'python', score: 10 },
			{ ngram: 'python', score: 5 }, // exact duplicate
		];
		expect(selectDedupedTags(scores, 2)).toEqual(['python']);
	});

	it('allows bigrams to share 1 word', () => {
		const scores = [
			{ ngram: 'machine learning', score: 10 },
			{ ngram: 'machine vision', score: 8 },
		];
		// Both share "machine" — limit for bigrams is 1, so both pass
		expect(selectDedupedTags(scores, 2)).toHaveLength(2);
	});

	it('rejects bigram sharing 2 words with selected tags', () => {
		const scores = [
			{ ngram: 'machine learning', score: 10 },
			{ ngram: 'learning machine', score: 8 }, // shares "machine" AND "learning"
		];
		expect(selectDedupedTags(scores, 2)).toHaveLength(1);
	});

	it('returns empty for empty input', () => {
		expect(selectDedupedTags([], 5)).toEqual([]);
	});
});
