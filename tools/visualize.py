import os
import json
import plotly.graph_objects as go

def main():
	json_path = 'clustering_results.json'
	if not os.path.exists(json_path):
		print(f'Error: {json_path} not found. Please run the Joplin embedding test command first.')
		return

	with open(json_path, 'r', encoding='utf-8') as f:
		data = json.load(f)

	notes = data.get('notes', [])
	strategies = data.get('strategies', [])

	if not notes:
		print('Error: No note data found in the JSON file.')
		return

	# Validate that coords are 3D
	if notes and len(notes[0].get('coords', [])) != 3:
		print('Error: Expected 3D coordinates (nComponents=3). Re-run the Joplin embedding command.')
		return

	x_coords = [note['coords'][0] for note in notes]
	y_coords = [note['coords'][1] for note in notes]
	z_coords = [note['coords'][2] for note in notes]
	titles = [note['title'] for note in notes]

	# Create output directory
	output_dir = os.path.join('tools', 'plots')
	os.makedirs(output_dir, exist_ok=True)

	# Distinct colors for up to 20 clusters
	CLUSTER_COLORS = [
		'#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
		'#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
		'#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
		'#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
	]
	NOISE_COLOR = '#aaaaaa'

	for strategy in strategies:
		name = strategy['name']
		assignments = strategy['assignments']
		score = strategy.get('silhouetteScore', 0.0)

		unique_clusters = sorted(set(assignments))
		traces = []

		for cluster_id in unique_clusters:
			mask = [i for i, c in enumerate(assignments) if c == cluster_id]
			cx = [x_coords[i] for i in mask]
			cy = [y_coords[i] for i in mask]
			cz = [z_coords[i] for i in mask]
			# Truncate title for hover text readability
			hover = [titles[i][:60] + ('...' if len(titles[i]) > 60 else '') for i in mask]

			if cluster_id == -1:
				label = 'Noise/Outliers'
				color = NOISE_COLOR
				symbol = 'x'
				opacity = 0.5
			else:
				label = f'Cluster {cluster_id}'
				color = CLUSTER_COLORS[cluster_id % len(CLUSTER_COLORS)]
				symbol = 'circle'
				opacity = 0.85

			traces.append(go.Scatter3d(
				x=cx,
				y=cy,
				z=cz,
				mode='markers+text',
				name=label,
				text=hover,
				textposition='top center',
				textfont=dict(size=9),
				hovertemplate='<b>%{text}</b><extra>' + label + '</extra>',
				marker=dict(
					size=7,
					color=color,
					symbol=symbol,
					opacity=opacity,
					line=dict(width=0.5, color='white'),
				),
			))

		fig = go.Figure(data=traces)
		fig.update_layout(
			title=dict(
				text=f'{name} — Silhouette: {score:.4f}',
				font=dict(size=16),
			),
			scene=dict(
				xaxis_title='UMAP 1',
				yaxis_title='UMAP 2',
				zaxis_title='UMAP 3',
				bgcolor='#f8f9fa',
			),
			legend=dict(
				title='Clusters',
				font=dict(size=11),
			),
			margin=dict(l=0, r=0, b=0, t=50),
			paper_bgcolor='white',
		)

		output_file = os.path.join(output_dir, f'{name}.html')
		fig.write_html(output_file, include_plotlyjs='cdn')
		print(f'Saved interactive plot: {output_file}')

if __name__ == '__main__':
	main()
