import * as React from 'react';
import { PanelNote } from '../../types/panel';

interface ClusterCardProps {
	title: string;
	noteIndices: number[];
	notes: PanelNote[];
	isNoise?: boolean;
	tags?: string[];
	onRename?: (newName: string) => void;
	onNoteDrop?: (noteIndex: number) => void;
}

export const ClusterCard: React.FC<ClusterCardProps> = ({
	title,
	noteIndices,
	notes,
	isNoise,
	tags,
	onRename,
	onNoteDrop,
}) => {
	const [isExpanded, setIsExpanded] = React.useState(false);
	const [isEditing, setIsEditing] = React.useState(false);
	const [editValue, setEditValue] = React.useState(title);
	const [isDragOver, setIsDragOver] = React.useState(false);

	React.useEffect(() => {
		setEditValue(title);
	}, [title]);

	const handleHeaderClick = () => {
		setIsExpanded((prev) => !prev);
	};

	const handleEditClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsEditing(true);
	};

	const handleSave = (e?: React.FormEvent | React.FocusEvent) => {
		if (e) {
			e.stopPropagation();
			if ('preventDefault' in e) e.preventDefault();
		}
		const trimmed = editValue.trim();
		if (trimmed && trimmed !== title && onRename) {
			onRename(trimmed);
		}
		setIsEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		e.stopPropagation();
		if (e.key === 'Enter') {
			handleSave();
		} else if (e.key === 'Escape') {
			setEditValue(title);
			setIsEditing(false);
		}
	};

	const handleNoteClick = (noteId: string) => {
		webviewApi.postMessage({ type: 'openNote', noteId });
	};

	const count = noteIndices.length;
	const countLabel = count === 1 ? '1 note' : `${count} notes`;

	return (
		<div
			className={`cluster-card${isNoise ? ' noise' : ''}${isExpanded ? ' expanded' : ''}${isDragOver ? ' drag-over' : ''}`}
			onDragOver={(e) => {
				e.preventDefault();
			}}
			onDragEnter={(e) => {
				e.preventDefault();
				setIsDragOver(true);
			}}
			onDragLeave={() => {
				setIsDragOver(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				setIsDragOver(false);
				const noteIndexStr = e.dataTransfer.getData('text/plain');
				if (noteIndexStr) {
					const noteIndex = parseInt(noteIndexStr, 10);
					if (!isNaN(noteIndex) && onNoteDrop) {
						onNoteDrop(noteIndex);
					}
				}
			}}
		>
			<div className="cluster-header" onClick={handleHeaderClick}>
				<div className="cluster-header-left">
					{isEditing ? (
						<input
							type="text"
							className="cluster-title-input"
							value={editValue}
							onChange={(e) => setEditValue(e.target.value)}
							onBlur={handleSave}
							onKeyDown={handleKeyDown}
							onClick={(e) => e.stopPropagation()}
							autoFocus
						/>
					) : (
						<div className="cluster-title-container">
							<span className="cluster-title">{title}</span>
							{!isNoise && onRename && (
								<button className="cluster-edit-btn" onClick={handleEditClick} title="Rename category">
									<svg
										width="11"
										height="11"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.0"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<path d="M12 20h9" />
										<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
									</svg>
								</button>
							)}
						</div>
					)}
					{tags && tags.length > 0 && (
						<div className="cluster-tags">
							{tags.map((tag, idx) => (
								<span key={`${tag}-${idx}`} className="cluster-tag">
									#{tag}
								</span>
							))}
						</div>
					)}
				</div>
				<span className="cluster-count">{countLabel}</span>
				<span className="cluster-chevron"></span>
			</div>
			<div className="cluster-notes">
				{noteIndices.map((idx) => {
					const note = notes[idx];
					if (!note) return null;
					return (
						<div
							key={note.noteId}
							className="note-item"
							onClick={() => handleNoteClick(note.noteId)}
							draggable="true"
							onDragStart={(e) => {
								e.dataTransfer.setData('text/plain', idx.toString());
							}}
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								style={{ opacity: 0.6, flexShrink: 0 }}
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
							</svg>
							<span className="note-title">{note.title || 'Untitled'}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};
