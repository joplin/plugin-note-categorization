import { isGenericTitle } from '../../src/utils/titleFilter';

describe('isGenericTitle', () => {
	// Each of these exercises a different branch in the function

	it.each([
		['', 'empty string'],
		['  ', 'whitespace only (trims to empty)'],
		['a', 'single char (length <= 2)'],
		['ab', 'two chars (length <= 2)'],
		['Untitled', 'matches /^untitled$/i'],
		['UNTITLED', 'case insensitive untitled'],
		['New Note', 'matches /^new\\s+note$/i'],
		['Note', 'matches /^note\\s*\\d*$/i with no digits'],
		['Note 42', 'matches /^note\\s*\\d*$/i with digits'],
		['Note3', 'matches /^note\\s*\\d*$/i, no space before digit'],
		['Todo', 'matches /^todo$/i'],
		['Draft', 'matches /^draft$/i'],
		['Temp', 'matches /^temp$/i'],
		['Test', 'matches /^test$/i'],
		['Copy of My Document', 'matches /^copy\\s+of\\b/i'],
		['___', 'matches /^_+$/'],
	])('returns true for %s (%s)', (title) => {
		expect(isGenericTitle(title)).toBe(true);
	});

	it.each([
		['Meeting Notes Jan 2024', 'substantive title'],
		['Kubernetes Setup Guide', 'technical title'],
		['abc', 'length 3, no pattern match'],
		['Testing React Hooks', '"Testing" != exact "Test"'],
		['My Draft Plan', 'contains "Draft" but not exactly'],
		['Notable Ideas', 'starts with "Not" not "Note"'],
		['Untitled Document', '"Untitled Document" != exact "Untitled"'],
	])('returns false for %s (%s)', (title) => {
		expect(isGenericTitle(title)).toBe(false);
	});
});
