const mockChat = jest.fn();
jest.mock(
	'api',
	() => ({
		__esModule: true,
		default: {
			ai: {
				chat: (...args: unknown[]) => mockChat(...args),
			},
		},
	}),
	{ virtual: true },
);

import {
	sanitizeAiName,
	buildNamingPrompt,
	parseAiNamesResponse,
	upgradeClusterNamesWithAi,
} from '../../../src/pipeline/clustering/aiNamingService';
import { BenchmarkResult } from '../../../src/types/cluster';

describe('sanitizeAiName', () => {
	it('trims whitespace', () => {
		expect(sanitizeAiName('  Machine Learning  ')).toBe('Machine Learning');
	});

	it('strips surrounding double quotes', () => {
		expect(sanitizeAiName('"Machine Learning"')).toBe('Machine Learning');
	});

	it('strips surrounding single quotes', () => {
		expect(sanitizeAiName("'Machine Learning'")).toBe('Machine Learning');
	});

	it('strips surrounding backticks', () => {
		expect(sanitizeAiName('`Machine Learning`')).toBe('Machine Learning');
	});

	it('strips markdown header prefixes', () => {
		expect(sanitizeAiName('## Machine Learning')).toBe('Machine Learning');
		expect(sanitizeAiName('### Deep Learning Notes')).toBe('Deep Learning Notes');
	});

	it('strips "Title:" preamble', () => {
		expect(sanitizeAiName('Title: Machine Learning')).toBe('Machine Learning');
	});

	it('strips "Cluster Name:" preamble (case insensitive)', () => {
		expect(sanitizeAiName('Cluster Name: Web Dev')).toBe('Web Dev');
		expect(sanitizeAiName('cluster name: Web Dev')).toBe('Web Dev');
	});

	it('strips "Category:" preamble', () => {
		expect(sanitizeAiName('Category: Travel Plans')).toBe('Travel Plans');
	});

	it('strips "Name:" preamble', () => {
		expect(sanitizeAiName('Name: Fitness')).toBe('Fitness');
	});

	it('strips "Group:" preamble', () => {
		expect(sanitizeAiName('Group: Recipes')).toBe('Recipes');
	});

	it('strips "Topic:" preamble', () => {
		expect(sanitizeAiName('Topic: Finance')).toBe('Finance');
	});

	it('strips trailing periods', () => {
		expect(sanitizeAiName('Machine Learning.')).toBe('Machine Learning');
		expect(sanitizeAiName('Deep Learning...')).toBe('Deep Learning');
	});

	it('truncates to 5 words maximum', () => {
		expect(sanitizeAiName('This Is A Very Long Category Name')).toBe('This Is A Very Long');
	});

	it('handles combined artifacts (quotes + label + period)', () => {
		expect(sanitizeAiName('"Title: Machine Learning."')).toBe('Machine Learning');
	});

	it('returns empty string for whitespace-only input', () => {
		expect(sanitizeAiName('   ')).toBe('');
	});

	it('preserves valid short names', () => {
		expect(sanitizeAiName('Recipes')).toBe('Recipes');
	});
});

describe('buildNamingPrompt', () => {
	it('returns system and user messages', () => {
		const messages = buildNamingPrompt([
			{
				clusterId: 0,
				noteCount: 3,
				sampleTitles: ['React Hooks Guide'],
				topKeywords: ['react hooks'],
			},
		]);

		expect(messages).toHaveLength(2);
		expect(messages[0].role).toBe('system');
		expect(messages[1].role).toBe('user');
	});

	it('includes cluster ID and note count in user message', () => {
		const messages = buildNamingPrompt([
			{
				clusterId: 2,
				noteCount: 5,
				sampleTitles: ['Note A'],
				topKeywords: [],
			},
		]);

		expect(messages[1].content).toContain('Group 2');
		expect(messages[1].content).toContain('5 notes');
	});

	it('includes sample titles in quotes', () => {
		const messages = buildNamingPrompt([
			{
				clusterId: 0,
				noteCount: 2,
				sampleTitles: ['React Hooks', 'Redux State'],
				topKeywords: [],
			},
		]);

		expect(messages[1].content).toContain('"React Hooks"');
		expect(messages[1].content).toContain('"Redux State"');
	});

	it('includes keywords when provided', () => {
		const messages = buildNamingPrompt([
			{
				clusterId: 0,
				noteCount: 2,
				sampleTitles: ['Note A'],
				topKeywords: ['react', 'typescript'],
			},
		]);

		expect(messages[1].content).toContain('Keywords: react, typescript');
	});

	it('omits keywords line when empty', () => {
		const messages = buildNamingPrompt([
			{
				clusterId: 0,
				noteCount: 2,
				sampleTitles: ['Note A'],
				topKeywords: [],
			},
		]);

		expect(messages[1].content).not.toContain('Keywords:');
	});

	it('handles multiple clusters', () => {
		const messages = buildNamingPrompt([
			{ clusterId: 0, noteCount: 3, sampleTitles: ['A'], topKeywords: [] },
			{ clusterId: 1, noteCount: 5, sampleTitles: ['B'], topKeywords: [] },
			{ clusterId: 2, noteCount: 2, sampleTitles: ['C'], topKeywords: [] },
		]);

		expect(messages[1].content).toContain('Group 0');
		expect(messages[1].content).toContain('Group 1');
		expect(messages[1].content).toContain('Group 2');
	});

	it('system message asks for JSON output', () => {
		const messages = buildNamingPrompt([{ clusterId: 0, noteCount: 1, sampleTitles: ['X'], topKeywords: [] }]);

		expect(messages[0].content).toContain('JSON');
	});
});

describe('parseAiNamesResponse', () => {
	it('parses valid JSON response', () => {
		const response = '{"0": "Machine Learning", "1": "Travel Plans"}';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).toEqual({ 0: 'Machine Learning', 1: 'Travel Plans' });
	});

	it('parses JSON wrapped in markdown code block', () => {
		const response = '```json\n{"0": "ML", "1": "Travel"}\n```';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).toEqual({ 0: 'ML', 1: 'Travel' });
	});

	it('parses JSON wrapped in plain code block', () => {
		const response = '```\n{"0": "ML", "1": "Travel"}\n```';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).toEqual({ 0: 'ML', 1: 'Travel' });
	});

	it('extracts JSON embedded in surrounding text', () => {
		const response = 'Here are the names:\n{"0": "ML", "1": "Travel"}\nHope this helps!';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).toEqual({ 0: 'ML', 1: 'Travel' });
	});

	it('sanitizes names in the response', () => {
		const response = '{"0": "Title: Machine Learning.", "1": "\\"Travel Plans\\""}';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).not.toBeNull();
		expect(result![0]).toBe('Machine Learning');
		expect(result![1]).toBe('Travel Plans');
	});

	it('returns null for non-JSON response', () => {
		const response = 'I think the clusters should be named Machine Learning and Travel.';
		const result = parseAiNamesResponse(response, [0, 1]);
		expect(result).toBeNull();
	});

	it('returns null for empty response', () => {
		expect(parseAiNamesResponse('', [0, 1])).toBeNull();
	});

	it('returns null for malformed JSON', () => {
		expect(parseAiNamesResponse('{invalid json}', [0, 1])).toBeNull();
	});

	it('returns null if fewer than half the clusters have names', () => {
		const response = '{"0": "ML"}'; // only 1 of 3 clusters
		const result = parseAiNamesResponse(response, [0, 1, 2]);
		expect(result).toBeNull();
	});

	it('accepts partial results if at least half the clusters have names', () => {
		const response = '{"0": "ML", "1": "Travel"}'; // 2 of 3 clusters
		const result = parseAiNamesResponse(response, [0, 1, 2]);
		expect(result).not.toBeNull();
		expect(result![0]).toBe('ML');
		expect(result![1]).toBe('Travel');
		expect(result![2]).toBeUndefined();
	});

	it('skips entries with empty string values', () => {
		const response = '{"0": "ML", "1": "  "}';
		const result = parseAiNamesResponse(response, [0, 1]);
		// "1" is whitespace-only, sanitized to empty, so only "0" is valid
		// 1 out of 2 = 50%, which meets the threshold (ceil(2/2) = 1)
		expect(result).not.toBeNull();
		expect(result![0]).toBe('ML');
	});

	it('handles numeric string cluster IDs', () => {
		const response = '{"0": "Alpha", "3": "Beta"}';
		const result = parseAiNamesResponse(response, [0, 3]);
		expect(result).toEqual({ 0: 'Alpha', 3: 'Beta' });
	});
});

describe('upgradeClusterNamesWithAi', () => {
	beforeEach(() => {
		mockChat.mockReset();
	});

	it('returns true and upgrades cluster names when ai.chat succeeds', async () => {
		mockChat.mockResolvedValueOnce({ text: '{"0": "AI Web Dev", "1": "AI Travel"}' });

		const results: BenchmarkResult[] = [
			{
				strategyName: 'kmeans-auto',
				algorithm: 'kmeans',
				clusterCount: 2,
				silhouetteScore: 0.8,
				outlierCount: 0,
				timeMs: 10,
				clusterSizes: [2, 2],
				clusterNames: { 0: 'Web', 1: 'Travel' },
				assignments: [0, 0, 1, 1],
				tags: { 0: ['web'], 1: ['travel'] },
			},
		];
		const documents = [
			{ title: 'React Guide', body: 'React' },
			{ title: 'Vue Guide', body: 'Vue' },
			{ title: 'Paris Trip', body: 'Paris' },
			{ title: 'Tokyo Trip', body: 'Tokyo' },
		];

		const upgraded = await upgradeClusterNamesWithAi(results, documents);

		expect(upgraded).toBe(true);
		expect(results[0].clusterNames?.[0]).toBe('AI Web Dev');
		expect(results[0].clusterNames?.[1]).toBe('AI Travel');
	});

	it('returns false and keeps TF-IDF names when ai.chat fails or throws', async () => {
		mockChat.mockRejectedValueOnce(new Error('AI chat unavailable'));

		const results: BenchmarkResult[] = [
			{
				strategyName: 'kmeans-auto',
				algorithm: 'kmeans',
				clusterCount: 2,
				silhouetteScore: 0.8,
				outlierCount: 0,
				timeMs: 10,
				clusterSizes: [2, 2],
				clusterNames: { 0: 'TF-IDF Web', 1: 'TF-IDF Travel' },
				assignments: [0, 0, 1, 1],
				tags: { 0: ['web'], 1: ['travel'] },
			},
		];
		const documents = [
			{ title: 'React Guide', body: 'React' },
			{ title: 'Vue Guide', body: 'Vue' },
			{ title: 'Paris Trip', body: 'Paris' },
			{ title: 'Tokyo Trip', body: 'Tokyo' },
		];

		const upgraded = await upgradeClusterNamesWithAi(results, documents);

		expect(upgraded).toBe(false);
		expect(results[0].clusterNames?.[0]).toBe('TF-IDF Web');
		expect(results[0].clusterNames?.[1]).toBe('TF-IDF Travel');
	});
});
