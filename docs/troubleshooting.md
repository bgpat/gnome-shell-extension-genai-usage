# Troubleshooting

## The top bar shows an em dash

The provider is enabled, but it has no quota for the selected mode. ChatGPT needs a signed-in Codex CLI. Cursor percentages need the unofficial source. The menu text is the specific reason.

Choose **Hide the provider** or **Show only the icon** under General if the em dash is not useful. That setting does not change the stored numbers.

## ChatGPT says Codex was not found

Install the Codex CLI, or set its absolute path on the Services page. An empty path searches `PATH` and `~/.local/bin/codex`.

If Codex is installed but not signed in, run `codex login`. The extension does not ask for a password.

## Codex times out or returns an error

`codex app-server` is experimental. Update the Codex CLI and refresh from the menu. One provider failing does not stop the other. Automatic refresh backs off after failures, up to 30 minutes. **Refresh** ignores that delay.

## Cursor shows a plan but no percentage

That is the official CLI result. `cursor-agent about` can include `subscriptionTier` and still omit quota. Enable **Allow unofficial usage source**, then use **Load** next to quota choices.

If loading fails:

- Sign in with the Cursor app or `cursor-agent login`.
- Install `sqlite3` if only the Cursor app database is present.
- A token that expires within 60 seconds is ignored. Sign in again. The extension does not refresh tokens.

## Icons are generic shapes

Web download is on by default. A failed download falls back to the icon theme (`chatgpt`, `co.anysphere.cursor`) and then to the bundled shapes. ChatGPT's own site often blocks favicon requests, so the default URL is the Wikimedia SVG. You can set another HTTPS URL per provider. **Clear** on the General page deletes the icon cache.

## Settings do not apply

They are read when the keys change. Disable and enable the extension if a build was installed while it was running. A full shell restart is required after changing files that were already imported.

## Logs

Failures are logged once per refresh with `console.warn`, with JWT-like strings removed. Journal entries are under the GNOME Shell process:

```sh
journalctl /usr/bin/gnome-shell -f
```
