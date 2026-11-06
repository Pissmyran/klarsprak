# REPO.md

## What this is
A Swedish plain-language reference that compares everyday usage of terms with legal and official usage, with sources on both sides. Visitors can suggest terms; nothing is published until an admin reviews it.

## Stack
- Cloudflare Worker with D1 (SQL migrations in `migrations/`), plain JavaScript (ES modules), static assets in `public/`
- Wrangler for local run and deploy, Bun lockfile, Node's built-in test runner
- Docker image for self-hosting (runs the Worker locally via Wrangler)
- Zensical (Python) for the documentation site

## Commands
- Install: `bun install --frozen-lockfile`
- Test: `npm test`
- Run locally: `npm run dev`
- Check deploy config: `npx wrangler deploy --dry-run`
- Check for real e-mail addresses: `node tools/check-addresses.mjs`
- Build docs input: `node tools/docs-site.mjs` (then `zensical build` with `requirements-docs.txt`)
- There is no separate build or lint step.

## Where things live
- `src/index.js` runs before static assets and owns hostnames, admin routing, SEO and security headers; `src/worker.js` holds the API.
- The repo holds only `__PLACEHOLDER__` values; `tools/render.mjs` fills them from `cloudflare.example.env` to produce a deployable copy.
- `docs/` is Swedish; `docs/eng/` is its English mirror.

## Release
- Merging to `main` with a new `package.json` version creates the tag, the GitHub release (notes from `CHANGELOG.md`) and publishes the Docker image.
- The documentation site is built on every PR and published to GitHub Pages from `main`.

## Repo-specific rules
- Published terms live only in D1; static pages are presentation, never a term database.
- A suggestion and its publication are separate steps; nothing is published without review.
- Never commit real addresses or hostnames; use the placeholders.
- A schema change needs a new migration, never an edit of an existing one.
