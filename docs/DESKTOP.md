# Desktop app, download link and updates

## For users

Download page (always the newest version):
**https://github.com/akbbekbakytzankyzy-cloud/UniBridge-AI/releases/latest**

- Windows: `UniBridgeAI_<version>_x64-setup.exe`. Installs for the current user, no administrator rights.
- macOS (Apple Silicon): `UniBridgeAI_<version>_aarch64.dmg`.

On first start the app shows the local teacher and student logins and saves them in
`local-access.txt` in the app data folder. For AI answers, install [Ollama](https://ollama.com)
and run `ollama pull qwen3:1.7b`; the app does not install Ollama itself.

**Updates.** On every start the app checks the latest release. If a newer version exists it asks
"Установить?" — Install closes the database cleanly, downloads the signed update, installs it and
restarts. Data stays in the app data folder and is not touched by updates.

The installers are not code-signed with a paid certificate yet. Windows SmartScreen may show
"Windows protected your PC" → More info → Run anyway. macOS: right-click the app → Open the first
time. Update packages are always verified with the project's updater signature.

## How it works

The installer contains the Tauri shell, a Node.js runtime and `resources/server`: the API, SQL
migrations, the built web UI and production `node_modules` (including embedded PostgreSQL, PGlite).
The shell starts `node server/apps/api/src/local.js` with:

| Variable | Value |
| --- | --- |
| `UB_DATA_DIR` | app data folder (Windows `%APPDATA%\edu.unibridge.desktop`, macOS `~/Library/Application Support/edu.unibridge.desktop`) |
| `UB_PORT` / `UB_ORIGIN` | `3417` / `http://localhost:3417` |
| `UB_STATIC_DIR` | bundled web UI, served by the same server (one origin for UI, API and cookie) |
| `UB_SHUTDOWN_TOKEN` | random per start; the shell `POST`s `/__shutdown` on exit and before updates |
| `UB_EXIT_WITH_STDIN` | `1`: the server also closes cleanly if the shell disappears |

The server only listens on 127.0.0.1. The port reservation still prevents two processes from opening
the same database. Server output goes to `server.log` in the data folder.

## Publishing a new version (maintainers)

One-time setup:
1. GitHub → Settings → Secrets and variables → Actions → New repository secret
   `TAURI_SIGNING_PRIVATE_KEY` = contents of the private updater key file (never commit it).
   If the key has a password, also add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
2. The matching public key is already in `apps/web/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).
   If the private key is lost, generate a new pair with `npx tauri signer generate`, replace the public
   key and publish a release; apps installed earlier will need one manual reinstall.

Each release:
```bash
git tag v0.2.0
git push origin v0.2.0
```
The `Desktop release` workflow runs the tests, sets the version from the tag, builds the Windows and
macOS installers, signs the update packages and publishes the release with `latest.json`. Versions
must increase (semver).

Local build: `npm run desktop:build` (needs Rust and the Tauri platform prerequisites).
