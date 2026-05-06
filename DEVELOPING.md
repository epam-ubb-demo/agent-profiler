# Developing

This guide covers the local development workflow for the **Agent Profiler** monorepo.

## Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node.js | ≥ 20.0.0 | LTS recommended |
| pnpm | ≥ 9.0.0 | Installed via `corepack enable` |
| Git | ≥ 2.40 | For worktree / sparse-checkout support |

### Enabling pnpm via Corepack

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Getting Started

```bash
# Clone the repository
git clone https://github.com/epam-ubb-demo/agent-profiler.git
cd agent-profiler

# Install all dependencies
pnpm install

# Run the full build
pnpm build

# Start development mode
pnpm dev
```

## Workspace Commands

All commands are orchestrated via [Turborepo](https://turbo.build/repo):

| Command | Description |
| ------- | ----------- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start dev servers across the monorepo |
| `pnpm lint` | Lint all workspaces with ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm test` | Run tests with Vitest |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without writing |

### Filtering to a single workspace

```bash
# Run build for a specific package
pnpm --filter @agent-profiler/core build

# Run tests for a specific package
pnpm --filter @agent-profiler/core test
```

## Creating a New Package

1. Create a directory under the appropriate workspace root:
   - `packages/` — shared libraries (domain logic, utilities)
   - `apps/` — deployable applications
   - `tooling/` — internal build/lint/config packages

2. Add a `package.json` with the scope prefix `@agent-profiler/`:

```json
{
  "name": "@agent-profiler/my-package",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --build",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@agent-profiler/tsconfig-base": "workspace:*",
    "typescript": "^5.7.0"
  }
}
```

3. Add a `tsconfig.json` extending the base:

```json
{
  "extends": "../../tooling/tsconfig-base/tsconfig.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```

4. Run `pnpm install` to link the new workspace.

## Running Tests

Tests use [Vitest](https://vitest.dev/). Each package can have its own `vitest.config.ts`:

```bash
# Run all tests
pnpm test

# Run tests in watch mode for a package
pnpm --filter @agent-profiler/core exec vitest
```

## Architecture Boundaries

ESLint enforces layered architecture rules:

- **packages/** must not import from **apps/** (packages are reusable libraries)
- **packages/core** must not import from **packages/ui** (core is UI-agnostic)

These rules are configured in the root `eslint.config.mjs`.
