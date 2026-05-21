# Release setup — what we still need from you

The CI workflow that just landed (`.github/workflows/ci.yml`) covers
**build + test on every push**.  To turn that into a real release pipeline
that ships signed installers with auto-update, we need two decisions from
you.  Both block work on Tier 4.1 (code signing) and Tier 4.4
(`electron-updater`).

## 1. Code signing — what platforms and what budget?

Without a code-signing certificate:

- **Windows**: SmartScreen flags the installer as "unrecognized publisher"
  every time someone runs it.  Users have to click *More info → Run
  anyway*.  Auto-update is impossible (Windows refuses to silently swap an
  unsigned binary).
- **macOS**: Gatekeeper blocks the app from launching at all unless the
  user right-clicks → Open and clicks through a warning.  Notarization
  (separate from signing) is required for full silence.
- **Linux**: No signing required, but most distros are happier with a
  signed `.AppImage` or `.deb`.

### What we need from you

Pick the option that matches your constraints, then we'll wire it up:

| Option | Cost / yr | Effort | What you'd get |
|---|---|---|---|
| **A. Sectigo / DigiCert standard code-signing cert (Windows)** | ~$300–$500 | Mid | No SmartScreen warning, auto-update works |
| **B. Apple Developer Program (macOS sign + notarize)** | $99 | Low | App launches without Gatekeeper prompt |
| **C. Both (recommended for external distribution)** | ~$400–$600 | Mid | Clean installs on both platforms |
| **D. Self-signed (internal distribution only)** | $0 | Trivial | Works for users you push the cert to manually |
| **E. Skip signing for now** | $0 | None | Ship 1.2 unsigned, revisit later |

I need:
- Which option(s) you want to pursue
- The Apple Developer Team ID (if B or C) — found at
  https://developer.apple.com/account → Membership
- The Windows cert file + password (if A or C), stored as encrypted GitHub
  Secrets

## 2. Auto-update — where do releases live?

`electron-updater` needs a publish target.  The three realistic options:

### A. GitHub Releases (easiest, free for public repos)

Tag a release in this repo, run `electron-builder --publish always`, and
the binaries plus an `app-update.yml` manifest land on a GitHub Release.
Each user's installed app checks that endpoint at startup.

Need from you: confirmation that releases can be public (or that you're
OK paying for GitHub Pro for private-repo releases ~$4/user/mo).

### B. S3 bucket (private, scales)

Releases push to an S3 bucket; clients poll a manifest URL.

Need from you: an S3 bucket name + IAM access key/secret for the CI job,
stored as encrypted GitHub Secrets.

### C. Custom HTTPS endpoint (self-hosted)

You host the manifest + binaries on your own server.

Need from you: URL of the server + write credentials.

## What I'd implement once you decide

For **code signing** (Tier 4.1):
1. Add `electron-builder` signing config (`mac.identity`,
   `mac.notarize.teamId`, `win.certificateFile`).
2. Add a `release.yml` workflow that runs only on `v*` tags, signs the
   binaries, and uploads them.
3. Document the manual signing fallback in `PACKAGING.md`.

For **auto-update** (Tier 4.4):
1. Add `electron-updater` as a dependency.
2. Wire `autoUpdater.checkForUpdates()` into the Electron main process,
   gated on `app.isPackaged`.
3. Add a "Check for updates…" toolbar entry that surfaces the result via
   the same toast system the rest of the app uses.
4. Document the update channel + cadence in the user manual.

Until then, the current `electron:dist*` scripts continue producing
unsigned bundles that you can distribute manually.

---

**Once you've made the calls above, drop the answers into a follow-up
chat and I'll wire it all up in one pass.**
