# Release

Releases follow the same pattern as [anchor-selector](https://github.com/bgpat/anchor-selector): [Release Drafter](https://github.com/release-drafter/release-drafter) maintains a draft GitHub Release on `main`, and publishing that release uploads the extension zip to extensions.gnome.org.

## Before the first automated publish

1. Configure GitHub repository secrets (Settings → Secrets and variables → Actions):
   - `EGO_USERNAME` — extensions.gnome.org account login.
   - `EGO_PASSWORD` — extensions.gnome.org account password.

   No deploy key is required: unlike anchor-selector, the packaged extension does not read its version from `package.json`, and EGO assigns the extension version on upload.
2. Label merged pull requests (`feature`, `fix`, `patch`, etc.) so Release Drafter can resolve semver.
3. Run through the manual checklist once: `bun test`, `bun run typecheck`, `bun run lint`, `bun run pack`, then `bun run install:local` and confirm the top bar, menu, and preference pages.
4. Confirm `metadata.json` `shell-version` lists only versions covered in [testing.md](testing.md).

## Day-to-day flow

1. Merge changes into `main`. CI runs tests and packaging.
2. The **release** workflow updates the draft release notes, runs `bun run pack`, and attaches `genai-usage@bgpat.github.io.zip` to the draft.
3. When the draft looks right, **Publish release** on GitHub with **Set as a pre-release** unchecked. The **publish** workflow runs only for full releases (not pre-releases) and uploads to extensions.gnome.org for review.

   If a release was published as a pre-release by mistake, clear the flag (GitHub **Edit release** or `gh release edit TAG --prerelease=false`). That emits a `released` event and triggers EGO upload.

The zip must not contain `node_modules`, TypeScript, source maps, or the docs. `bun run pack` checks the file list.

Before the first upload, read the [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html). In particular: no work before `enable()`, cleanup in `disable()`, no GTK in the shell process, no trademark logos in the zip, and no minified code.

The Fedora matrix in `test-multi-versions.yml` does not by itself change `shell-version`. Update the metadata only after inspecting a successful log.

## Local EGO upload

```sh
bun run pack
EGO_USERNAME=… EGO_PASSWORD=… bun run publish:ego
```
