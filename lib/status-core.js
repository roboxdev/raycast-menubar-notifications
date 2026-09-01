"use strict";

const AGENTS = ["codex", "claude"];
const ATTENTION_TOOL_NAMES = new Set([
  "askuserquestion",
  "ask_user_question",
  "request_user_input",
  "functions.request_user_input",
  "mcp__request_user_input",
]);
const ATTENTION_NOTIFICATIONS = new Set([
  "permission_prompt",
  "idle_prompt",
  "elicitation_dialog",
  "elicitation_url_dialog",
  "agent_needs_input",
]);

function isAgentId(value) {
  return AGENTS.includes(value);
}

function normalizeToolName(value) {
  return typeof value === "string" ? value.replaceAll("-", "_").toLowerCase() : "";
}

function isAttentionTool(value) {
  const toolName = normalizeToolName(value);
  return ATTENTION_TOOL_NAMES.has(toolName) || toolName.endsWith("__request_user_input");
}

function transitionForHook(agent, payload, now = new Date()) {
  if (!isAgentId(agent) || !payload || typeof payload !== "object") return null;

  const event = typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
  const sessionId =
    typeof payload.session_id === "string"
      ? payload.session_id
      : typeof payload["thread-id"] === "string"
        ? payload["thread-id"]
        : null;
  if (!sessionId) return null;

  const base = {
    version: 1,
    agent,
    sessionId,
    status: "idle",
    updatedAt: now.toISOString(),
    sourceEvent: event || "Unknown",
  };

  switch (event) {
    case "SessionStart":
      return base;
    case "UserPromptSubmit":
    case "PostToolUse":
      return { ...base, status: "working" };
    case "PreToolUse":
      return isAttentionTool(payload.tool_name)
        ? { ...base, status: "attention", attentionKind: "input" }
        : { ...base, status: "working" };
    case "PermissionRequest":
      return { ...base, status: "attention", attentionKind: "permission" };
    case "Notification": {
      const notificationType = typeof payload.notification_type === "string" ? payload.notification_type : "";
      if (!ATTENTION_NOTIFICATIONS.has(notificationType)) return null;
      return {
        ...base,
        status: "attention",
        attentionKind: notificationType === "permission_prompt" ? "permission" : "input",
      };
    }
    case "StopFailure":
      return { ...base, status: "attention", attentionKind: "error" };
    case "Stop":
      return { ...base, status: "completed", attentionKind: "completed" };
    case "SessionEnd":
      return { ...base, status: "closed" };
    default:
      return null;
  }
}

function aggregateSessions(sessions, options = {}) {
  const isForeground = options.isForeground === true;
  if (!isForeground && sessions.some((session) => session.status === "attention" || session.status === "completed")) {
    return "attention";
  }
  if (sessions.some((session) => session.status === "working")) return "working";
  return "hidden";
}

function resetAttentionState(session, now = new Date()) {
  if (session.status !== "attention" && session.status !== "completed") return session;
  const { attentionKind: _attentionKind, ...rest } = session;
  return {
    ...rest,
    status: "idle",
    updatedAt: now.toISOString(),
    sourceEvent: "ManualReset",
  };
}

function classifyInvocation(agent, ancestorCommands, env = {}) {
  if (!isAgentId(agent)) return false;
  if (env.MENUBAR_NOTIFICATIONS_ALLOW_UNSCOPED === "1") return true;

  const commands = Array.isArray(ancestorCommands) ? ancestorCommands : [];
  if (agent === "codex") {
    return commands.some((command) => command.includes("/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"));
  }

  const isPersonal = commands.some(
    (command) => command.includes("Claude-personal") || /--user-data-dir(?:=|\s+).*Claude-personal/.test(command),
  );
  if (isPersonal) return false;
  return commands.some(
    (command) =>
      command.includes("/Applications/Claude.app/Contents/MacOS/Claude") ||
      (command.includes("/Library/Application Support/Claude/claude-code/") &&
        command.includes("/claude.app/Contents/MacOS/claude")),
  );
}

function isMainApplicationProcess(command, executable, excludedFragments = []) {
  if (typeof command !== "string" || typeof executable !== "string") return false;
  const isMainProcess = command === executable || command.startsWith(`${executable} `);
  return isMainProcess && !excludedFragments.some((fragment) => command.includes(fragment));
}

module.exports = {
  AGENTS,
  aggregateSessions,
  classifyInvocation,
  isAgentId,
  isMainApplicationProcess,
  resetAttentionState,
  transitionForHook,
};
