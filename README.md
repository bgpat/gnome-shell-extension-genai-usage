# GenAI Usage

GNOME Shell extension that shows ChatGPT and Cursor usage in the top bar.

UUID: `genai-usage@bgpat.github.io`

## What it can show

| Provider | Source | Plan | Quota | Reset | Credits | Billing |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Official `codex app-server` (`account/read`, `account/rateLimits/read`) | Yes, when Codex returns `planType` | Five-hour and weekly windows when `windowDurationMins` is 300 or 10080. Other windows use a generic label. | `resetsAt` | `credits.balance` when present | Not provided by these methods |
| Cursor | Official `cursor-agent status` and `about` | `subscriptionTier` when the CLI returns it | Not available | Not available | Not available | Not available |
| Cursor, optional | Unofficial `GET https://cursor.com/api/usage-summary` | `membershipType` | Plan, Auto, and API percentages when those fields are present | Billing cycle end | Not provided by this response | On-demand amounts when `individualUsage.onDemand` is present |

Missing values stay missing. They are not shown as zero.

The unofficial Cursor source is off by default. It reads the access token already stored by Cursor or `cursor-agent login` and does not ask for a password. See [docs/providers.md](docs/providers.md).

Provider icons are downloaded over HTTPS when **Download provider icons** is on (the default). The extension package does not include trademark logos.

## Requirements

- GNOME Shell 45 or 46
- ChatGPT: [Codex CLI](https://github.com/openai/codex), signed in with `codex login`
- Cursor official status: [`cursor-agent`](https://cursor.com/docs/cli/overview), signed in with `cursor-agent login`
- Cursor quota: the unofficial switch, plus either Cursor's `state.vscdb` or `~/.config/cursor/auth.json`, and the `sqlite3` CLI for the database
- `glib-compile-schemas` and `zip` to build a package

`codex app-server` is documented as experimental.

## Install from a package

```sh
gnome-extensions install --force genai-usage@bgpat.github.io.zip
gnome-extensions enable genai-usage@bgpat.github.io
```

On Wayland, log out and back in if the extension does not appear. On X11, `Alt+F2` then `r` reloads GNOME Shell.

## Development

Commands use [Bun](https://bun.sh/).

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

`bun run pack` writes `genai-usage@bgpat.github.io.zip`. The zip contains compiled JavaScript, `metadata.json`, the GSettings schema, the stylesheet, and the fallback icons. It does not contain TypeScript, Bun, or `node_modules`.

More detail is in [docs/development.md](docs/development.md), [docs/testing.md](docs/testing.md), [docs/troubleshooting.md](docs/troubleshooting.md), and [docs/release.md](docs/release.md).

## Preferences

- **General** reorders visible and hidden providers. Drag a chip, or use Earlier / Later / Hide / Show. Ctrl+Left and Ctrl+Right reorder the focused chip. Ctrl+Up and Ctrl+Down move it between the lists.
- **Services** enables each provider, sets the CLI path, checks authentication, and chooses the top-bar quota.

Settings are stored in GSettings schema `org.gnome.shell.extensions.genai-usage`. Tokens and cookies are not stored there.

## License

MIT. See [LICENSE](LICENSE).

The Cursor usage request follows the session approach documented by [CodexBar](https://github.com/steipete/CodexBar) (MIT). This project does not copy CodexBar source code.

GNOME may distribute this extension under terms compatible with GPL-2.0-or-later.
