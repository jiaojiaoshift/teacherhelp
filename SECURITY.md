# Security Policy

## Reporting

Do not report a vulnerability with real API keys, authentication files, teaching material or student information in a public issue. Use a private GitHub security advisory after the repository enables that feature, or contact the maintainers through a private channel listed by the repository owner.

Include a minimal synthetic reproduction, affected version and impact. Remove request bodies, OCR text, local paths, upstream URLs and credentials from logs before sharing them.

## Deployment boundary

TeachHelper `1.0.0` is a local-first, single-owner application. A public deployment must be protected by HTTPS and an authentication reverse proxy. The application does not yet provide a public multi-user authorization model.

Keep `TEACHHELPER_DATA_ROOT`, `.env.local`, `.codex`, `.cc-connect` and backups outside public Web roots and container images.
