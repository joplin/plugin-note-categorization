import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';

import { NoticeBanner } from '../components/NoticeBanner';

export const EmptyStatePage: React.FC = () => {
	const { isRunning, runPipeline, statusText, progress, isNativeAiUsed } = useAppState();
	const [isDismissed, setIsDismissed] = React.useState(false);

	return (
		<div className="page-empty-state">
			<Header isRunning={isRunning} onRun={runPipeline} />
			{isRunning && !isNativeAiUsed && !isDismissed && (
				<NoticeBanner
					variant="info"
					title="Tip for faster performance"
					message="Using local webview embeddings. Enable Joplin Native AI in Settings for up to 5x faster indexing while keeping data 100% local."
					onClose={() => setIsDismissed(true)}
				/>
			)}
			{isRunning ? <ProgressBar statusText={statusText} progress={progress} /> : <EmptyState />}
		</div>
	);
};
