# Provider capabilities

This page separates official behavior, optional unofficial behavior, and data the extension does not claim to have.

## ChatGPT

Official interface: `codex app-server` over stdio, newline-delimited JSON-RPC. The extension starts the process, sends `initialize`, then `initialized`, then `account/read` and `account/rateLimits/read`, then terminates the process. It uses the Codex login already on the machine.

| Field | Behavior |
| --- | --- |
| Plan | `account.planType` for a ChatGPT account, otherwise `rateLimits.planType` |
| Five-hour quota | `primary` or `secondary` window whose `windowDurationMins` is 300 |
| Weekly quota | window whose `windowDurationMins` is 10080 |
| Other windows | shown with a duration label such as `15 min` |
| Remaining percentage | `100 - usedPercent` when `usedPercent` is a finite number |
| Reset | `resetsAt` as a Unix timestamp in seconds |
| Credits | `credits.balance`, `credits.unlimited`, or `credits.hasCredits` when present |
| Billing | not returned by these methods, so the menu omits it |
| Signed out | `requiresOpenaiAuth` with no account becomes an unavailable state |

`usedPercent` of `0` is real zero usage. A missing window is omitted, not stored as 0%.

The top-bar choices are five-hour, weekly, and lowest remaining. If the chosen window is absent, the top bar follows the unavailable-data setting.

OpenAI documents `codex app-server` as experimental and not supported for production workloads. The protocol can change between Codex releases.

## Cursor, official

Commands:

- `cursor-agent status --format json`
- `cursor-agent about --format json`

`status` reports whether the CLI is authenticated. `about` may include `subscriptionTier`. Neither command reports remaining quota, reset time, credits, or billing. The extension leaves those fields unset and says so in the menu.

There is no `cursor-agent usage` command and no documented noninteractive `/usage` mode in the CLI help.

## Cursor, unofficial and off by default

Turning on **Allow unofficial usage source** does three things:

1. Read `cursorAuth/accessToken` from `$XDG_CONFIG_HOME/Cursor/User/globalStorage/state.vscdb` with `sqlite3 -readonly`, when that file and the `sqlite3` CLI exist.
2. Otherwise read `accessToken` from `$XDG_CONFIG_HOME/cursor/auth.json`.
3. If the JWT expires more than 60 seconds from now, send `GET https://cursor.com/api/usage-summary` with a `WorkosCursorSessionToken` cookie built from the token.

The extension does not refresh the token, write either file, read browser cookies, or read any database key except `cursorAuth/accessToken`.

Verified on 2026-10-10 against a signed-in local Cursor session:

- Both token files were readable.
- `usage-summary` returned HTTP 200.
- `membershipType`, `billingCycleStart`, `billingCycleEnd`, and `individualUsage.plan.totalPercentUsed`, `autoPercentUsed`, and `apiPercentUsed` were present.
- `plan.used`, `plan.limit`, and `plan.remaining` did not match those percentages (`remaining` was 0 while `totalPercentUsed` was about 33). The extension uses the percentage fields only.

Quota choices in preferences are filled from that response. Options that are not in the response are not listed. `lowest` is offered only when more than one percentage exists.

On-demand billing is shown only when `individualUsage.onDemand.used` or, if that is absent, `teamUsage.onDemand.used` is a number. Values are cents converted to USD, which is how CodexBar documents those fields. A missing object is not shown as $0.

Pooled team usage is used only when no individual percentage exists and both `teamUsage.pooled.used` and `limit` are numbers with a positive limit.

## Not implemented

- Browser cookie import
- Cursor Admin API or Analytics API (Enterprise)
- Codex token entry or password prompts
- Writing account data to GSettings or to a disk cache other than downloaded icons
