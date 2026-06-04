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
