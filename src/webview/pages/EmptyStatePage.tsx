import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';

import { NoticeBanner } from '../components/NoticeBanner';

export const EmptyStatePage: React.FC = () => {
	const {
		isRunning,
		runPipeline,
		statusText,
		progress,
		isNativeAiUsed,
		isUndoing,
		undoProgress,
		undoSuccess,
		undoError,
		filterConfig,
		folders,
		setIsFilterModalOpen,
	} = useAppState();
	const [isDismissed, setIsDismissed] = React.useState(false);

	return (
		<div className="page-empty-state">
			<Header
				isRunning={isRunning}
				onRun={() => runPipeline()}
				filterConfig={filterConfig}
				folders={folders}
				onOpenFilterModal={() => setIsFilterModalOpen(true)}
			/>
			{isRunning && !isNativeAiUsed && !isDismissed && (
				<NoticeBanner
					variant="info"
					title="Tip for faster performance"
					message="Using local webview embeddings. Enable Joplin Native AI in Settings for up to 5x faster indexing while keeping data 100% local."
					onClose={() => setIsDismissed(true)}
				/>
			)}
			{!isRunning && isUndoing && (
				<div className="status-banner-apply info" style={{ margin: '12px 16px' }}>
					Reverting changes: {undoProgress.current} / {undoProgress.total} notes processed...
				</div>
			)}
			{!isRunning && undoSuccess && (
				<div className="status-banner-apply success" style={{ margin: '12px 16px' }}>
					Reverted changes successfully!
				</div>
			)}
			{!isRunning && undoError && (
				<div className="status-banner-apply error" style={{ margin: '12px 16px' }}>
					Undo Error: {undoError}
				</div>
			)}
			{isRunning ? <ProgressBar statusText={statusText} progress={progress} /> : <EmptyState />}
		</div>
	);
};
