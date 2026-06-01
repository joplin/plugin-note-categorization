# Joplin Note Categorization Plugin

An on-device AI plugin for Joplin that semantically clusters notes, suggests tags and notebook structures, and detects stale/archivable notes.

> [!NOTE]
> This plugin is under active development as part of GSoC 2026. The initial embedding pipeline is implemented; clustering and UI panels are upcoming features.

---

## What the Project is About

When note collections grow, manually organizing them into notebooks and tags becomes tedious. This plugin aims to automate organization in a **local-first and privacy-preserving** way by:
1. **Semantic Embeddings**: Computing dense vector representations of notes on-device.
2. **Clustering & Classification**: Grouping similar notes together and extracting keywords for automatic tags or notebook structures.
3. **Staleness Analysis**: Identifying notes that haven't been edited or linked to recently for archiving.

---

## How It Works (Current Pipeline)

The plugin implements a background-threaded embedding pipeline:
* **Token-Based Chunking**: The plugin reads notes using the Joplin Data API and splits long notes into chunks of **200 tokens** using the `js-tiktoken` tokenizer (`cl100k_base` vocabulary).
* **On-Device Embedding Generation**: A Web Worker uses `@huggingface/transformers` to run the **`Xenova/all-MiniLM-L6-v2`** model. No data ever leaves your machine.
* **Hybrid Device Execution**:
  * **Windows & macOS**: Automatically detects WebGPU support (`navigator.gpu`) and executes the model in **`fp16`** precision (at ~43ms per note).
  * **Linux (Fallback)**: Defaults to running on the CPU using WebAssembly (**`q8`** quantized precision, running ~2x faster than the standard `fp32` CPU baseline).

---

## How to Run & Build

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher)
* [Joplin](https://joplinapp.org/) (for manual plugin installation)

### Installation
Clone the repository and install the development dependencies:
```bash
npm install
```

### Building the Plugin
To compile the source code, pack the Web Worker, and bundle the ONNX runtime WASM assets locally:
```bash
npm run dist
```
This script does the following:
1. Compiles TypeScript source files under `src/` via Webpack.
2. Compiles the Web Worker (`src/worker/embedWorker.ts`) targeting browser-compatible environments.
3. Runs `tools/copyAssets.js` to copy local `onnxruntime-web` WASM files into `dist/onnx-dist/` so Electron can load them offline without triggering Content Security Policy (CSP) violations.
4. Packages everything into a `.jpl` archive in the `publish/` directory.

### Testing the Pipeline
1. Open Joplin.
2. Go to **Settings -> Plugins -> Manage Plugins -> Install from File** and select the `.jpl` package generated in `publish/`.
3. Restart Joplin.
4. Run the debug test from **Tools -> AI Categorise: Test Embedding**. This will index your local notes, run the tokenizer chunking, and output performance metrics directly to your developer tools console.
