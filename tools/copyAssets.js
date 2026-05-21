// Copy onnxruntime-web wasm binaries into dist/onnx-dist so the Web Worker
// can load them locally without hitting CSP/CORS issues in Electron.
const fs = require('fs-extra');
const path = require('path');

const possiblePaths = [
	path.join(__dirname, '..', 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
	path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist'),
];

let onnxDistDir = null;
for (const p of possiblePaths) {
	if (fs.existsSync(p)) {
		onnxDistDir = p;
		break;
	}
}

if (!onnxDistDir) {
	console.error('ERROR: Could not find onnxruntime-web dist directory!');
	console.error('Searched:', possiblePaths);
	process.exit(1);
}

const targetDir = path.join(__dirname, '..', 'dist', 'onnx-dist');

// Clean stale files before copying
fs.removeSync(targetDir);
fs.ensureDirSync(targetDir);

// Copy only ONNX runtime files (.wasm + .mjs loaders) to reduce plugin archive size
const runtimeFiles = fs.readdirSync(onnxDistDir).filter(f =>
	f.startsWith('ort-wasm') && (f.endsWith('.wasm') || f.endsWith('.mjs'))
);

console.log(`Copying ${runtimeFiles.length} ONNX runtime files from: ${onnxDistDir}`);
console.log(`                                       to: ${targetDir}`);

for (const file of runtimeFiles) {
	fs.copySync(path.join(onnxDistDir, file), path.join(targetDir, file));
}

console.log(`Done! ${runtimeFiles.length} ONNX runtime files copied to dist/onnx-dist/`);
