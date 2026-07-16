import {
	toTitleCase,
	shareWords,
	getTaxonomyCategory,
	generateClusterName,
} from '../../../src/pipeline/clustering/clusterNaming';

describe('toTitleCase', () => {
	it('capitalizes regular words', () => {
		expect(toTitleCase('machine learning')).toBe('Machine Learning');
	});

	it('uppercases known acronyms', () => {
		expect(toTitleCase('api design')).toBe('API Design');
		expect(toTitleCase('html css js')).toBe('HTML CSS JS');
	});
});

describe('shareWords', () => {
	it('returns true when phrases share a word', () => {
		expect(shareWords('machine learning', 'machine vision')).toBe(true);
	});

	it('returns false when no words are shared', () => {
		expect(shareWords('deep learning', 'computer vision')).toBe(false);
	});

	it('is case insensitive', () => {
		expect(shareWords('Python', 'python code')).toBe(true);
	});
});

describe('getTaxonomyCategory', () => {
	it('matches travel keywords', () => {
		const scores = [{ ngram: 'flight booking', score: 10 }];
		expect(getTaxonomyCategory(scores)).toBe('Travel');
	});

	it('matches programming keywords', () => {
		const scores = [{ ngram: 'javascript', score: 10 }];
		expect(getTaxonomyCategory(scores)).toBe('Programming');
	});

	it('returns null for unrecognized terms', () => {
		const scores = [{ ngram: 'quantum entanglement', score: 10 }];
		expect(getTaxonomyCategory(scores)).toBeNull();
	});

	it('only checks top 3 scores', () => {
		const scores = [
			{ ngram: 'random', score: 10 },
			{ ngram: 'stuff', score: 8 },
			{ ngram: 'things', score: 6 },
			{ ngram: 'recipe', score: 4 }, // index 3, outside top 3
		];
		expect(getTaxonomyCategory(scores)).toBeNull();
	});
});

describe('generateClusterName', () => {
	it('returns "General" for empty scores with even clusterId', () => {
		expect(generateClusterName([], 0)).toBe('General');
	});

	it('returns "Miscellaneous" for empty scores with odd clusterId', () => {
		expect(generateClusterName([], 1)).toBe('Miscellaneous');
	});

	it('uses taxonomy when matched', () => {
		const scores = [{ ngram: 'flight', score: 10 }];
		expect(generateClusterName(scores, 0)).toBe('Travel');
	});

	it('uses top ngram in title case when no taxonomy match', () => {
		const scores = [{ ngram: 'quantum computing', score: 10 }];
		expect(generateClusterName(scores, 0)).toBe('Quantum Computing');
	});

	it('joins top 2 phrases with "&" when second score >= 60% of first', () => {
		const scores = [
			{ ngram: 'quantum', score: 10 },
			{ ngram: 'computing', score: 7 }, // 7 >= 10 * 0.6
		];
		expect(generateClusterName(scores, 0)).toBe('Quantum & Computing');
	});

	it('does not join when second score < 60% of first', () => {
		const scores = [
			{ ngram: 'quantum', score: 10 },
			{ ngram: 'computing', score: 4 }, // 4 < 10 * 0.6
		];
		expect(generateClusterName(scores, 0)).toBe('Quantum');
	});

	it('skips second phrase if it shares words with first', () => {
		const scores = [
			{ ngram: 'machine learning', score: 10 },
			{ ngram: 'machine vision', score: 8 }, // shares "machine" → skipped
			{ ngram: 'automation', score: 7 }, // no overlap, 7 >= 10*0.6
		];
		expect(generateClusterName(scores, 0)).toBe('Machine Learning & Automation');
	});
});
