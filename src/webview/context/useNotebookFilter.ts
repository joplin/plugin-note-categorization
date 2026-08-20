import * as React from 'react';
import { DEFAULT_NOTEBOOK_FILTER, FolderItem, NotebookFilterConfig } from '../../types/notebook';

interface FilterConfigResponse {
	filterConfig?: NotebookFilterConfig;
}

interface NotebooksResponse {
	folders?: FolderItem[];
	folderTree?: FolderItem[];
	counts?: { [folderId: string]: number };
}

export function useNotebookFilter() {
	const [filterConfig, setFilterConfig] = React.useState<NotebookFilterConfig>(DEFAULT_NOTEBOOK_FILTER);
	const [folders, setFolders] = React.useState<FolderItem[]>([]);
	const [folderTree, setFolderTree] = React.useState<FolderItem[]>([]);
	const [counts, setCounts] = React.useState<{ [folderId: string]: number }>({});
	const [isFilterModalOpen, setIsFilterModalOpen] = React.useState(false);
	const [isLoadingNotebooks, setIsLoadingNotebooks] = React.useState(false);

	const fetchNotebooksAndFilter = React.useCallback(async () => {
		if (typeof webviewApi === 'undefined') return;
		setIsLoadingNotebooks(true);
		try {
			const [filterRes, notebooksRes] = await Promise.all([
				webviewApi.postMessage<FilterConfigResponse>({ type: 'getFilterConfig' }),
				webviewApi.postMessage<NotebooksResponse>({ type: 'getNotebooks' }),
			]);

			if (filterRes && filterRes.filterConfig) {
				setFilterConfig(filterRes.filterConfig);
			}
			if (notebooksRes) {
				setFolders(notebooksRes.folders || []);
				setFolderTree(notebooksRes.folderTree || []);
				setCounts(notebooksRes.counts || {});
			}
		} catch (err) {
			console.error('Error fetching notebooks or filter:', err);
		} finally {
			setIsLoadingNotebooks(false);
		}
	}, []);

	const saveFilter = React.useCallback(async (newConfig: NotebookFilterConfig) => {
		setFilterConfig(newConfig);
		if (typeof webviewApi !== 'undefined') {
			try {
				await webviewApi.postMessage({
					type: 'saveFilterConfig',
					filterConfig: newConfig,
				});
			} catch (err) {
				console.error('Error saving filter config:', err);
			}
		}
	}, []);

	React.useEffect(() => {
		fetchNotebooksAndFilter();
	}, [fetchNotebooksAndFilter]);

	return {
		filterConfig,
		setFilterConfig,
		folders,
		folderTree,
		counts,
		isFilterModalOpen,
		setIsFilterModalOpen,
		isLoadingNotebooks,
		fetchNotebooksAndFilter,
		saveFilter,
	};
}
