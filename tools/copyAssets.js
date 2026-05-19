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

console.log(`Copying ONNX WASM files from: ${onnxDistDir}`);
console.log(`                         to: ${targetDir}`);

fs.copySync(onnxDistDir, targetDir);
console.log('Done! WASM files copied to dist/onnx-dist/');
