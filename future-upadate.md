# Future updates and maintainer notes

This is the shared place for the owner's ideas and suggested improvements. Items below are **not implemented or scheduled merely because they appear here**. Choose a small scope, develop it on a branch, verify it, and merge it through a reviewed pull request.

## Is the app finished?

**Version 1 is released and usable for its current scope.** It is a frontend-only flashcard app, not an unfinished backend service. Studying does not require the maintainer's computer, a local development server, or a user account.

- [Live study site](https://parama-guru.github.io/concept-grove/)
- [Public source repository](https://github.com/Parama-Guru/concept-grove)
- [Published v1.0.0 release](https://github.com/Parama-Guru/concept-grove/releases/tag/v1.0.0)

### Verified baseline — September 6, 2026

At [maintenance commit cdd6e7a](https://github.com/Parama-Guru/concept-grove/commit/cdd6e7ad9ee67e46d762af95b8fa78cd75a81e71):

- 600 original cards, equally split across machine learning, deep learning, and NLP.
- Study queues, ratings, bookmarks, search/filtering, progress statistics, backup/import, dark/light/system appearance, and accessible keyboard controls.
- Local verification passed **180 unit/content tests and 64 browser tests**; the dependency audit reported **zero known advisories at that time**.
- The [Linux build and Pages deployment](https://github.com/Parama-Guru/concept-grove/actions/runs/34040465760) succeeded. Live desktop/mobile checks also passed.
- A disposable browser profile retained 100 synthetic reviewed cards, bookmarks, activity, preferences, and theme across tab closure, full Chromium restarts, and redeployment. No real user's profile was used; a physical computer shutdown was not tested.
- A compatibility check retained old progress after adding 21 synthetic valid card IDs. This tested decoding with an expanded ID set, not publication of new cards.

These are dated results, not a promise of zero bugs, perfect security, every-browser compatibility, or search ranking. Repeat verification for later changes. The current view, card position, filters, and revealed answer are transient; there is no cloud sync, automatic study-state conflict merging between tabs, or guaranteed offline reload. See [README.md](README.md#privacy-storage-and-backups).

## Naming: Concept Grove or Grove?

**Concept Grove** is the full v1 brand; **grove.** is its short wordmark; `concept-grove` is the repository/package slug. “Concept” describes the learning material. The longer name is a naming choice, not a React, Vite, or GitHub Pages requirement.

The owner has expressed a preference for **Grove**. Before implementing that change, decide whether it means just the visible brand or also the repository/package/site address. A display-name change does not require changing the repository slug. No rename is performed by this document, and no name-availability or trademark clearance is claimed.

If a rename is approved:

- Update visible copy, metadata, documentation, screenshots, tests, and contributor links consistently.
- Preserve `recall-studio:v1`, `concept-grove:theme:v1`, version-1 backup compatibility, and every published card ID. Storage keys are compatibility identifiers, not branding to rewrite.
- Keep base-aware assets and verify the actual published address. Do not assume repository redirects are a complete Pages migration plan.
- Export/import study data when changing origin (scheme, host, or port). A path-only change on the same origin does not create separate localStorage.
- Treat moving/deleting the local workspace separately; it can disrupt access to the current VS Code/Copilot session.

## Owner's idea inbox

Add new suggestions here in your own words; move them into the backlog only when their scope is clear. This file is public: never include passwords, tokens, real study backups, or private conversation transcripts.

| ID | Suggestion | State | Next decision |
| --- | --- | --- | --- |
| NAME-01 | Prefer the shorter name “Grove” | Scope undecided | Visible brand only, or also repository/package/site address? |
| DATA-01 | Keep users' study status safely across visits and future updates | Saved review history already persists; exact session resume remains proposed | Decide which session details should resume automatically |

For each new idea, record:

- **Suggestion:**
- **Why it helps / who needs it:**
- **Smallest useful version:**
- **Priority:** next / later / optional
- **Acceptance checks:**
- **Issue or PR:**
- **Status:** idea / approved / in progress / verified / deferred

## Suggested backlog

The order is a recommendation, not a delivery commitment. All items remain proposed unless a completed PR is linked.

| Priority | Improvement | Completion criteria |
| --- | --- | --- |
| Next | Resume the exact study session | Restore validated queue IDs, current card, filters, and rated-card state after reload/browser restart without duplicate ratings or skipped neighbors. Handle added/removed cards safely; keep session storage separate from v1 study backups. |
| Next | Make local backup limits clearer | Explain what is saved versus transient, offer non-intrusive backup reminders, and test export/import plus blocked/full storage. Never claim GitHub stores users' study history. |
| Next | Prevent conflicting study tabs | Detect or reconcile competing writes without silently losing reviews. Test two real tabs, imports/resets, and out-of-order updates; keep the current one-study-tab guidance until this is implemented. |
| Next | Improve search and sharing metadata | Add accurate canonical/social metadata and a useful sitemap where appropriate; evaluate prerendered public content. Verify production URLs and crawler access. Indexing/ranking is not guaranteed. |
| Ongoing | Maintain dependency and deployment safety | Review locked updates in focused PRs, run clean installs and all checks, audit dependencies, and inspect actual deployment results. Never auto-merge or disable branch protection to clear a failing gate. |
| Later | Broader browser/device verification | Add Firefox/WebKit coverage where practical, plus real Safari/mobile and assistive-technology checks for dialogs, dropdowns, focus, storage, contrast, and reduced motion. Record actual coverage and skips. |
| Later | Measure and improve performance | Measure real mobile loading and Core Web Vitals before optimizing; profile the optional Three.js bundle and the question-bank loading strategy. Preserve readable fallback UI and honest size warnings. |
| Later | Expand original educational content | Add fact-checked, cited, balanced ML/DL/NLP batches through explicit community IDs. Preserve every original card and its ID; extend rather than weaken invariant and E2E checks. |
| Optional | Offline/installable study | Design cache updates, storage limits, and old/new version handling; test offline reload and safe updates. Do not advertise offline availability before it works. |
| Optional | Account-based backup or multi-device sync | First confirm demand. Keep anonymous local study available; design consent, deletion/export, authentication, conflicts, hosting cost, and recovery tests. This would introduce a backend and is not required for current v1. |
| Optional | Stronger hosting security controls | Review content-security and other response-header policies against actual Pages capabilities; evaluate a different host only when justified. Check external assets and stored/imported data without claiming vulnerability-free operation. |

### Deferred dependency proposals

- [PR #3](https://github.com/Parama-Guru/concept-grove/pull/3): revisit the grouped minor/patch updates when the configured registry can reproduce the locked install. It was deferred because Oxlint 1.81.0 was unavailable there, not because an application defect was demonstrated. Do not disable TLS verification or add registry credentials to source control.
- [PR #4](https://github.com/Parama-Guru/concept-grove/pull/4): Node 26 types were rejected while the supported runtime remains Node 24. Reconsider types with a deliberate runtime/toolchain upgrade.
- [PR #5](https://github.com/Parama-Guru/concept-grove/pull/5): treat TypeScript 7 as a separate compiler/editor migration with Windows, Linux CI, build, and browser verification.

## Working on an item later

1. Start from current remote `main`, not an old local build. Use a fresh clone or GitHub Codespaces if the previous checkout was deleted. Codespaces has its own usage limits/costs and is optional.
2. Follow [CONTRIBUTING.md](CONTRIBUTING.md). Keep the original 600-card arrays fixed; new content uses [src/data/community.ts](src/data/community.ts) with balanced, permanent explicit IDs.
3. Run `npm run check`, then `npm run test:e2e`; report actual failures/skips. Verify the live site after deployment when relevant. See [README.md](README.md#verification).
4. Open a PR, keep it up to date, and wait for the required **Build and verify** check and resolved conversations. The owner merges manually; do not push directly or force-push to `main`.
5. Link the completed PR here and record what was actually verified. Do not mark an idea complete just because it was written down or a build command exited successfully.

The [main ruleset](https://github.com/Parama-Guru/concept-grove/rules/22389625) blocks force pushes/deletion and requires checked PRs with no bypass entries. At the baseline, there are no other collaborators and auto-merge is off. Required approval count is zero to avoid sole-owner self-approval deadlock; revisit owner-specific review/access policy before granting anyone write access. The owner can administratively change the ruleset.

## Can the local checkout be deleted?

**Yes, once the final work is merged and verified remotely.** GitHub stores committed source/history and Pages serves the built website independently of this computer. Deleting only the local checkout does not delete the repository, release, or deployed site. It does remove the convenient local development environment.

Before deletion:

- [ ] Confirm this document and every intended change are present on remote `main`, not just a local branch or an unmerged PR.
- [ ] Confirm the latest main workflow/deployment succeeded and the live site opens.
- [ ] Check for unpublished commits, branches, stashes, untracked files, ignored private files, and backups. Keep anything valuable elsewhere; never publish private material just to empty the folder.
- [ ] Export any study progress worth keeping, especially progress on localhost before losing the local server. Store backups privately outside this checkout. Import into the live site if needed, noting that import replaces rather than merges study data.
- [ ] Save important development notes and any wanted Copilot conversation privately. GitHub does not automatically store VS Code chat history or editor state.
- [ ] Stop local development/preview processes and close this workspace before removing its folder. Do not delete the remote repository or disable Pages.

Installed packages, build output, generated license notices, and browser test reports are intentionally ignored and reproducible from committed source and the lockfile; inspect for personal files before discarding them. User study history is browser-local, **not in GitHub**. Deleting source is different from clearing browser site data, but localStorage is not a guaranteed backup.

No local folder is deleted by maintaining this document. Future development can resume from a fresh checkout or a remote development environment; the public study site does not need either to stay running.