# Development

The extension is written in TypeScript and compiled with `tsc` to plain ES modules. GNOME Shell loads `extension.js` and `prefs.js`. Shared code stays in separate files. Nothing is bundled or minified.

| Directory | May import |
| --- | --- |
| `src/lib` | No `gi://` modules. Covered by `bun test`. |
| `src/gjs` | Gio, GLib, Soup. Used by the shell and preferences processes. |
| `src/shell` | St, PanelMenu, PopupMenu. Not imported by preferences. |
| `src/prefs` | Gtk, Adw. Not imported by the shell. |

Preferences stay on libadwaita 1.4 widgets (`PreferencesWindow`, `PreferencesPage`, `PreferencesGroup`, `ActionRow`, `SwitchRow`, `EntryRow`, `ComboRow`) so GNOME 45 remains possible. `Adw.PreferencesDialog`, `ButtonRow`, and `ToggleGroup` are not used.

Preferences tab icons use **`icon_name` from the system icon theme only** (see `src/prefs/pageIcons.ts`). Do not bundle custom SVG/PNG icons for tabs or register an extension `icons/` search path. Pick names that exist in Adwaita (often under `symbolic/actions/`); unknown names show as a generic gear.

Subprocesses are started with `Gio.Subprocess` and an argument vector. The shell path is not used. `disable()` cancels the current operation and calls `force_exit()` on processes the extension started.

GSettings:

- `org.gnome.shell.extensions.genai-usage`
- relocatable `org.gnome.shell.extensions.genai-usage.provider` at `/org/gnome/shell/extensions/genai-usage/providers/<id>/`

Provider order and the hidden list keep entries for providers that are temporarily disabled.

## Commands

```sh
bun install
bun run typecheck
bun run lint
bun test
bun run build
bun run pack
bun run dev
bun run dev:prefs
bun run install:local
bun run clean
```

### `bun run dev`

Runs the extension inside a nested GNOME Shell with an isolated `XDG_DATA_HOME` and `XDG_CONFIG_HOME`. Use this to verify the panel, menu, and D-Bus services without enabling the extension on the login session.

### `bun run dev:prefs`

Opens the preferences window from the current tree without installing the extension under `~/.local/share/gnome-shell/extensions/`. It runs `pack`, unpacks into `$TMPDIR/genai-usage-prefs-dev/`, and launches `gjs -m scripts/prefs-dev-entry.js` with isolated GSettings (`XDG_DATA_HOME` / `XDG_CONFIG_HOME`). Extension code under `data/` is replaced on every run; GSettings under `config/` persist across runs.

Requirements on the host:

- `gjs`, `unzip`, `glib-compile-schemas` (via `pack`)
- GNOME Shell extensions gresource (default: `/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource`, override with `GENAI_SHELL_EXTENSIONS_GRESOURCE`)
- Shew typelibs (default: `/usr/lib/gnome-shell/girepository-1.0`, override with `GENAI_SHELL_TYPELIB_DIR`)

Do **not** use `gnome-extensions prefs` for day-to-day UI work on a dirty host install; it goes through the login Shell and stale `extension.js` / D-Bus data.

**D-Bus while `dev:prefs` is running:** the prefs process uses the **login session bus**. If the extension is enabled on the host Shell, General preview and the Log tab can show Usage/Log from that Shell. If the extension is disabled or uninstalled on the host, preview falls back to `refreshProvider` inside prefs and the Log tab stays empty (no Shell log store).

**CSS warnings:** prefs loads `stylesheet.css`, which includes St-only properties for the panel. GTK’s parser warns on those lines; prefs-specific rules still apply.

### `bun run install:local`

Packages the extension, installs it with `gnome-extensions install --force`, and enables it on the login session. Reload the Shell (disable/enable or restart) after updating files while the extension is already loaded.
