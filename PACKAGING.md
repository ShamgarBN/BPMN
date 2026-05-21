# Packaging BPMN Studio for Distribution

This guide covers building installable desktop versions of BPMN Studio for
Windows, macOS, and Linux. Package once, distribute to your team — no server
required, no internet required at runtime.

## Prerequisites

- Node.js 20+ and npm 10+
- macOS host for building macOS installers
- Windows host (or [Wine](https://www.electron.build/multi-platform-build) on
  macOS/Linux) for Windows installers
- Linux host (or Docker) for Linux packages

> **Note:** electron-builder can cross-compile Windows installers from macOS in
> some scenarios but native code-signing requires the matching OS.

## Quick Start

Build a macOS app bundle for testing on the current machine:

```bash
npm run electron:pack
```

Output: `release/<version>/mac-arm64/BPMN Studio.app` (or similar by
platform). Double-click to launch — no installer needed.

## Full Installer Builds

| Command                       | Outputs                                          |
| ----------------------------- | ------------------------------------------------ |
| `npm run electron:dist:mac`   | `.dmg` (installer) and `.zip` for x64 + arm64    |
| `npm run electron:dist:win`   | `.exe` NSIS installer + portable `.exe` (x64)    |
| `npm run electron:dist:linux` | `.AppImage`, `.deb`, `.rpm` (x64)                |
| `npm run electron:dist`       | All targets for the current host OS              |

Output: `release/<version>/`

## Development

Run the app in development mode against a live Vite server with HMR:

```bash
npm run electron:dev
```

This launches Electron and Vite together. Edits to renderer code reload in
place; edits to `electron/main.ts` or `electron/preload.ts` restart the
process.

## App Icons

The default Electron icon is used unless you provide your own.

Place icon files in `build/`:

```
build/icon.icns      # macOS  (1024×1024 .icns)
build/icon.ico       # Windows (256×256 multi-resolution .ico)
build/icon.png       # Linux   (512×512 .png)
build/background.png # macOS DMG window background (optional)
```

electron-builder auto-discovers them.

## Code Signing

### macOS

For distribution outside the App Store, signing with a Developer ID prevents
the "unidentified developer" warning. Edit `electron-builder.yml`:

```yaml
mac:
  identity: "Developer ID Application: Your Name (TEAMID)"
  notarize:
    teamId: TEAMID
```

Set credentials as env vars before building:

```bash
export APPLE_ID=your-apple-id@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID
npm run electron:dist:mac
```

### Windows

For SmartScreen-friendly installers, supply a code-signing certificate:

```bash
export WIN_CSC_LINK=path/to/cert.pfx
export WIN_CSC_KEY_PASSWORD=your-password
npm run electron:dist:win
```

### Linux

No signing typically required. Some distributions support GPG signing of
.deb/.rpm packages — see the
[electron-builder Linux docs](https://www.electron.build/linux) for details.

## Architecture Targets

The default targets are:

- **macOS**: x64 (Intel) and arm64 (Apple Silicon) — universal builds via two
  separate DMGs
- **Windows**: x64 only (most enterprise deployments)
- **Linux**: x64 only (broadest compatibility)

To add ARM64 Linux or 32-bit Windows, edit the `arch` lists in
`electron-builder.yml`.

## Distribution Checklist

Before sharing builds with your team:

1. [ ] Update `version` in `package.json` (semver)
2. [ ] Update version references in `src/docs/userManual.ts` if content changed
3. [ ] Add custom icons in `build/` for a polished look
4. [ ] Test the unsigned build locally first: `npm run electron:pack`
5. [ ] Code-sign for the target OS (avoids security warnings on user machines)
6. [ ] Test the signed installer on a clean machine that has never run the app
7. [ ] Compute SHA-256 hashes of the installers for verification

## Auto-Updates (Optional)

`electron-builder.yml` has `publish: null` — auto-updates are disabled. To
enable, configure a publisher (e.g. GitHub Releases, S3, generic HTTPS):

```yaml
publish:
  provider: github
  owner: your-github-org
  repo: bpmn-studio
```

Then in the renderer (or main process), use the
[electron-updater](https://www.electron.build/auto-update) package to check
for and apply updates on launch.

## Troubleshooting

### "macOS arm64 requires signing"

The unsigned build is fine for testing but cannot be opened normally on Apple
Silicon Macs without signing — Gatekeeper rejects it. Either sign the build
or have users right-click → Open the first time.

### "Default Electron icon is used"

Add `build/icon.icns`, `build/icon.ico`, and `build/icon.png` as described
above.

### Build is slow or downloads Electron repeatedly

electron-builder caches Electron in `~/Library/Caches/electron/` (macOS),
`%LOCALAPPDATA%/electron/Cache` (Windows), or
`~/.cache/electron` (Linux). Ensure that directory is writable.

### Renderer can't import a node module

Renderers run in a sandboxed browser context — they cannot use Node-only
modules. Add server-side functionality in `electron/main.ts` and expose it
through the `electron/preload.ts` bridge.

## Security Notes

The Electron main process enforces:

- `contextIsolation: true` and `nodeIntegration: false` — renderer is
  sandboxed
- All file I/O routed through IPC handlers in `electron/main.ts`
- External links open in the OS browser, not in-app
- No remote module, no shared module loading

Review `electron/main.ts` and `electron/preload.ts` before any modification —
they are the trust boundary between the renderer and the host system.
