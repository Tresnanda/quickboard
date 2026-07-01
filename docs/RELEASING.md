# Releasing Quickboard (in-app auto-update)

Quickboard self-updates: on launch it checks this repo's **latest GitHub Release**
for a `latest.json` feed and, if a newer signed build exists, offers "Install &
restart" (banner + Settings → Updates). Publishing is manual — you build and upload;
users' apps pick it up on their next launch.

## One-time setup (already done)

- **Signing key**: `~/.tauri/quickboard.key` (private — **never commit; back it up**)
  and `~/.tauri/quickboard.key.pub`. The public key is baked into
  `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
  > If you lose the private key you can't ship updates to installed apps — you'd
  > have to re-key and everyone reinstalls manually. Keep a backup (e.g. a password
  > manager).
- **Config**: `bundle.createUpdaterArtifacts: true` and the updater endpoint point
  at `https://github.com/Tresnanda/quickboard/releases/latest/download/latest.json`.

To add a password to the key later: `pnpm tauri signer generate -w ~/.tauri/quickboard.key -f`
(re-run before your first real release; it changes the pubkey, so update the config).

### Code signing (so permissions survive updates)

macOS ties an app's permissions (Accessibility, etc.) to its **code signature**. The
default ad-hoc signing produces a *different* signature every build, so macOS treats
each update as a new app and resets permissions. To avoid that, builds are signed with
a stable self-signed cert:

```sh
./scripts/setup-signing.sh   # one-time: creates + trusts "Quickboard Self-Signed" (asks for your password)
```

After that, `./scripts/release.sh` signs automatically (it exports `APPLE_SIGNING_IDENTITY`;
if the cert is missing it warns and builds unsigned). This is **not** Apple notarization —
Gatekeeper still shows "unidentified developer" on a fresh install (right-click → Open once);
for clean distribution to others you'd need an Apple Developer ID + notarization.

## Cut a release

1. **Bump the version** in `src-tauri/tauri.conf.json` (`"version"`). The updater
   only offers a build whose version is **higher** than what's installed (SemVer).
   Bump `package.json` too if you like them matched.
2. **Build + package** (signs the update and assembles `./release/`):
   ```sh
   ./scripts/release.sh            # build only
   ./scripts/release.sh --publish  # build + create the GitHub Release via `gh`
   ```
   The script sets the signing env vars, runs `pnpm tauri build`, then writes
   `release/latest.json` + copies the `.app.tar.gz` (the update payload) and the
   `.dmg` (for fresh installs).
3. **Publish** (if you didn't use `--publish`): create a GitHub Release tagged
   `v<version>`, mark it **Latest**, and upload the three files from `./release/`
   (`latest.json`, `*.app.tar.gz`, `*.dmg`).

That's it. Open installed apps will see the update on next launch.

## What the pieces are

- **`*.app.tar.gz`** — the update payload the installed app downloads and swaps in.
- **`*.app.tar.gz.sig`** — its signature; its contents go into `latest.json`.
- **`latest.json`** — the feed the endpoint serves. `version` + per-platform
  `signature`/`url`. The macOS-arm64 key is `darwin-aarch64`.
- **`*.dmg`** — only for people installing fresh; not used by the updater.

## Gotchas

- **First updater-enabled build must be installed manually.** The current prod app
  (v0.1.0, no updater) can't auto-update *to* the first updater build — drag that
  `.dmg` in once. Every release after that auto-updates.
- **Mark the release "Latest."** The endpoint resolves `releases/latest/...`; a
  pre-release/draft won't be served.
- **Intel + Apple Silicon.** `./scripts/release.sh` emits the key for the arch you
  build on. To cover both, build a universal app (`--target universal-apple-darwin`)
  and list the same archive under both `darwin-aarch64` and `darwin-x86_64`.
- **Gatekeeper.** The app isn't Apple-notarized. On *your* Mac auto-updates are
  fine (already approved). Distributing to others cleanly needs an Apple Developer
  cert + notarization (`bundle.macOS.signingIdentity` + notarization env), otherwise
  they hit "unidentified developer" on first launch.
