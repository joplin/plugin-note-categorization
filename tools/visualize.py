import os
import json
import matplotlib.pyplot as plt

def main():
	json_path = 'clustering_results.json'
	if not os.path.exists(json_path):
		print(f"Error: {json_path} not found. Please run the Joplin embedding test command first.")
		return

	with open(json_path, 'r', encoding='utf-8') as f:
		data = json.load(f)

	notes = data.get('notes', [])
	strategies = data.get('strategies', [])

	if not notes:
		print("Error: No note data found in the JSON file.")
		return

	# Extract coordinates and titles
	x_coords = [note['coords'][0] for note in notes]
	y_coords = [note['coords'][1] for note in notes]
	titles = [note['title'] for note in notes]

	# Create output directory for plots
	output_dir = os.path.join('tools', 'plots')
	os.makedirs(output_dir, exist_ok=True)

	# Use a clean, modern style if available
	plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')

	for strategy in strategies:
		name = strategy['name']
		assignments = strategy['assignments']
		score = strategy.get('silhouetteScore', 0.0)

		# Size of plot (10x8 inches at 150 DPI)
		plt.figure(figsize=(10, 8), dpi=150)
		
		# Find unique cluster IDs
		unique_clusters = sorted(list(set(assignments)))
		num_clusters = len([c for c in unique_clusters if c >= 0])
		
		# Set up a colormap for distinct cluster colors
		cmap = plt.get_cmap('tab10', max(10, num_clusters))
		
		for cluster_id in unique_clusters:
			# Get indices belonging to the current cluster
			mask = [i for i, c in enumerate(assignments) if c == cluster_id]
			cx = [x_coords[i] for i in mask]
			cy = [y_coords[i] for i in mask]
			
			if cluster_id == -1:
				# Noise/Outliers: grey, cross marker
				plt.scatter(cx, cy, color='#888888', label='Noise/Outliers', alpha=0.6, s=50, marker='x')
			else:
				color = cmap(cluster_id % 10)
				plt.scatter(cx, cy, color=color, label=f'Cluster {cluster_id}', alpha=0.8, s=80, marker='o', edgecolors='none')

		# Annotate points with note titles
		for i, title in enumerate(titles):
			# Truncate title for readability if it is very long
			short_title = title[:15] + '...' if len(title) > 18 else title
			plt.annotate(
				short_title,
				(x_coords[i], y_coords[i]),
				xytext=(5, 5),
				textcoords='offset points',
				fontsize=8,
				alpha=0.75,
				bbox=dict(boxstyle='round,pad=0.1', fc='yellow', alpha=0.2, ec='none')
			)

		plt.title(f"{name} (Silhouette Score: {score:.4f})", fontsize=14, fontweight='bold')
		plt.xlabel("UMAP 1", fontsize=10)
		plt.ylabel("UMAP 2", fontsize=10)
		plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left', frameon=True)
		plt.tight_layout()

		# Save plot as PNG
		output_file = os.path.join(output_dir, f"{name}.png")
		plt.savefig(output_file, bbox_inches='tight')
		plt.close()
		print(f"Saved plot: {output_file}")

if __name__ == '__main__':
	main()
