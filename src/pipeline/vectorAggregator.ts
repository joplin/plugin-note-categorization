const normalise = (vec: number[]): number[] => {
	const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
	if (norm === 0) return vec;
	return vec.map((v) => v / norm);
};

/**
 * Element-wise mean of one or more vectors, then L2-normalised.
 * Used to collapse chunk embeddings into a single body vector.
 */
export const averageVectors = (vectors: number[][]): number[] => {
	if (vectors.length === 0) throw new Error('Cannot average zero vectors');
	const dim = vectors[0].length;
	for (const vec of vectors) {
		if (vec.length !== dim) throw new Error('Cannot average vectors of different dimensions');
	}
	if (vectors.length === 1) return normalise(vectors[0]);

	const avg = new Array<number>(dim).fill(0);
	for (const vec of vectors) {
		for (let i = 0; i < dim; i++) {
			avg[i] += vec[i];
		}
	}
	for (let i = 0; i < dim; i++) {
		avg[i] /= vectors.length;
	}
	return normalise(avg);
};

export interface WeightedPoolingOptions {
	lambda?: number;
	leadBoost?: number;
}

export interface WeightedAverageResult {
	vector: number[];
	rawNorm: number;
}

/**
 * Element-wise weighted average of chunk vectors using exponential position decay
 * with a lead-chunk boost, returning both the L2-normalised vector and the raw pre-normalisation norm.
 *
 * w_i = (leadBoost + exp(-lambda * i)) if i == 0 else exp(-lambda * i)
 */
export const weightedAverageVectorsWithNorm = (
	vectors: number[][],
	options: WeightedPoolingOptions = {},
): WeightedAverageResult => {
	if (vectors.length === 0) throw new Error('Cannot average zero vectors');
	const dim = vectors[0].length;
	for (const vec of vectors) {
		if (vec.length !== dim) throw new Error('Cannot average vectors of different dimensions');
	}
	if (vectors.length === 1) {
		const rawNorm = Math.sqrt(vectors[0].reduce((sum, v) => sum + v * v, 0));
		const vector = rawNorm === 0 ? vectors[0] : vectors[0].map((v) => v / rawNorm);
		return { vector, rawNorm };
	}

	const lambda = options.lambda ?? 0.15;
	const leadBoost = options.leadBoost ?? 0.5;

	const weights: number[] = new Array(vectors.length);
	let weightSum = 0;

	for (let i = 0; i < vectors.length; i++) {
		const w = Math.exp(-lambda * i) + (i === 0 ? leadBoost : 0);
		weights[i] = w;
		weightSum += w;
	}

	const weightedSum = new Array<number>(dim).fill(0);
	for (let i = 0; i < vectors.length; i++) {
		const normW = weights[i] / weightSum;
		const vec = vectors[i];
		for (let d = 0; d < dim; d++) {
			weightedSum[d] += normW * vec[d];
		}
	}

	const rawNorm = Math.sqrt(weightedSum.reduce((sum, v) => sum + v * v, 0));
	const vector = rawNorm === 0 ? weightedSum : weightedSum.map((v) => v / rawNorm);

	return { vector, rawNorm };
};

/**
 * Element-wise weighted average of chunk vectors using exponential position decay
 * with a lead-chunk boost, then L2-normalised.
 */
export const weightedAverageVectors = (vectors: number[][], options: WeightedPoolingOptions = {}): number[] => {
	return weightedAverageVectorsWithNorm(vectors, options).vector;
};

/**
 * Cosine similarity between two L2-normalised vectors (= dot product).
 */
export const cosineSimilarity = (a: number[], b: number[]): number => {
	if (a.length !== b.length) throw new Error('Cannot compute cosine similarity for vectors of different dimensions');
	let dot = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
	}
	return dot;
};

/**
 * Maps cosine similarity to a title weight in [0, maxWeight].
 * Negative similarity (title contradicts body) → 0.
 * Perfect alignment (similarity = 1) → maxWeight.
 */
export const computeTitleWeight = (similarity: number, maxWeight = 0.3): number => {
	return Math.min(1, Math.max(0, similarity)) * maxWeight;
};

/**
 * Weighted blend of body and title vectors, then L2-normalised.
 * final = normalise((1 - alpha) * body + alpha * title)
 */
export const blendVectors = (body: number[], title: number[], alpha: number): number[] => {
	if (body.length !== title.length) throw new Error('Cannot blend vectors of different dimensions');
	const dim = body.length;
	const blended = new Array<number>(dim);
	for (let i = 0; i < dim; i++) {
		blended[i] = (1 - alpha) * body[i] + alpha * title[i];
	}
	return normalise(blended);
};

/**
 * Computes a weighted average of chunk vectors where chunk 0 (which contains the title)
 * is given a higher weight (default: 3.0) to prevent dilution.
 */
export const averageChunksWeighted = (
	chunks: { chunkIndex: number; vector: number[] }[],
	titleWeight = 3.0,
): number[] => {
	if (chunks.length === 0) throw new Error('Cannot average zero chunks');
	const dim = chunks[0].vector.length;
	for (const chunk of chunks) {
		if (chunk.vector.length !== dim) throw new Error('Cannot average vectors of different dimensions');
	}
	if (chunks.length === 1) {
		return normalise(chunks[0].vector);
	}

	const sum = new Array<number>(dim).fill(0);
	let totalWeight = 0;
	for (const chunk of chunks) {
		const weight = chunk.chunkIndex === 0 ? titleWeight : 1.0;
		totalWeight += weight;
		for (let i = 0; i < dim; i++) {
			sum[i] += chunk.vector[i] * weight;
		}
	}
	for (let i = 0; i < dim; i++) {
		sum[i] /= totalWeight;
	}

	return normalise(sum);
};
