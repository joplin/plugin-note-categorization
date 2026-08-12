import * as React from 'react';

interface NoticeBannerProps {
	variant?: 'info' | 'warning';
	title: string;
	message: string;
	onClose?: () => void;
}

export const NoticeBanner: React.FC<NoticeBannerProps> = ({ variant = 'info', title, message, onClose }) => {
	return (
		<div className={`notice-banner ${variant}`}>
			<div className="notice-icon">
				{variant === 'info' ? (
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M9 18h6" />
						<path d="M10 22h4" />
						<path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
					</svg>
				) : (
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="16" x2="12" y2="12" />
						<line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2.5" />
					</svg>
				)}
			</div>
			<div className="notice-content">
				<strong>{title}</strong>: {message}
			</div>
			{onClose && (
				<button className="notice-close-btn" onClick={onClose} aria-label="Dismiss notice" title="Dismiss">
					<svg
						width="11"
						height="11"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			)}
		</div>
	);
};
