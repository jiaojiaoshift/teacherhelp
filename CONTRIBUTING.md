# Contributing

## Development baseline

- Use Node.js 22 LTS and npm 10.
- Run `npm run setup:fresh` for a new checkout.
- Read `spec_skill.md` and the latest project handoff before changing behavior.
- Use TDD: reproduce with a failing test, implement the smallest change, then run focused and full regression tests.
- Keep changes scoped. Do not refactor question boxing, OCR, cross-page detection, classification or persistence while working on unrelated infrastructure.

## Privacy and credentials

Never commit or attach:

- `.env.local`, API keys, auth files, `.codex` or `.cc-connect`.
- `data/`, `logs/`, `tmp/` or generated desktop / Android artifacts.
- Real teaching PDFs, question-bank assets or student information.

Use placeholders in examples and synthetic fixtures in tests.

## Android

The Expo / React Native and Native Kotlin / Compose implementations are separate lines. State the target line before editing and run Android Gradle commands serially.

## Before a pull request

```bash
npm run deploy:check
npm test
npm run build
```

Describe the user-visible behavior, tests run, data migration impact and any remaining risk.
