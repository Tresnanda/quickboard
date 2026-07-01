## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Shipping a release

quickboard self-updates via the Tauri updater (checks GitHub Releases on launch).
To ship:

1. Bump `version` in `src-tauri/tauri.conf.json` (also `package.json` + `src-tauri/Cargo.toml`/`Cargo.lock` to match). The updater only offers a build whose SemVer is higher than the installed one.
2. `./scripts/release.sh --publish` — builds, signs (key at `~/.tauri/quickboard.key`, never committed), and publishes the GitHub Release with `latest.json` + artifacts.

Installed apps offer the update on their next launch. The repo must stay **public** so the feed is anonymously fetchable. Full runbook + gotchas: `docs/RELEASING.md`.
