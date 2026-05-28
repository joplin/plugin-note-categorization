// @ts-ignore
import { pipeline, env } from '@huggingface/transformers';

// TypeScript doesn't include WebGPU types by default.
// Minimal interface to avoid casting navigator as `any`.
interface NavigatorGPU {
	gpu: { requestAdapter(): Promise<object | null> };
}

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const POOLING = 'mean' as const;

// Worker compiles to dist/worker/, WASM files are at dist/onnx-dist/
env.backends.onnx.wasm!.wasmPaths = '../onnx-dist/';

let embedder: any = null;

const loadModel = async () => {
	const t0 = performance.now();

	let selectedDevice: any = 'wasm';
	let selectedDtype: any = 'q8';
	let workerGpuExists = false;
	let adapterFound = false;

	try {
		if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
			workerGpuExists = true;
			const adapter = await (navigator as unknown as NavigatorGPU).gpu.requestAdapter();
			if (adapter) {
				adapterFound = true;
				selectedDevice = 'webgpu';
				selectedDtype = 'fp16';
			}
		}
	} catch (e) {
		console.warn('WebGPU detection failed, falling back to WASM:', e);
	}

	// Try loading with the selected device/dtype, fallback to wasm/q8 if it fails
	try {
		embedder = await pipeline('feature-extraction', MODEL_ID, {
			dtype: selectedDtype,
			device: selectedDevice,
		});
		await embedder('warmup text', { pooling: POOLING, normalize: true });
	} catch (e) {
		if (selectedDevice === 'webgpu') {
			// WebGPU pipeline or warmup failed, retry with WASM/q8
			selectedDevice = 'wasm';
			selectedDtype = 'q8';
			embedder = await pipeline('feature-extraction', MODEL_ID, {
				dtype: selectedDtype,
				device: selectedDevice,
			});
			await embedder('warmup text', { pooling: POOLING, normalize: true });
		} else {
			throw e;
		}
	}

	const loadTime = performance.now() - t0;

	return {
		loadTime,
		device: selectedDevice,
		dtype: selectedDtype,
		workerGpuExists,
		isWebGpuAvailable: adapterFound,
	};
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
