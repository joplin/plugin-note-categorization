import joplin from 'api';
import { JoplinAi, ChatMessage, ChatResult } from '../../types/joplinAi';
import { BenchmarkResult } from '../../types/cluster';
import { DocumentText } from './tfidf';
import { log, logErr } from '../../utils/logger';

/** Maximum time (ms) to wait for the AI chat response before falling back. */
const AI_TIMEOUT_MS = 45_000;

/** Maximum number of representative note titles to include per cluster in the prompt. */
const MAX_TITLES_PER_CLUSTER = 6;

/** Maximum number of TF-IDF keywords to include per cluster in the prompt. */
const MAX_KEYWORDS_PER_CLUSTER = 3;

interface ClusterSummary {
	clusterId: number;
	noteCount: number;
	sampleTitles: string[];
	topKeywords: string[];
}

/**
 * Sanitizes a raw AI-generated cluster name by removing common LLM formatting artifacts.
 * Strips surrounding quotes, backticks, markdown headers, labels like "Title:" or
 * "Cluster Name:", and truncates to a maximum of 5 words.
 */
export function sanitizeAiName(raw: string): string {
	let name = raw.trim();

	// Strip surrounding quotes (single, double, or backticks)
	name = name.replace(/^["'`]+|["'`]+$/g, '');

	// Strip markdown header prefixes (e.g. "## ", "### ")
	name = name.replace(/^#{1,6}\s*/, '');

	// Strip common LLM preamble labels
	name = name.replace(/^(?:title|cluster(?:\s+name)?|name|category|group|topic)\s*:\s*/i, '');

	// Strip trailing periods
	name = name.replace(/\.+$/, '');

	// Re-trim after all replacements
	name = name.trim();

	// Truncate to 5 words max
	const words = name.split(/\s+/);
	if (words.length > 5) {
		name = words.slice(0, 5).join(' ');
	}

	return name;
}

/**
 * Builds the system and user prompt messages for the batched AI naming call.
 * All clusters are included in a single prompt to minimize API round-trips.
 */
export function buildNamingPrompt(clusterSummaries: ClusterSummary[]): ChatMessage[] {
	const systemMessage: ChatMessage = {
		role: 'system',
		content:
			'You are a concise note organizer. For each numbered group of notes below, generate a short descriptive category title (2 to 4 words). ' +
			'Reply with ONLY a valid JSON object mapping group numbers to titles. ' +
			'Example: {"0": "Web Development", "1": "Travel Plans", "2": "Fitness Routines"}. ' +
			'Do NOT include any other text, explanation, or markdown formatting in your response.',
	};

	let userContent = '';
	for (const summary of clusterSummaries) {
		const titlesStr = summary.sampleTitles.map((t) => `"${t}"`).join(', ');
		userContent += `Group ${summary.clusterId} (${summary.noteCount} notes): ${titlesStr}\n`;
		if (summary.topKeywords.length > 0) {
			userContent += `Keywords: ${summary.topKeywords.join(', ')}\n`;
		}
		userContent += '\n';
	}

	const userMessage: ChatMessage = {
		role: 'user',
		content: userContent.trim(),
	};

	return [systemMessage, userMessage];
}

/**
 * Parses the AI response text as JSON and extracts cluster names.
 * Returns null if parsing fails or the response doesn't contain valid mappings.
 */
export function parseAiNamesResponse(
	responseText: string,
	clusterIds: number[],
): { [clusterId: number]: string } | null {
	// Try to extract JSON from the response (handle cases where LLM wraps in ```json ... ```)
	let jsonStr = responseText.trim();
	const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (jsonBlockMatch) {
		jsonStr = jsonBlockMatch[1].trim();
	}

	// Try to find a JSON object in the response
	const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
	if (!jsonObjectMatch) {
		return null;
	}

	let parsed: Record<string, string>;
	try {
		parsed = JSON.parse(jsonObjectMatch[0]);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return null;
	}

	const result: { [clusterId: number]: string } = {};
	let validCount = 0;

	for (const id of clusterIds) {
		const raw = parsed[String(id)];
		if (typeof raw === 'string' && raw.trim().length > 0) {
			const sanitized = sanitizeAiName(raw);
			if (sanitized.length > 0) {
				result[id] = sanitized;
				validCount++;
			}
		}
	}

	// Only accept if we got names for at least half the clusters
	if (validCount < Math.ceil(clusterIds.length / 2)) {
		return null;
	}

	return result;
}

/**
 * Wraps a promise with a timeout. Rejects with a timeout error if the promise
 * does not resolve within the specified duration.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`AI naming timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * Attempts to upgrade cluster names in all BenchmarkResults using Joplin's AI Chat API.
 *
 * This function is designed to be called AFTER enrichResultsWithTags() has already
 * populated result.clusterNames with TF-IDF-generated names. If AI naming succeeds,
 * it overwrites those names. If it fails for any reason, the existing TF-IDF names
 * remain untouched.
 *
 * JOPLIN PLUGIN SANDBOX PROXY:
 * We invoke `(joplin as unknown as { ai: JoplinAi }).ai.chat(messages)` directly
 * in a single unchained expression as a defensive practice to prevent proxy path
 * state accumulation across Joplin sandbox runtime versions.
 */
export async function upgradeClusterNamesWithAi(
	results: BenchmarkResult[],
	documents: DocumentText[],
): Promise<boolean> {
	let anyUpgraded = false;
	await Promise.all(
		results.map(async (result) => {
			if (!result.clusterNames || Object.keys(result.clusterNames).length === 0) {
				return;
			}

			try {
				// Build cluster summaries from the assignments and documents
				const clusterIndices: { [clusterId: number]: number[] } = {};
				result.assignments.forEach((clusterId, noteIdx) => {
					if (clusterId !== -1) {
						if (!clusterIndices[clusterId]) {
							clusterIndices[clusterId] = [];
						}
						clusterIndices[clusterId].push(noteIdx);
					}
				});

				const clusterIds = Object.keys(clusterIndices).map(Number);
				if (clusterIds.length === 0) return;

				const summaries: ClusterSummary[] = clusterIds.map((clusterId) => {
					const indices = clusterIndices[clusterId];
					const clusterDocs = indices.map((idx) => documents[idx]);

					// Get representative titles (skip empty/generic titles)
					const sampleTitles = clusterDocs
						.map((doc) => doc.title)
						.filter((t) => t && t.trim().length > 2)
						.slice(0, MAX_TITLES_PER_CLUSTER);

					// Get top TF-IDF keywords from the existing tags
					const topKeywords = (result.tags?.[clusterId] || []).slice(0, MAX_KEYWORDS_PER_CLUSTER);

					return {
						clusterId,
						noteCount: indices.length,
						sampleTitles,
						topKeywords,
					};
				});

				// Skip if no cluster has meaningful titles
				const hasAnyTitles = summaries.some((s) => s.sampleTitles.length > 0);
				if (!hasAnyTitles) {
					log('AI naming skipped for strategy: no meaningful note titles found');
					return;
				}

				const messages = buildNamingPrompt(summaries);
				log(`AI naming: sending prompt with ${summaries.length} clusters to joplin.ai.chat (45s timeout)...`);

				let chatResult: ChatResult | string | undefined;
				try {
					// Single direct chained expression — DO NOT store `const joplinAi = joplin.ai`
					chatResult = await withTimeout(
						(joplin as unknown as { ai: JoplinAi }).ai.chat(messages),
						AI_TIMEOUT_MS,
					);
				} catch (chatErr) {
					const errMsg = chatErr instanceof Error ? chatErr.message : String(chatErr);
					log('AI naming skipped (keeping TF-IDF names):', errMsg);
					return;
				}

				// Joplin Plugin API returns { text: string } (or { message: { content: string } } in legacy mock)
				const responseText =
					typeof chatResult === 'string'
						? chatResult
						: chatResult?.text || chatResult?.message?.content || null;

				if (!responseText) {
					log('AI naming: empty response from chat API, keeping TF-IDF names');
					return;
				}

				log(`AI naming: received response (${responseText.length} chars)`);

				const aiNames = parseAiNamesResponse(responseText, clusterIds);
				if (!aiNames) {
					log('AI naming: failed to parse response, keeping TF-IDF names');
					return;
				}

				// Overwrite TF-IDF names with AI-generated names
				let upgradedCount = 0;
				for (const clusterId of clusterIds) {
					if (aiNames[clusterId]) {
						result.clusterNames![clusterId] = aiNames[clusterId];
						upgradedCount++;
					}
					// If AI didn't provide a name for this cluster, keep the TF-IDF name
				}

				if (upgradedCount > 0) {
					anyUpgraded = true;
				}

				log(`AI naming: upgraded ${upgradedCount}/${clusterIds.length} cluster names`);

				// Resolve name collisions (same logic pattern as postProcess.ts)
				resolveNameCollisions(result.clusterNames!);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logErr('AI naming failed, keeping TF-IDF names:', message);
				// result.clusterNames already has TF-IDF names, so we just continue
			}
		}),
	);

	return anyUpgraded;
}

/**
 * Resolves duplicate cluster names by appending numeric suffixes.
 * Mutates the clusterNames object in-place.
 */
function resolveNameCollisions(clusterNames: { [clusterId: number]: string }): void {
	const nameCounts: { [name: string]: number } = {};
	for (const id of Object.keys(clusterNames)) {
		const name = clusterNames[Number(id)];
		nameCounts[name] = (nameCounts[name] || 0) + 1;
	}

	const usedNames = new Set<string>();
	for (const id of Object.keys(clusterNames)) {
		const clusterId = Number(id);
		const name = clusterNames[clusterId];
		if (nameCounts[name] > 1) {
			let resolved = name;
			if (usedNames.has(resolved)) {
				let suffix = 2;
				while (usedNames.has(`${name} ${suffix}`)) suffix++;
				resolved = `${name} ${suffix}`;
			}
			clusterNames[clusterId] = resolved;
			usedNames.add(resolved);
		} else {
			usedNames.add(name);
		}
	}
}
