# Contributing to Concept Grove

Clearer explanations, reproducible bug reports, accessible interactions, and small documentation improvements are welcome. Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and discuss large changes through [an issue](https://github.com/Parama-Guru/concept-grove/issues/new/choose) before investing in an implementation. Report vulnerabilities privately using [SECURITY.md](SECURITY.md), never in a public issue or PR.

Studying requires no account. Opening issues, starring, forking, and submitting pull requests require a GitHub account and your own explicit action; the app does not star anything automatically.

## From fork to pull request

1. Fork [Parama-Guru/concept-grove](https://github.com/Parama-Guru/concept-grove), then create a focused branch from the latest `main` in your fork. Your checkout can keep its existing **flash** folder name.
2. Make a small, complete change. Read the relevant code and tests first, preserve compatibility, and add regression coverage for behavior changes. Use the card-specific rules below for any content edits.
3. With **Node.js 24 LTS and npm 11**, install the locked dependencies and browser, then run the required checks in order:

   ```sh
   npm ci
   npx playwright install chromium
   npm run check
   npm run test:e2e
   ```

   `check` includes linting, unit/content tests, strict TypeScript, and a production build. Browser tests use that build, so rerun `check` after source changes before E2E. On Linux, Playwright may also need system dependencies; CI uses `npx playwright install --with-deps chromium`. Keep preview ports 4173, 4174, and 4175 free. See [README.md](README.md) for local study and preview commands.
4. Once the change is complete, commit and push the branch to your fork. Open a pull request against **Parama-Guru/concept-grove:main**, explain why the change helps, link related issues, and report actual verification results. Include failures, skips, or commands not run; do not describe local Windows checks as passing Linux CI. Submit for **maintainer approval and passing checks before merge**.

No private npm feed is required. `npm ci` uses your configured registry, normally the public npm registry. When dependencies intentionally change, keep [package.json](package.json) and [package-lock.json](package-lock.json) consistent and preserve npm's `omit-lockfile-registry-resolved` setting. Do not commit registry credentials or private-feed URLs.

## Correct an existing flashcard safely

The original baseline is **600 cards: 200 per subject, ten topics per subject, twenty cards per topic**. Its source files are:

- [src/data/machineLearning.ts](src/data/machineLearning.ts)
- [src/data/deepLearning.ts](src/data/deepLearning.ts)
- [src/data/naturalLanguage.ts](src/data/naturalLanguage.ts)

Correct an existing question, answer, or takeaway **in place**. Preserve its intended concept, topic, position, and ID; a factual correction is welcome, but replacing a question with an unrelated concept is not. Explain the correction and cite reliable references in the PR. The original card tuples remain ordered as question, answer, takeaway, difficulty.

**Never insert, remove, reorder, or append cards in these original topic arrays. Never reorder or insert their topics.** [src/data/createDeck.ts](src/data/createDeck.ts) generates positional IDs across the **whole subject**, not independently within each topic. Even appending to the end of an earlier topic renumbers later topics and can attach existing bookmarks, progress, or backups to the wrong questions. New cards must use the separate community deck, not any original topic—even the last one.

If you only want to report a correction, use [the flashcard issue form](https://github.com/Parama-Guru/concept-grove/issues/new?template=flashcard.yml) with the current card ID if known, or its exact question. A source citation and a short explanation are enough to start a discussion; no code contribution is required.

## Adding flashcards

Add full `Flashcard` objects only to the `communityCards` array in [src/data/community.ts](src/data/community.ts). Its starting declaration is `export const communityCards: Flashcard[] = []`; do not replace the array when it already contains contributions. [src/data/index.ts](src/data/index.ts) combines that extension with the fixed original baseline for study, search, ID lookups, and UI totals.

Each object has all seven fields defined in [src/types.ts](src/types.ts):

| Field | Requirement |
| --- | --- |
| `id` | Explicit, globally unique, stable ID with a prefix matching its subject |
| `subject` | `ml`, `dl`, or `nlp` |
| `topic` | A clear, non-empty topic name |
| `difficulty` | `foundation`, `intermediate`, or `advanced` |
| `question` | Original, specific question longer than 20 characters |
| `answer` | Accurate explanation longer than 70 characters, with necessary assumptions |
| `takeaway` | Original, memorable summary longer than 15 characters |

Use IDs such as `ml-community-your-topic-slug`, `dl-community-your-topic-slug`, or `nlp-community-your-topic-slug`. The complete pattern is `^(ml|dl|nlp)-community-[a-z0-9]+(?:-[a-z0-9]+)*$`, and its subject prefix must equal `subject`. Do not derive IDs from array positions, translate them, recycle them, or change published IDs when wording improves.

This original example shows **one object only**. It is documentation, not an added card or a complete contribution batch:

```ts
// Illustrative entry for src/data/community.ts, inside communityCards.
{
  id: 'ml-community-beta-bernoulli-update',
  subject: 'ml',
  topic: 'Bayesian Updating',
  difficulty: 'intermediate',
  question: 'Starting with a Beta(2, 3) prior, what is the posterior after three successes and one failure in independent Bernoulli trials?',
  answer: 'Assuming the trials share one unknown success probability, the beta prior is conjugate to the Bernoulli likelihood. Add the three successes to the first shape parameter and the one failure to the second, giving Beta(5, 4). The posterior predictive probability of success on the next trial is 5 / 9.',
  takeaway: 'For a beta prior, update its two shape parameters with success and failure counts.',
},
```

**New cards must land in balanced batches:** add the same number to each subject, with at least one ML, one DL, and one NLP card. To submit a batch shaped like the example, add two more complete, original objects—one DL and one NLP—with their own stable IDs. Larger batches must also add equal numbers per subject.

Have only one good idea? Submit it through [the flashcard issue form](https://github.com/Parama-Guru/concept-grove/issues/new?template=flashcard.yml). Individual proposals are welcome; a maintainer coordinates balanced batches before merging. Do not pad a batch with weak questions merely to satisfy the counts.

## Content quality and verification

- Write original wording. Do not copy examination questions, textbook passages, commercial question banks, or paid flashcards. Cite sources in the PR rather than reproducing their text.
- Check the full deck for duplicate questions, answers, and concepts. IDs, normalized question text, and trimmed answers must be unique across the aggregate deck; passing string checks alone does not establish that two cards teach different things.
- State relevant assumptions, units, and limitations. Manually verify facts, formulas, arithmetic, and examples against reliable references. Include source links or precise citations and explain the verification in the PR.
- Keep the question answerable on its own and the takeaway consistent with the answer. Avoid unsupported claims, ambiguous terminology, and filler used only to reach the length requirements.
- AI-assisted contributions need the same originality, factual checks, and verification evidence as any other contribution. Automated tests cannot certify subject-matter accuracy.

Preserve [src/data/cards.test.ts](src/data/cards.test.ts) contracts: the original baseline stays exactly 600 with its stable IDs and original subject/topic structure; the aggregate deck remains at least 600, balanced across subjects, unique, and substantial. New community IDs follow the explicit subject-matched pattern. Do not replace fixed original-deck checks with a weaker minimum-count assertion.

When intentionally expanding the bank, update relevant aggregate-count or pagination expectations in [e2e/app.spec.ts](e2e/app.spec.ts) and [e2e/pages.spec.ts](e2e/pages.spec.ts) to reflect the intended change. Keep UI totals derived from the aggregate deck. **Never weaken uniqueness, balance, identity, or compatibility checks just to make a larger deck pass.** Content corrections that do not expand the deck should not change count expectations.

## Application compatibility

- Preserve `STORAGE_KEY = 'recall-studio:v1'`, the version-1 study-state schema, legacy backup compatibility, and every published card ID. A change of origin needs explicit export/import, not a silent migration or reset.
- Keep appearance separate at `concept-grove:theme:v1`. System follows the OS by default; explicit Light/Dark selections persist. Study imports and study-data reset must not change appearance.
- Keep Space reveal-only, Tab/Shift+Tab bounded to next/previous without rating, and Escape available for normal navigation. Fields, dropdowns, dialogs, IME composition, and already-prevented events keep their own keys.
- Check both light and dark appearance, small screens, keyboard/focus behavior, reduced motion, and storage failures for relevant UI changes. Preserve real pointer interactions and readable text rather than bypassing problems in tests.
- Keep the app frontend-only, fonts local, Vite `base: './'`, and asset URLs base-aware. Do not add trackers, an account requirement, runtime external APIs, or a hard-coded repository mount.
- Keep Three.js optional and lazy, pause hidden/offscreen work, cap rendering cost, and release GPU resources.

The repository is public, but Pages must be labeled pending until a real deployment is verified. Do not claim passing checks or publish a live-site badge based only on local subpath tests. Dependency-update PRs also need review and verification; weekly grouped minor/patch updates are configured in [.github/dependabot.yml](.github/dependabot.yml), with separate version-update PR caps for npm and GitHub Actions. Major updates remain separate; grouping does not enable auto-merge.

## License

Submit only work you have the right to contribute. Original code, documentation, and flashcard contributions are contributed under the project's MIT [LICENSE](LICENSE). Preserve third-party license and attribution requirements; the project's MIT license does not relicense dependencies or fonts.