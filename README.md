# GenAI Usage

GNOME Shell extension that shows ChatGPT, Cursor, and Jev usage in the top bar.

UUID: `genai-usage@bgpat.github.io`

## What it can show

| Provider | Source | Plan | Quota | Reset | Credits | Billing |
| --- | --- | --- | --- | --- | --- | --- |
| ChatGPT | Official `codex app-server` (`account/read`, `account/rateLimits/read`) | Yes, when Codex returns `planType` | Five-hour and weekly windows when `windowDurationMins` is 300 or 10080. Other windows use a generic label. | `resetsAt` | `credits.balance` when present | Not provided by these methods |
| Cursor | Official `cursor-agent status` and `about` | `subscriptionTier` when the CLI returns it | Not available | Not available | Not available | Not available |
| Cursor, optional | Unofficial `GET https://cursor.com/api/usage-summary` | `membershipType` | Plan, Auto, and API percentages when those fields are present | Billing cycle end | Not provided by this response | On-demand amounts when `individualUsage.onDemand` is present |
| Jev (TypeSafe), optional | TypeSafe console billing overview (unofficial) | — | Share of unexpired credits when the grants account for the balance | — | Available credits in USD | — |

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

## Set up Jev

1. Sign in to the [TypeSafe console](https://console.typesafe.ai/billing) and select your organization.
2. Open your browser’s Network panel and reload Billing. Find the `/api/billing/overview` request and copy the value of its request `Cookie` header.
3. In **Services → Jev authentication**, paste the value into **Session cookie** and select **Save**. GNOME Keyring must be available and unlocked (`gir1.2-secret-1` and `gnome-keyring` on Ubuntu). **Forget** removes the saved cookie.
4. In **Services**, turn on **Show in top bar** and **Allow unofficial usage source** for Jev. Use **Refresh** in the top-bar menu to update the display.

If you used an earlier build with a `genai-usage/jev-cookie` file under your config directory, save the value in the keyring first. Once the balance appears, you can delete the old file. A nested Shell started with `bun run dev` uses a separate session bus and keyring. Save the cookie from the **Preferences** menu inside that Shell when testing there.

Jev shows the percentage of unexpired credits remaining or used in the top bar, dropdown menu, and General preview. The menu also shows the **Available credits** balance in USD. The percentage is available when the credit grants account for the full balance. The extension sends the session cookie only to the TypeSafe billing overview endpoint. The Jev inference API key cannot read this balance.

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

`bun run pack` writes `genai-usage@bgpat.github.io.zip`. The zip contains compiled JavaScript, `metadata.json`, the GSettings schema, and the stylesheet. It does not contain TypeScript, Bun, or `node_modules`.

More detail is in [docs/development.md](docs/development.md), [docs/testing.md](docs/testing.md), [docs/troubleshooting.md](docs/troubleshooting.md), and [docs/release.md](docs/release.md).

## Preferences

- **General** reorders visible and hidden providers. Drag a chip, or use Earlier / Later / Hide / Show. Ctrl+Left and Ctrl+Right reorder the focused chip. Ctrl+Up and Ctrl+Down move it between the lists.
- **Services** enables each provider, sets the CLI path, checks authentication, and chooses the top-bar quota.

Settings are stored in GSettings schema `org.gnome.shell.extensions.genai-usage`. Tokens and cookies are not stored there.

## License

MIT. See [LICENSE](LICENSE).

The Cursor usage request follows the session approach documented by [CodexBar](https://github.com/steipete/CodexBar) (MIT). This project does not copy CodexBar source code.

GNOME may distribute this extension under terms compatible with GPL-2.0-or-later.
