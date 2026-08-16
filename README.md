# Joplin Note Categorization Plugin

A local-first AI plugin for Joplin that clusters notes semantically, suggests tags and notebook structures.

## Features

- **On-Device Embeddings**: Uses `@huggingface/transformers` (`all-MiniLM-L6-v2`) inside a Web Worker. Automatically utilizes WebGPU (`fp16`) on supported platforms (macOS/Windows) with WebAssembly (`q8`) fallback on Linux. Reuses Joplin's native AI search embeddings when available.
- **Clustering Algorithms**:
  - **K-Means**: Automatically determines the optimal number of clusters ($k$) using Silhouette score evaluation.
  - **HDBSCAN**: Density-based clustering to detect natural topic groupings and isolate outlier/noise notes.
  - **UMAP**: Reduces vector dimensionality for consistent distance projection.
- **Topic & Tag Extraction**: Generates cluster titles and tag suggestions using TF-IDF term scoring or generative AI naming.
- **Interactive Panel**: Side-by-side strategy comparison, drag-and-drop note re-assignment between clusters, cluster renaming, and custom category creation.
- **Organization Modes**: Move notes into generated sub-notebooks, apply tags, or both.
- **Undo System**: Full change-tracking log allowing one-click rollback of notebook moves and tag assignments via the panel, Tools menu, or Joplin Settings.

## Demonstration

### Quick Demo

https://github.com/user-attachments/assets/1a0513d1-cbc4-4809-8646-fadeb7e7ffd2

### Full Video Walkthrough
- **YouTube**: [Watch the full walkthrough](https://www.youtube.com/watch?v=kT5uhHgd-B8)

## How It Works

1. **Ingestion & Chunking**: Notes are fetched via the Joplin Data API and split into 200-token chunks with `js-tiktoken` (`cl100k_base`).
2. **Embedding Generation**: Reuses native Joplin AI Search vectors if available, or generates embeddings locally using `all-MiniLM-L6-v2` via WebGPU (`fp16`) or WASM (`q8`). Chunk vectors are combined using mean pooling.
3. **Dimensionality Reduction & Clustering**: Embeddings are projected via UMAP, then clustered using K-Means (Silhouette-optimized auto-$k$) or HDBSCAN (density-based with outlier isolation).
4. **Topic & Tag Extraction**: Cluster names and tags are derived through either generative Joplin AI Naming or offline statistical TF-IDF keyword extraction.
5. **Execution & Rollback**: Reorganizations are reviewed in the interactive panel and applied directly to Joplin notebooks and tags, with full state logging for one-click undo.

## Installation

1. Open Joplin.
2. Go to **Tools -> Options -> Plugins** (or **Joplin -> Preferences -> Plugins** on macOS).
3. Search for **Note Categorization** and click **Install**.
4. Restart Joplin.
