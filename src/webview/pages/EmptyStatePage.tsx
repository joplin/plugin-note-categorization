import * as React from 'react';
import { useAppState } from '../context/AppStateContext';
import { Header } from '../components/Header';
import { ProgressBar } from '../components/ProgressBar';
import { EmptyState } from '../components/EmptyState';

export const EmptyStatePage: React.FC = () => {
	const { isRunning, runPipeline, statusText, progress } = useAppState();

	return (
		<div className="page-empty-state">
			<Header isRunning={isRunning} onRun={runPipeline} />
			{isRunning ? <ProgressBar statusText={statusText} progress={progress} /> : <EmptyState />}
		</div>
	);
};
