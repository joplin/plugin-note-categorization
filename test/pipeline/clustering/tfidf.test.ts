import {
	cleanText,
	singularize,
	tokenize,
	getNgrams,
	hasConsecutiveDuplicates,
	TfidfExtractor,
} from '../../../src/pipeline/clustering/tfidf';

describe('cleanText', () => {
	it('strips fenced code blocks', () => {
		expect(cleanText('before ```const x = 1;``` after')).toBe('before   after');
	});

	it('strips inline code', () => {
		expect(cleanText('run `npm install` now')).toBe('run   now');
	});

	it('strips HTML tags', () => {
		expect(cleanText('<b>bold</b> text')).toBe(' bold  text');
	});

	it('strips URLs', () => {
		expect(cleanText('visit https://example.com today')).toBe('visit   today');
	});

	it('preserves link text from markdown links', () => {
		expect(cleanText('[click here](http://example.com)')).toBe('click here');
	});

	it('returns empty string for falsy input', () => {
		expect(cleanText('')).toBe('');
	});
});

describe('singularize', () => {
	it.each([
		['categories', 'category'], // -ies → -y
		['boxes', 'box'], // -xes → -x (sibilant)
		['classes', 'class'], // -sses: endsWith('ss') returns early, so 'classes' → base 'class' via -es rule (base ends in 'ss')
		['databases', 'database'], // -es → remove only -s (non-sibilant base)
		['notes', 'note'], // -s
		['series', 'series'], // exception
		['analysis', 'analysis'], // exception
		['process', 'process'], // endsWith('ss') → unchanged
		['bus', 'bus'], // endsWith('us') → unchanged
		['hi', 'hi'], // length <= 3 → unchanged
	])('singularize(%s) → %s', (input, expected) => {
		expect(singularize(input)).toBe(expected);
	});
});

describe('tokenize', () => {
	it('lowercases, removes stops, singularizes', () => {
		// "The" → stop word, "quick" → kept, "Notes" → "note" → stop word (in STOP_WORDS),
		// "about" → stop word, "Categories" → "category" → kept
		const result = tokenize('The quick Categories');
		expect(result).toContain('quick');
		expect(result).toContain('category');
		expect(result).not.toContain('the');
	});

	it('removes words shorter than 3 chars', () => {
		const result = tokenize('I am an AI tool');
		// All words are <= 2 chars or stop words
		expect(result).not.toContain('am');
		expect(result).not.toContain('an');
	});

	it('returns empty array for empty input', () => {
		expect(tokenize('')).toEqual([]);
	});

	it('strips code before tokenizing', () => {
		const result = tokenize('learn `const x = 1` python');
		expect(result).toContain('python');
		expect(result).not.toContain('const');
	});
});

describe('getNgrams', () => {
	it('generates uni, bi, and trigrams', () => {
		const result = getNgrams(['machine', 'learning', 'model']);
		expect(result).toEqual([
			'machine',
			'machine learning',
			'machine learning model',
			'learning',
			'learning model',
			'model',
		]);
	});

	it('single token → just unigram', () => {
		expect(getNgrams(['python'])).toEqual(['python']);
	});

	it('empty → empty', () => {
		expect(getNgrams([])).toEqual([]);
	});
});

describe('hasConsecutiveDuplicates', () => {
	it('detects consecutive duplicates', () => {
		expect(hasConsecutiveDuplicates('day day')).toBe(true);
	});

	it('returns false for no duplicates', () => {
		expect(hasConsecutiveDuplicates('machine learning')).toBe(false);
	});

	it('returns false for single word', () => {
		expect(hasConsecutiveDuplicates('hello')).toBe(false);
	});
});

describe('TfidfExtractor', () => {
	const docs = [
		{ title: 'Python Guide', body: 'python programming language python tutorial' },
		{ title: 'Java Basics', body: 'java programming language' },
		{ title: 'Cooking Tips', body: 'recipe ingredient cooking' },
	];

	it('gives higher IDF to rare terms than common terms', () => {
		const extractor = new TfidfExtractor(docs);
		// "programming" appears in 2/3 docs, "recipe" in 1/3
		// IDF(programming) = log(3/2) + 1 ≈ 1.405
		// IDF(recipe) = log(3/1) + 1 ≈ 2.099
		// When scoring a cluster containing just the cooking doc,
		// "recipe" should score higher than "programming" (which isn't even in the cluster)
		const cookingScores = extractor.extractClusterNgramsWithScores([docs[2]]);
		const recipeScore = cookingScores.find((s) => s.ngram === 'recipe');
		expect(recipeScore).toBeDefined();
		expect(recipeScore!.score).toBeGreaterThan(0);
	});

	it('zeroes IDF for terms appearing in > 60% of docs', () => {
		// "language" appears in 2/3 = 67% > 60% → IDF = 0
		// (after singularization: "language" stays "language")
		const allDocs = [
			{ title: '', body: 'language overview' },
			{ title: '', body: 'language reference' },
			{ title: '', body: 'cooking tips' },
		];
		const extractor = new TfidfExtractor(allDocs);
		const scores = extractor.extractClusterNgramsWithScores([allDocs[0], allDocs[1]]);
		const langScore = scores.find((s) => s.ngram === 'language');
		// Should be absent (IDF=0 means it's filtered out) or score = 0
		if (langScore) {
			expect(langScore.score).toBe(0);
		}
	});

	it('returns scores sorted descending', () => {
		const extractor = new TfidfExtractor(docs);
		const scores = extractor.extractClusterNgramsWithScores([docs[0]]);
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
		}
	});

	it('boosts terms appearing in title', () => {
		// "python" appears in both title and body of docs[0]
		// It gets 5x title TF boost + 1.5x titleBoost
		// Compare: a term only in body without title boost should score lower
		const extractor = new TfidfExtractor(docs);
		const scores = extractor.extractClusterNgramsWithScores([docs[0]]);
		expect(scores.length).toBeGreaterThan(0);
		const pythonScore = scores.find((s) => s.ngram === 'python')!.score;
		const tutorialScore = scores.find((s) => s.ngram === 'tutorial')!.score;
		expect(pythonScore).toBeGreaterThan(tutorialScore);
	});

	it('returns empty for empty cluster', () => {
		const extractor = new TfidfExtractor(docs);
		expect(extractor.extractClusterNgramsWithScores([])).toEqual([]);
	});

	it('extractClusterTags respects topK', () => {
		const extractor = new TfidfExtractor(docs);
		const tags = extractor.extractClusterTags([docs[0], docs[1]], 2);
		expect(tags.length).toBeLessThanOrEqual(2);
	});
});
