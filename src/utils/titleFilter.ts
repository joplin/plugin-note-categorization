const GENERIC_PATTERNS: RegExp[] = [
	/^untitled$/i,
	/^new\s+note$/i,
	/^note\s*\d*$/i,
	/^todo$/i,
	/^draft$/i,
	/^temp$/i,
	/^test$/i,
	/^copy\s+of\b/i,
	/^_+$/,
];

export const isGenericTitle = (title: string): boolean => {
	const trimmed = title.trim();
	if (trimmed.length === 0) return true;
	if (trimmed.length <= 2) return true;
	return GENERIC_PATTERNS.some((p) => p.test(trimmed));
};
