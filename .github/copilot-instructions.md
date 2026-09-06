# Concept Grove

## Initial setup checklist
Completed for the pre-rename baseline; rerun verification for subsequent changes.

- [x] Verify workspace instructions exist.
- [x] Clarify requirements: React, TypeScript, Three.js, 600 original ML/DL/NLP flashcards.
- [x] Scaffold the existing workspace with Vite and React TypeScript.
- [x] Customize the responsive study experience and original question bank.
- [x] Install required extensions: none needed.
- [x] Compile, lint, test, and check accessibility and mobile layouts.
- [x] Create and run a development task.
- [x] Launch and verify in the browser. Debug mode is optional and not enabled.
- [x] Finish documentation and launch instructions.

## Project conventions
- Public brand: **Concept Grove**, short wordmark **grove.**, tagline **Ideas take root**, package name `concept-grove`.
- Use strict TypeScript. Keep all question-bank content original and technically accurate.
- Maintain at least 600 unique cards, split equally across machine learning, deep learning, and NLP.
- No backend or external API is required. Study state stays in versioned, validated localStorage.
- Preserve `STORAGE_KEY = 'recall-studio:v1'`, version-1 backup compatibility, and all card IDs through renames. A different origin needs explicit backup/import; never silently migrate or reset progress.
- Every visible control must work. Keep keyboard navigation, focus handling, and reduced motion accessible.
- Study keyboard mode: Space reveals only; Tab/Shift+Tab move next/previous without rating or leaving queue bounds. Escape releases normal Tab navigation; clicking the card or study actions re-engages the mode. Fields, dropdowns, dialogs, IME composition, and prevented events keep their own keyboard behavior.
- Keep Vite `base: './'` and base-aware asset URLs for this no-router app. Do not hard-code a repository path or publish unverified repository/Pages links.
- Load Three.js on demand, cap pixel ratio, pause offscreen/hidden animation, and dispose GPU resources.
- Run `npm run check` and `npm run test:e2e` before considering a feature complete.
- Do not commit or push unless explicitly requested.

## Public release and contribution conventions

- The verified public repository is [Parama-Guru/concept-grove](https://github.com/Parama-Guru/concept-grove). Keep the existing local **flash** folder unchanged. Mark GitHub Pages pending until a real deployment is verified; local mount tests are not deployment or Linux CI evidence.
- Version 1.0.0 uses MIT, copyright 2026 Parama-Guru, for original code and cards. Third-party libraries and fonts retain their licenses. `private: true` prevents npm publishing, not public GitHub access.
- Use Node.js 24 LTS and npm 11. `npm ci` must work with the user's configured registry without a private-feed requirement. Preserve npm's `omit-lockfile-registry-resolved` setting and omit registry-resolved URLs from the public lockfile; never commit credentials or private-feed URLs.
- System is the default appearance and follows the OS; Light/Dark overrides and the header quick toggle persist under `concept-grove:theme:v1`. Keep appearance out of version-1 study state and backups. Study import/reset must not change appearance.
- Footer contributor/project links are ordinary navigation. Studying needs no account; GitHub stars, issues, and PRs require an account and explicit user action. Never auto-star or auto-submit.
- Follow [CONTRIBUTING.md](../CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md). Route vulnerabilities through [SECURITY.md](../SECURITY.md): a private advisory if enabled, otherwise the provided reporting email; never request public secrets or backups.

## Flashcard identity and expansion

- Keep the original baseline exactly 600 cards: 200 per subject, ten topics per subject, twenty cards per topic. Correct existing text in place while preserving the intended concept, topic, position, and ID.
- Never insert, remove, reorder, or append cards in any original topic array, or reorder/insert topics. `createDeck` assigns positional IDs across a whole subject: appending to an earlier topic renumbers later topics. Never use the original arrays for new content.
- New cards belong only in the separate `communityCards` extension as full `{ id, subject, topic, difficulty, question, answer, takeaway }` objects. Use globally unique explicit IDs matching `^(ml|dl|nlp)-community-[a-z0-9]+(?:-[a-z0-9]+)*$` with a prefix matching `subject`; never recycle or change a published ID.
- Merge new cards only in balanced batches with equal additions to ML, DL, and NLP (at least one each). Single-card issues are welcome for maintainer coordination; do not merge an unbalanced deck.
- Require original, fact-checked wording, reliable source citations in the PR, and manual arithmetic checks. Difficulty is `foundation`, `intermediate`, or `advanced`; question length is >20, answer >70, takeaway >15. Do not copy exam questions or paid material.
- Keep original-baseline invariants separate from aggregate-deck checks. Preserve global uniqueness, subject balance, ID compatibility, and substantial content. Derive UI totals from the aggregate deck; update E2E count expectations only for intentional expansion, never by weakening invariant checks.
- Record actual check results and skips rather than fixed historical pass counts. Do not claim a passing Linux CI run or verified live Pages deployment without that evidence.