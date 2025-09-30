# Project Calm

Lightweight desktop app built with Electron + web UI. Includes CI for builds and automated Windows release packaging.

![CI](https://github.com/dquillman/projectcalm/actions/workflows/ci.yml/badge.svg)
![Release](https://img.shields.io/github/v/release/dquillman/projectcalm?include_prereleases&sort=semver)

## Getting Started
- Prereqs: Node 20+, npm, Git
- Install: `npm ci`
- Hot-reload app: `npm run dev:app` (watch + auto-restart Electron)
- Dev build only: `npm run dev`
- Run Electron (after build): `npm run electron:dev`

## Building
- Desktop bundle: `npm run build` (outputs to `dist/`)
- Windows installer: `npm run pack:win` (outputs to `release/`)

## Mobile (Capacitor)
- Sync Android: `npm run android:sync`
- Open Android Studio: `npm run android:open`

## Versioning
- Current version source: `version.txt`
- Bump version: `npm run bump`
  - Increments `version.txt`, syncs `package.json`, updates HTML meta tags

## Releases
- Tag a release: `git tag v<version> && git push --tags`
- GitHub Action builds Windows installer and publishes a Release using `version.txt`.

## Deploy to Render (Static Site)
Project Calm’s web build is a static SPA. You can host it on Render as a Static Site.

- Build Command: `npm ci && npm run build && npm run mobile:bundle`
- Publish Directory: `www`
- Environment: None required
- Auto Deploy: Enable for `main` or tags as preferred

SPA routing (index fallback):
- In Render → Static Site → Settings → "Index as fallback" → Enable
  - This serves `index.html` for unknown paths (client-side routing).

What the build does:
- `npm run build` produces `dist/app.js` and writes `dist/index.html`.
- `npm run mobile:bundle` copies `index.html`, `version.txt`, `vendor/`, and `dist/` into `www/` (Render serves this folder).

Local preview (optional):
- After build: open `index.html` in your browser, or serve the repo root with any static server so `./dist/app.js` loads.

## Contributing
- Open issues and PRs are welcome.
- Please include clear reproduction steps or a concise change summary.

## License
ISC © 2025 dquillman. See `LICENSE`.
