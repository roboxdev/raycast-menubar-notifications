# Menubar Notifications

A personal [Raycast](https://raycast.com) extension that keeps actionable notifications and local AI agent status visible in the macOS menu bar.

Each source is an independent menu bar command, so it can be enabled or disabled separately. Most icons stay hidden while there is nothing to act on.

## Commands

| Command | What it shows | Refresh | Hidden when |
| --- | --- | --- | --- |
| **Mail Notifications** | Unread Apple Mail messages | 1 min | Inbox is read |
| **Telegram Notifications** | Unread dialogs, excluding muted chats | 1 min | Nothing is unread |
| **Slack Notifications** | Slack's dock badge count | 1 min | Nothing is unread |
| **GitHub PR Notifications** | Pull requests requesting your review | 1 min | No reviews are pending |
| **Jira In Progress** | A warning when no assigned issue is In Progress | 30 min | At least one issue is In Progress |
| **Codex Status** | Codex Desktop working or attention state | 10 sec | Codex is closed or idle |
| **Claude Status** | Default Claude Desktop profile working or attention state | 10 sec | Claude is closed or idle |

Agent icons use the system text color while an agent is working and turn red when a session needs input, permission, or attention after completing in the background.

## Requirements

- macOS with Raycast
- Node.js 22.22.2 or newer
- [pnpm](https://pnpm.io)
- [GitHub CLI](https://cli.github.com) (`gh`), authenticated with `gh auth login`, for GitHub PRs
- Telegram API credentials for Telegram notifications
- Codex Desktop at `/Applications/ChatGPT.app` and Claude Desktop at `/Applications/Claude.app` for agent status

## Installation

```sh
pnpm install
pnpm dev
```

Run the commands you want once from Raycast and enable their menu bar items under Raycast → Extensions → Menubar Notifications.

## Configuration

### Telegram

Set the Telegram API ID, API hash, and GramJS `StringSession` in the command preferences. Treat the session value like a password.

### Jira

Set the Jira base URL and Basic Auth value (base64-encoded `email:api_token`) in the command preferences. The command queries `assignee = currentUser() AND status = "In Progress"`.

### Mail, Slack, and GitHub

- Mail uses AppleScript and may request macOS automation permission.
- Slack reads the running app's dock badge through `lsappinfo`.
- GitHub invokes `/opt/homebrew/bin/gh search prs --review-requested=@me`.

## Agent status hooks

The stable launcher path is:

```text
/Users/robox/Projects/raycast-menubar-notifications/scripts/agent-status-hook
```

It selects the most recently installed NVM Node runtime, falling back to `node` on `PATH`. Set `MENUBAR_NOTIFICATIONS_NODE` to override discovery.

Status files contain only allowlisted lifecycle metadata and are stored under:

```text
~/Library/Application Support/Menubar Notifications/agent-status/sessions/
```

Prompts, assistant messages, tool inputs, and tool outputs are never persisted.
The menu resolves display-only session names from Codex's local session index or Claude
Desktop's session metadata, using Claude's runtime process name only as a fallback. These
names are read at refresh time and are not copied into the status files.
For Codex, an active turn recorded in the local thread history takes precedence over a
transient `Stop` hook, preventing the icon from flashing red between multi-step updates.

Configure the following lifecycle events to invoke the launcher with `--agent codex` in `~/.codex/hooks.json`:

```text
SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
PermissionRequest, Stop, SessionEnd
```

Configure the same launcher with `--agent claude` in `~/.claude/settings.json` for:

```text
SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
PermissionRequest, Notification, Stop, StopFailure, SessionEnd
```

The Claude `Notification` matcher is:

```text
permission_prompt|idle_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input
```

The handler accepts Codex events only from ChatGPT Desktop ancestry. For Claude it accepts the default desktop profile and rejects `Claude-personal` and unrelated CLI sessions.

### Diagnostics

Clear one agent's state:

```sh
scripts/agent-status-hook --agent codex --reset
scripts/agent-status-hook --agent claude --reset
```

Send a synthetic terminal event by explicitly bypassing desktop ancestry filtering:

```sh
printf '%s' '{"session_id":"diagnostic","hook_event_name":"PermissionRequest"}' | \
  MENUBAR_NOTIFICATIONS_ALLOW_UNSCOPED=1 \
  scripts/agent-status-hook --agent codex
```

## Development

```sh
pnpm test
pnpm lint
pnpm build
pnpm dev
```

This is a personal extension and is not intended for publication. Agent menu bar assets are packaged locally; runtime code does not read icons from `/Applications`.
