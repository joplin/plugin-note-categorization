import { UMAP } from 'umap-js';
import { log } from '../utils/logger';

export interface UmapProjectorOptions {
	/** Number of dimensions in the output (default: 2) */
	nComponents?: number;
	/** Number of nearest neighbors for manifold approximation (default: 15) */
	nNeighbors?: number;
	/** Minimum distance between points in output space (default: 0.1) */
	minDist?: number;
	/** Distance metric: 'cosine' or 'euclidean' (default: 'cosine') */
	metric?: 'cosine' | 'euclidean';
	/** Seed for reproducible results (default: 42) */
	seed?: number;
}

/**
 * Mulberry32: a fast, seedable 32-bit PRNG.
 * Returns a function that produces deterministic values in [0, 1).
 * Used instead of Math.random() so UMAP projections are reproducible.
 */
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function cosineDistance(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 1;
	return 1 - dot / denom;
}

function euclideanDistance(a: number[], b: number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

export class UmapProjector {
	private readonly nComponents: number;
	private readonly nNeighbors: number;
	private readonly minDist: number;
	private readonly metric: 'cosine' | 'euclidean';
	private readonly seed: number;

	constructor(options: UmapProjectorOptions = {}) {
		this.nComponents = options.nComponents ?? 2;
		this.nNeighbors = options.nNeighbors ?? 15;
		this.minDist = options.minDist ?? 0.1;
		this.metric = options.metric ?? 'cosine';
		this.seed = options.seed ?? 42;
	}

	/**
	 * Projects high-dimensional vectors to a lower-dimensional space using UMAP.
	 * @param vectors N vectors of dimension D (N x D)
	 * @returns N vectors of dimension nComponents
	 */
	public project(vectors: number[][]): number[][] {
		if (vectors.length === 0) return [];

		const dim = vectors[0].length;
		for (let i = 0; i < vectors.length; i++) {
			if (vectors[i].length !== dim) {
				throw new Error(`Vector at index ${i} has dimension ${vectors[i].length}, expected ${dim}`);
			}
		}

		// UMAP needs more points than output dimensions to be meaningful
		if (vectors.length <= this.nComponents) {
			log(`Too few vectors (${vectors.length}) for ${this.nComponents}D projection, padding with zeros.`);
			return vectors.map((vec) => {
				const out = vec.slice(0, this.nComponents);
				while (out.length < this.nComponents) out.push(0);
				return out;
			});
		}

		// nNeighbors must be less than the number of data points
		const nNeighbors = Math.max(2, Math.min(this.nNeighbors, vectors.length - 1));
		const distanceFn = this.metric === 'euclidean' ? euclideanDistance : cosineDistance;

		const umap = new UMAP({
			nComponents: this.nComponents,
			nNeighbors,
			minDist: this.minDist,
			distanceFn,
			random: mulberry32(this.seed),
		});

		log(
			`UMAP: projecting ${vectors.length} vectors (${dim}D → ${this.nComponents}D), ` +
				`neighbors=${nNeighbors}, seed=${this.seed}`,
		);

		return umap.fit(vectors);
	}
}
