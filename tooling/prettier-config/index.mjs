/**
 * Shared Prettier configuration for the agent-profiler monorepo.
 */

/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  trailingComma: 'all',
  semi: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};

export default config;
