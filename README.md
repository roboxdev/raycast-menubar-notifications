# Menubar Notifications

A [Raycast](https://raycast.com) extension that surfaces unread counts from Mail, Telegram, Slack, GitHub, and Jira as separate macOS menu bar items.

Each source is its own menu bar command, so you can enable only the ones you need. Icons stay hidden while there is nothing to act on and appear — with a counter — as soon as something needs attention.

## Commands

| Command | What it shows | Refresh | Hidden when |
| --- | --- | --- | --- |
| **Mail Notifications** | Unread messages in the Apple Mail inbox | 1 min | Inbox is read |
| **Telegram Notifications** | Unread dialogs, muted chats excluded | 1 min | Nothing unread |
| **Slack Notifications** | The Slack app's dock badge count | 1 min | No unreads |
| **GitHub PR Notifications** | Pull requests requesting your review | 1 min | No PRs pending |
| **Jira In Progress** | Warns (red icon) when no issue is In Progress | 30 min | At least one issue is In Progress |

Clicking an item in the Mail, Telegram, and Slack menus just shows the count; GitHub and Jira menus list the actual items and open them in the browser. Every menu has a **Refresh** action for an immediate update.

## Requirements

- macOS with Raycast
- Node.js and [pnpm](https://pnpm.io)
- [GitHub CLI](https://cli.github.com) (`gh`), authenticated via `gh auth login` — for the GitHub command
- Telegram API credentials — for the Telegram command

## Installation

```bash
git clone <repository-url>
cd raycast-menubar-notifications
pnpm install
pnpm dev
```

`pnpm dev` builds the extension and registers it with Raycast in development mode. Open Raycast → Extensions to enable the individual menu bar commands.

## Configuration

Preferences are defined per command. Open Raycast → Extensions → Menubar Notifications, select a command, and fill in its fields.

### Telegram

| Preference | Description |
| --- | --- |
| `Telegram API ID` | API ID from [my.telegram.org](https://my.telegram.org) |
| `Telegram API Hash` | API hash from the same page |
| `Telegram Session Key` | A [GramJS](https://gram.js.org) `StringSession` value |

To generate the session key, run a one-off GramJS login script locally and copy the resulting string session. It authenticates as your Telegram account — treat it like a password and never commit it.

### Jira

| Preference | Description |
| --- | --- |
| `Jira Basic Auth` | Base64 of `email:api_token`, e.g. `printf 'you@example.com:TOKEN' \| base64` |
| `Jira Base URL` | e.g. `https://yourcompany.atlassian.net` |

Create the API token at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). The command queries `assignee = currentUser() AND status = "In Progress"`.

### Mail, Slack, GitHub

No preferences. They rely on local tooling instead:

- **Mail** runs AppleScript against Apple Mail. macOS will ask for automation permission on first run.
- **Slack** reads the app's dock badge via `lsappinfo`, so the Slack desktop app must be running.
- **GitHub** shells out to `gh search prs --review-requested=@me`. The path is hardcoded to `/opt/homebrew/bin/gh` (Apple Silicon Homebrew); adjust it in [src/github-prs.tsx](src/github-prs.tsx) for an Intel Mac or a different install location.

## Customization

Each command file starts with a couple of display flags you can flip:

```ts
const HIDE_WHEN_EMPTY = true; // hide the menu bar icon when there is nothing to show
const SHOW_COUNTER = true;    // show the numeric count next to the icon
```

Polling intervals live in the `commands` section of [package.json](package.json).

## Security

No credentials are stored in this repository. Everything sensitive is entered through Raycast preferences and kept in the macOS Keychain — the values in `package.json` are placeholders only.

## License

MIT
