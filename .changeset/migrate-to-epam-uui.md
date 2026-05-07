---
'@agent-profiler/desktop': minor
'@agent-profiler/ui': minor
---

Migrate all UI components to EPAM UUI with Loveship skin.

- Add EPAM-branded application shell with header, logo, and navigation
- Add dark/light theme toggle with localStorage persistence
- Replace all inline styles and hardcoded colours with UUI components and CSS variables
- Migrate shared UI package (timeline, fanout, panels, settings, annotations, comparative)
- Replace shadcn Button, Card, Dialog with UUI equivalents
- Remove Tailwind CSS, Radix UI, and lucide-react dependencies
