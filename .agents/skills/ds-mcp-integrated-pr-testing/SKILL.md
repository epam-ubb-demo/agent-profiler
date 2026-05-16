---
description: End-to-end pull request validation workflow with environment deployment checks
license: MIT
---

# MCP Integrated PR Testing

Use this skill for full PR validation that requires environment-level checks.

## Inputs to collect

- PR or issue reference to validate.
- Target non-production environment/stack.
- Image/tag strategy for the validation run.
- Confirmation that live deployment is allowed for the selected environment.

## Workflow (ordered)

- Capture PR and target environment details.
- Build and publish candidate artifacts.
- Deploy to approved non-production environment.
- Validate expected behavior and observability signals.

## Safety checks

- Never deploy to production without explicit confirmation.
- Confirm subscription/environment before any deployment command.
- Avoid leaking secrets in logs or telemetry.

## Completion criteria

- Candidate artifact deployed and health-checked.
- Validation evidence captured (functional + observability when relevant).
- Risks/regressions summarized with follow-up actions.