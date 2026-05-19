import { fetchAllNotes } from '../pipeline/noteReader';
import { log, logErr } from '../utils/logger';

export const runTestEmbed = async (installDir: string) => {
	log('Test embed command triggered');

	const notes = await fetchAllNotes();
	log(`Fetched ${notes.length} notes`);

	if (notes.length === 0) {
		log('No notes found. Create some notes and try again.');
		return;
	}

	const testNote = notes[0];
	const textToEmbed = testNote.body.length > 0 ? testNote.body.slice(0, 2000) : testNote.title;
	log(`Embedding note: "${testNote.title}" (${textToEmbed.length} chars)`);

	const worker = new Worker(`${installDir}/worker/embedWorker.js`);

	worker.onerror = (err) => {
		logErr('Worker error:', err.message || err);
	};

	worker.onmessage = async (event) => {
		const data = event.data;

		if (data.type === 'load-result') {
			if (data.success) {
				log(`Model loaded in ${(data.loadTime / 1000).toFixed(1)}s, warmup: ${Math.round(data.warmupTime)}ms`);

				worker.postMessage({
					type: 'embed',
					text: textToEmbed,
					noteId: testNote.id,
				});
			} else {
				logErr('Model load failed:', data.error);
				worker.terminate();
			}
			return;
		}

		if (data.type === 'embed-result') {
			if (data.success) {
				log(`Embedding complete for "${testNote.title}"`);
				log(`  Dimensions: ${data.dimensions}`);
				log(`  Inference time: ${Math.round(data.inferenceTime)}ms`);
				log(`  First 5 values: [${data.embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}]`);
			} else {
				logErr('Embed failed:', data.error);
			}
			worker.terminate();
			log('Worker terminated. Test complete.');
		}
	};

	log('Loading model...');
	worker.postMessage({ type: 'load' });
};
