# Contributing to Agent Profiler

Agent Profiler is an Electron, React, and EPAM UUI desktop application for visualising AI coding-agent session logs from Copilot CLI, VS Code Copilot Chat, and ctb benchmark runs. It succeeds the `ctb viz` HTML prototype and will grow through small, reviewed trunk-based changes.

## Local prerequisites

Feature implementation starts in a follow-up PR. Once the application scaffold exists, contributors should use:

- Node.js 20 LTS
- pnpm

Do not add alternative package managers, lockfiles, or framework configuration unless an approved issue explicitly asks for them.

## Branch model

This repository uses a **trunk-based workflow**. There is one long-lived branch: `main`.

- All work happens on short-lived branches off `main`.
- Branches are merged back into `main` via squash-merge with a Conventional Commits title.
- Releases are cut from `main` by tagging `vX.Y.Z`. There are no long-lived release branches.

### Branch naming

| Prefix | Use when | Example |
| ------ | -------- | ------- |
| `feature/<wbs>-<slug>` | Implementing a Feature from the backlog | `feature/f0-1-monorepo-foundation` |
| `fix/<wbs>-<slug>` | Bug fix tied to a backlog issue | `fix/f1-3-timeline-overflow` |
| `chore/<slug>` | Repo plumbing, docs, governance | `chore/trunk-based-workflow` |
| `hotfix/<slug>` | Urgent production fix | `hotfix/cve-2026-xxxx` |

### Hotfix flow

1. Branch from the affected tag: `git checkout -b hotfix/<slug> vX.Y.Z`.
2. Fix and open a PR against `main`.
3. After merge, tag `vX.Y.(Z+1)` on `main`.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add session import workflow`
- `fix: handle empty benchmark timeline`
- `docs: document backlog conventions`
- `chore: update repository templates`

Keep commits focused and explain the reason for non-obvious changes in the body.

## Picking up an issue

1. Choose an issue labelled by type (`type:epic`, `type:feature`, `type:task`, `type:bug`, or `type:spike`) and phase (`phase:p0` through `phase:p6`).
2. Check the requested specialist role: developer, infrastructure, testing, testing-automation, code-quality, tech-writer, business-analyst, release-manager, or onboarding-coach.
3. Comment with your intended approach before starting if the issue is not already assigned.
4. Create a short-lived branch from `main` using the branch naming rules above.

## Pull requests

Open focused PRs against `main` and use squash-merge with a Conventional Commits title.

Every PR must satisfy the Definition of Done from `.github/PULL_REQUEST_TEMPLATE.md`:

- Pull Request created
- Requirements fully met
- Copilot Review requested and feedback addressed
- Code review feedback received and no errors remain
- PR is merged into `main`

Include testing notes, screenshots for UI changes, breaking-change notes, and documentation updates where relevant.

## Questions and discussions

Use [GitHub Discussions](https://github.com/epam-ubb-demo/agent-profiler/discussions) for questions, design proposals, and community coordination. Use the security policy for vulnerability reports instead of public discussions.
