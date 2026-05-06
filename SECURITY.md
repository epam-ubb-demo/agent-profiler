# Security Policy

## Supported versions

Agent Profiler is in early bootstrap. Until the first tagged release, security fixes are applied to the protected release branch only.

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Email `security@example.com` with a clear description of the issue, affected component, reproduction steps, and any supporting evidence. This is a placeholder address and will be replaced by the maintainers before the project accepts external vulnerability reports.

We aim to acknowledge reports within **5 business days**. We will then work with the reporter to validate the issue, agree on disclosure timing, and coordinate remediation. PGP encryption is optional; maintainers will publish a project key in a follow-up update if encrypted reports are required.

## Scope

In scope:

- The Agent Profiler Electron desktop application.
- The future Agent Profiler API surface, including planned Node, Fastify, and tRPC services.
- Project-owned IPC, persistence, import, and visualisation logic.

Out of scope:

- Third-party dependencies and platforms. Please report those vulnerabilities upstream first, then open a non-sensitive tracking issue here if Agent Profiler needs an upgrade or mitigation.
- Social engineering, denial-of-service testing, or physical attacks.
- Findings that require access to secrets, private data, or systems without authorisation.
