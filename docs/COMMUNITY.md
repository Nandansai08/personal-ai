# Community Guide

How PersonalAI grows its contributor base, organizes discussion, and onboards
new developers.

## Channels

- **GitHub Issues** — bugs, feature requests, well-scoped tasks. Use the
  templates.
- **GitHub Discussions** — open-ended questions, ideas, show-and-tell,
  configuration help. Categories below.
- **Security Advisories** — vulnerability disclosure (private flow on the
  repo).
- **Discord** — *planned for v1.1.* See "Discord" below for the proposed
  structure.

## GitHub Discussions structure

Recommended categories:

| Category | Purpose |
|---|---|
| `Announcements` | Maintainer-only. Releases, breaking changes, surveys. |
| `Q&A` | "How do I…?" with marked answers. |
| `Ideas` | Feature brainstorming before an issue exists. |
| `Show and tell` | Plugins, MCP integrations, custom personas, screenshots. |
| `Help: providers` | Provider-specific setup (Ollama, Anthropic, etc.). |
| `Help: plugins / MCP` | Extension troubleshooting. |
| `Polls` | Roadmap input. |

## Discord structure (planned)

| Channel | Purpose |
|---|---|
| `#welcome` | Code of Conduct, getting-started links, role picker |
| `#announcements` | Maintainer broadcasts |
| `#general` | Off-topic, casual |
| `#help` | Setup and config questions |
| `#plugins` | Plugin/MCP development |
| `#providers` | Per-provider tips |
| `#show-and-tell` | Demos, screenshots, links |
| `#contributors` | PR-in-flight chat, design discussion |
| `#dev-bots` (private) | Webhooks: CI status, releases, new stars |

Roles: `Maintainer`, `Contributor` (merged ≥ 1 PR), `Helper` (self-selected),
`Plugin Author`.

## Contributor growth strategy

### Good first issues

Tag `good first issue` is reserved for issues with all of:

- No new abstractions required
- One or two files touched
- A concrete acceptance criterion in the issue body
- Clear pointer to the relevant file(s) and line(s)
- No platform-specific assumptions

We maintain ≥ 10 open at all times. When the queue drops below 5, the
maintainer's next task is to refill it. See
[`.github/ISSUES_BACKLOG.md`](../.github/ISSUES_BACKLOG.md) for the current
backlog — issues marked `good first issue` are ready to assign.

### Onboarding flow

1. **Land on the README** — `npx @nandansai08/personal-ai` runs in < 2 min.
2. **See first-class plugin docs** — the "Plugins" section invites
   contribution in 30 seconds (drop a folder, get a tool).
3. **Find a labeled issue** — `good first issue`, `documentation`, or
   `help wanted`.
4. **Pair with the CONTRIBUTING checklist** — small, fast, gated by CI.
5. **First-time contributor merged** → moves to `Contributor` role on Discord
   and gets a thank-you in the next release notes.

### Hacktoberfest (October)

- Tag 20 issues `hacktoberfest` at the start of the month.
- Prioritize plugin examples, documentation polish, and provider-specific
  small tasks.
- Set up the `hacktoberfest-accepted` label on the repo so merged PRs count
  even if maintainers don't tag the repo itself.

### Recognition

- All contributors listed in `CONTRIBUTORS.md` (generate via
  `all-contributors` bot or by hand).
- Release notes call out new contributors by `@handle`.
- Plugin authors get a "Plugin Author" badge once their plugin lands in the
  examples or community list.

## Maintainer rhythm

| Cadence | Activity |
|---|---|
| Daily | Triage new issues; reply to discussions within 24h on weekdays. |
| Weekly | Merge queue review; refresh `good first issue` count. |
| Monthly | Release patch (`v1.0.x`); changelog entry; small-roadmap reordering. |
| Quarterly | Minor release (`v1.x.0`); roadmap recap blog post; retrospective. |

## What "good support" looks like

- Acknowledge new issues within 48 h on weekdays.
- Never close an issue without explanation.
- "I don't have bandwidth" is a valid response — say so honestly.
- Boring questions deserve the same effort as interesting ones.
- Maintainers should ship at least one merged PR they did not author each
  week; this is the surest sign the project is alive.
