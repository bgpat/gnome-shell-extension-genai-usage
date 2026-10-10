# Release

1. Run `bun test`, `bun run typecheck`, `bun run lint`, and `bun run pack`.
2. Install the zip with `bun run install:local` and confirm the top bar, menu, and both preference pages.
3. Confirm `metadata.json` `shell-version` lists only versions covered in [testing.md](testing.md).
4. Tag the commit, for example `v0.1.0`, and push the tag.

`.github/workflows/release.yml` runs the unit tests, builds `genai-usage@bgpat.github.io.zip`, and attaches it to the GitHub Release for that tag.

The extensions.gnome.org upload is the same zip. It must not contain `node_modules`, TypeScript, source maps, or the docs. `bun run pack` checks the file list.

Before uploading, read the [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html). In particular: no work before `enable()`, cleanup in `disable()`, no GTK in the shell process, no trademark logos in the zip, and no minified code.

The Fedora matrix in `test-multi-versions.yml` does not by itself change `shell-version`. Update the metadata only after inspecting a successful log.
