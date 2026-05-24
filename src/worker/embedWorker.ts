// @ts-ignore
import { pipeline, env } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const MODEL_DTYPE = 'fp32' as const;
const POOLING = 'mean' as const;

// Worker compiles to dist/worker/, WASM files are at dist/onnx-dist/
env.backends.onnx.wasm!.wasmPaths = '../onnx-dist/';

let embedder: any = null;

const loadModel = async () => {
	const t0 = performance.now();

	embedder = await pipeline('feature-extraction', MODEL_ID, {
		dtype: MODEL_DTYPE,
	});

	const loadTime = performance.now() - t0;

	// Warm-up: first inference is always slower due to JIT/WASM setup.
	const tw = performance.now();
	await embedder('warmup text', { pooling: POOLING, normalize: true });
	const warmupTime = performance.now() - tw;

	return { loadTime, warmupTime };
};

const embed = async (text: string) => {
	if (!embedder) throw new Error('Model not loaded');

	const t0 = performance.now();
	const output = await embedder(text, { pooling: POOLING, normalize: true });
	const inferenceTime = performance.now() - t0;
	const dimensions = output.data.length;
	const embedding = Array.from(output.data as Float32Array);

	return { inferenceTime, dimensions, embedding };
};

self.addEventListener('message', async (event) => {
	const { type } = event.data;

	if (type === 'load') {
		try {
			const result = await loadModel();
			postMessage({ type: 'load-result', success: true, ...result });
		} catch (e: any) {
			postMessage({ type: 'load-result', success: false, error: String(e) });
		}
	}

	if (type === 'embed') {
		try {
			const result = await embed(event.data.text);
			postMessage({
				type: 'embed-result',
				noteId: event.data.noteId,
				success: true,
				...result,
			});
		} catch (e: any) {
			postMessage({
				type: 'embed-result',
				noteId: event.data.noteId,
				success: false,
				error: String(e),
			});
		}
	}
});
