import type { Config } from 'jest';

const config: Config = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/test'],
	testMatch: ['**/*.test.ts'],
	// Match the project's baseUrl so imports resolve correctly
	moduleDirectories: ['node_modules', '.'],
};

export default config;
