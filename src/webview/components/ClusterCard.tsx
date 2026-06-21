import * as React from 'react';
import { PanelNote } from '../../types/panel';

interface ClusterCardProps {
	title: string;
	noteIndices: number[];
	notes: PanelNote[];
	isNoise?: boolean;
}

export const ClusterCard: React.FC<ClusterCardProps> = ({ title, noteIndices, notes, isNoise }) => {
	const [isExpanded, setIsExpanded] = React.useState(false);

	const handleHeaderClick = () => {
		setIsExpanded((prev) => !prev);
	};

	const handleNoteClick = (noteId: string) => {
		webviewApi.postMessage({ type: 'openNote', noteId });
	};

	const count = noteIndices.length;
	const countLabel = count === 1 ? '1 note' : `${count} notes`;

	return (
		<div className={`cluster-card${isNoise ? ' noise' : ''}${isExpanded ? ' expanded' : ''}`}>
			<div className="cluster-header" onClick={handleHeaderClick}>
				<div className="cluster-header-left">
					<span className="cluster-title">{title}</span>
				</div>
				<span className="cluster-count">{countLabel}</span>
				<span className="cluster-chevron"></span>
			</div>
			<div className="cluster-notes">
				{noteIndices.map((idx) => {
					const note = notes[idx];
					if (!note) return null;
					return (
						<div key={note.noteId} className="note-item" onClick={() => handleNoteClick(note.noteId)}>
							<span className="note-title">{note.title || 'Untitled'}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};
