# Development

The extension is written in TypeScript and compiled with `tsc` to plain ES modules. GNOME Shell loads `extension.js` and `prefs.js`. Shared code stays in separate files. Nothing is bundled or minified.

| Directory | May import |
| --- | --- |
| `src/lib` | No `gi://` modules. Covered by `bun test`. |
| `src/gjs` | Gio, GLib, Soup. Used by the shell and preferences processes. |
| `src/shell` | St, PanelMenu, PopupMenu. Not imported by preferences. |
| `src/prefs` | Gtk, Adw. Not imported by the shell. |

Preferences stay on libadwaita 1.4 widgets (`PreferencesWindow`, `PreferencesPage`, `PreferencesGroup`, `ActionRow`, `SwitchRow`, `EntryRow`, `ComboRow`) so GNOME 45 remains possible. `Adw.PreferencesDialog`, `ButtonRow`, and `ToggleGroup` are not used.

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
bun run install:local
bun run clean
```

`install:local` packages the extension, installs it with `gnome-extensions install --force`, and enables it.
