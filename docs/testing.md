# Testing

Unit tests do not need a GNOME session or account credentials.

```sh
bun test
```

They cover quota selection, layout, formatting, JSON-RPC framing, ChatGPT and Cursor normalization fixtures, icon URL checks, and `glib-compile-schemas --strict`.

After `bun run build`:

```sh
gjs -m tests/gjs/subprocess.js
```

That test runs `/bin/echo`, stops `/bin/sleep` at a timeout, and cancels another sleep. It does not call Codex or Cursor.

## GitHub Actions

Workflow `uses` dependencies are pinned with [gh-actions-lock](https://github.com/github/gh-actions-lock) (`.github/workflows/actions.lock`). YAML refs stay major-only (e.g. `@v7`); run `gh actions-lock --no-narrow` after changing actions and commit the lockfile.

`.github/workflows/ci.yml`:

1. On every push and pull request, `ubuntu-latest` runs typecheck, lint, unit tests, packaging, [Shexli](https://pypi.org/project/shexli/) on the zip, and the GJS subprocess test.
2. `ubuntu-26.04` installs GNOME Shell and runs `tests/integration/smoke.sh`. Ubuntu 26.04 ships GNOME Shell 50. The script enables the extension in a private D-Bus session and checks `GetExtensionInfo`.

`.github/workflows/test-multi-versions.yml` (pull requests only):

3. `test-multi-versions.yml` runs headless `tests/integration/smoke.sh` on `ubuntu-26.04` (GNOME Shell 50) and `tests/integration/fedora-compat.sh` in Fedora 39–42 containers (packaging, unit tests, schema compile, GJS subprocess — no headless Shell in containers). A `report` job named **Shell versions** aggregates both. Versions are added to `metadata.json` only after the Ubuntu smoke run loads the extension.

`shell-version` currently lists 45, 46, and 50.

- 50 is validated by Ubuntu 26.04 CI (`gnome-shell --headless --virtual-monitor`, mutter 50.x).
- 46 was loaded with `gnome-shell --headless --virtual-monitor` on the development host (GNOME Shell 46.0 / mutter 46.2). `GetExtensionInfo` reported state ENABLED and an empty error string.
- 45 is included because the code uses the GNOME 45 extension model (ES modules, `Extension.enable` / `disable`, libadwaita 1.4 preferences) and no API added after 45. It has not had its own container run in this repository yet. Remove 45 from `metadata.json` if the Fedora 39 job in `test-multi-versions.yml` fails.

## Headless smoke locally

```sh
sh tests/integration/smoke.sh
```

The script uses a temporary `XDG_DATA_HOME` and `dbus-run-session`, so it does not install into the running session.
