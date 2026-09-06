# Changelog

Notable changes to Concept Grove are recorded here. A version entry describes the source; it does not certify a GitHub Release, a successful CI run, or a live deployment.

## 1.0.0

Initial public-source version under the MIT license.

### Added

- An original 600-card baseline: 200 cards each for machine learning, deep learning, and natural language processing, with ten topics per subject.
- A separate community-card extension with explicit stable IDs and balanced additions across the three subjects.
- Study queues, up-to-20-card quick sessions, bookmarks, self-rated review scheduling, daily goals, and progress summaries.
- Searchable and filterable library and saved-card views, answer previews, study-from-library controls, and pagination.
- Reveal-only Space, bounded Tab/Shift+Tab study navigation, Escape back to normal navigation, accessible dropdowns, and modal focus handling.
- System, Light, and Dark appearance choices, an immediate header toggle, and contributor/project links in the footer.
- Validated JSON backup/import, confirmed study-data reset, and in-memory use when browser storage is unavailable.
- Responsive layouts, locally served fonts, and optional lazy-loaded Three.js artwork with reduced-motion and static fallbacks.
- Relative-base static hosting, a Pages verification/deployment workflow, contribution and security guidance, issue/PR templates, and weekly dependency-update configuration.

### Compatibility

- The study key remains `recall-studio:v1`; original card IDs and version-1 Recall Studio backups remain compatible.
- Appearance uses `concept-grove:theme:v1` separately. Importing a study backup does not change appearance.
- The public repository/package name is `concept-grove`; the existing local **flash** folder does not need to change.

### Deployment status

GitHub Pages has not yet been verified live. See [README.md](README.md) for the intended address and current hosting status; no passing Linux CI or final test counts are asserted here.