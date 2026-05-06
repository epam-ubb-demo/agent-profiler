# Backlog conventions

Agent Profiler uses a simple Epic → Feature → Task hierarchy backed by GitHub Issues and native sub-issues.

## Issue hierarchy

- **Epic**: a broad product or delivery outcome. Epics contain Features as native sub-issues.
- **Feature**: a user-visible capability or coherent slice of value. Features contain Tasks as native sub-issues.
- **Task**: implementation, testing, documentation, infrastructure, or operational work required to complete a Feature.
- **Bug**: a reproducible defect.
- **Spike**: time-boxed research that produces a decision, recommendation, or follow-up issue.

## Labels

Use the repository label inventory as the source of truth: <https://github.com/epam-ubb-demo/agent-profiler/labels>.

Expected label groups:

- `type:*` — issue kind, such as `type:epic`, `type:feature`, `type:task`, `type:bug`, and `type:spike`.
- `area:*` — product, architecture, UI, data, platform, documentation, or operations area.
- `phase:*` — delivery phase labels that map to P0–P6.
- `priority:*` — ordering and urgency.
- `status:*` — current workflow state, such as needs triage or needs spike.
- `community` — community-facing or contributor-focused work.

## Branch naming

- Feature work: `feature/<slug>`
- Releases: `release/x.y.z`
- Hotfixes: `hotfix/<slug>`
- Repository maintenance may use `chore/<slug>` when approved.

Feature and chore branches normally target `develop`. Release and hotfix branches follow GitFlow and must be merged back into the appropriate long-lived branches.

## Commit convention

Use Conventional Commits for every commit and PR title. Examples:

- `feat: add Copilot CLI session importer`
- `fix: prevent timeline crash on empty runs`
- `docs: add ADR for local database schema`
- `chore: bootstrap repository templates`

## PR title format

PR titles must also follow Conventional Commits:

```text
<type>(optional-scope): <short imperative summary>
```

Examples:

- `feat(import): add ctb benchmark parser`
- `test(ui): cover run detail modal states`
- `docs: describe backlog conventions`

## Definition of Done

Every Feature and PR must pass these five gates:

- [ ] Pull Request created
- [ ] Requirements fully met
- [ ] Copilot Review requested and feedback addressed
- [ ] Code review feedback received and no errors remain
- [ ] PR is merged back to `develop` (or `main` for the bootstrap/release PRs)

## Phase mapping

Phases are represented by issue labels:

| Phase | Label | Meaning |
| ----- | ----- | ------- |
| P0 | `phase:p0` | Repository bootstrap, project conventions, and planning foundations. |
| P1 | `phase:p1` | Application scaffold and first runnable local shell. |
| P2 | `phase:p2` | Core ingestion, persistence, and validation workflows. |
| P3 | `phase:p3` | Primary visualisations and analysis experiences. |
| P4 | `phase:p4` | Advanced analytics, filtering, and comparison flows. |
| P5 | `phase:p5` | Packaging, release hardening, and operational readiness. |
| P6 | `phase:p6` | Post-release improvements, extensibility, and community enablement. |
