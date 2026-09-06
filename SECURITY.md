# Security policy

Concept Grove is a frontend-only study app. It has no study-data backend or account system, but vulnerabilities in browser code, dependencies, backup handling, or the build and deployment process still matter.

## Report a vulnerability privately

1. If private vulnerability reporting is enabled, use **Security → Report a vulnerability** in [the repository](https://github.com/Parama-Guru/concept-grove), or open [a private advisory report](https://github.com/Parama-Guru/concept-grove/security/advisories/new).
2. If that option is unavailable, or you cannot use it, email [paramaguruvh@gmail.com](mailto:paramaguruvh@gmail.com) with the subject **Concept Grove security report**.

Private reporting is conditional on repository settings; its availability is not assumed. **Do not open a public issue or pull request containing vulnerability details, credentials, tokens, or personal study backups.**

A useful report includes:

- The affected version or commit, browser/OS, and whether this is a local or hosted build.
- The expected behavior, security impact, and a minimal reproduction using synthetic data.
- Redacted logs or screenshots, if useful, and any suggested mitigation.

Test only your own checkout and data, or systems you have permission to test. Do not access someone else's data to demonstrate an issue. Share the minimum information necessary; if sensitive material is essential, first ask how to exchange it safely.

## Follow-up and versions

Version 1.0.0 is the initial version. Report the version you actually tested rather than assuming all versions are affected. No response-time or fix-time SLA, or separate maintenance schedule for older releases, is promised. Maintainer availability varies; the private reporting channel can be used to coordinate investigation, remediation, and disclosure.

## Local data is not a secrets vault

Study data and appearance are stored in browser `localStorage`, not encrypted by the app. Other scripts on the same origin, browser extensions, or someone with access to the browser profile may be able to read them. Use a trusted deployment and keep exported backups private. Normal static-host requests and visits to external GitHub links are handled by those services.

For non-security bugs or flashcard corrections, use [the issue forms](https://github.com/Parama-Guru/concept-grove/issues/new/choose). Never attach secrets or an unredacted backup to a public report.