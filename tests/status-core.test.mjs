import assert from "node:assert/strict";
import { test } from "node:test";
import statusCore from "../lib/status-core.js";

const {
  aggregateSessions,
  classifyInvocation,
  isMainApplicationProcess,
  reconcileActiveSessions,
  resetAttentionState,
  transitionForHook,
} = statusCore;
const now = new Date("2026-09-01T00:00:00.000Z");

function hook(agent, hook_event_name, extra = {}) {
  return transitionForHook(agent, { session_id: "session-1", hook_event_name, ...extra }, now);
}

test("maps lifecycle events without retaining payload content", () => {
  const state = transitionForHook(
    "codex",
    {
      session_id: "session-1",
      hook_event_name: "UserPromptSubmit",
      prompt: "private prompt",
      tool_input: { secret: "do not persist" },
    },
    now,
  );
  assert.equal(state.status, "working");
  assert.equal(JSON.stringify(state).includes("private prompt"), false);
  assert.equal(JSON.stringify(state).includes("do not persist"), false);
});

test("maps explicit input and permission events to attention", () => {
  assert.deepEqual(hook("codex", "PermissionRequest").attentionKind, "permission");
  assert.deepEqual(hook("codex", "PreToolUse", { tool_name: "request_user_input" }).attentionKind, "input");
  assert.deepEqual(
    hook("claude", "Notification", { notification_type: "agent_needs_input" }).attentionKind,
    "input",
  );
  assert.equal(hook("claude", "Notification", { notification_type: "idle_prompt" }).attentionKind, "input");
});

test("maps stop, failure, and session end", () => {
  assert.equal(hook("codex", "Stop").status, "completed");
  assert.equal(hook("claude", "StopFailure").attentionKind, "error");
  assert.equal(hook("codex", "SessionEnd").status, "closed");
});

test("aggregates attention over working and suppresses it in foreground", () => {
  const working = hook("codex", "UserPromptSubmit");
  const attention = hook("codex", "PermissionRequest");
  assert.equal(aggregateSessions([working, attention]), "attention");
  assert.equal(aggregateSessions([working, attention], { isForeground: true }), "working");
  assert.equal(aggregateSessions([attention], { isForeground: true }), "hidden");
});

test("keeps an active Codex turn working when a transient Stop arrives", () => {
  const completed = hook("codex", "Stop");
  const [active] = reconcileActiveSessions([completed], new Set([completed.sessionId]));
  assert.equal(active.status, "working");
  assert.equal(active.attentionKind, undefined);

  const [stopped] = reconcileActiveSessions([completed], new Set());
  assert.equal(stopped, completed);
});

test("does not suppress explicit attention or non-Codex completion", () => {
  const permission = hook("codex", "PermissionRequest");
  const claudeCompleted = hook("claude", "Stop");
  const [unchangedPermission, unchangedClaude] = reconcileActiveSessions(
    [permission, claudeCompleted],
    new Set([permission.sessionId, claudeCompleted.sessionId]),
  );
  assert.equal(unchangedPermission, permission);
  assert.equal(unchangedClaude, claudeCompleted);
});

test("manual reset clears only attention-like states", () => {
  const attention = hook("codex", "PermissionRequest");
  const working = hook("codex", "UserPromptSubmit");
  assert.equal(resetAttentionState(attention, now).status, "idle");
  assert.equal(resetAttentionState(working, now), working);
});

test("classifies desktop process ancestry and excludes personal Claude", () => {
  const codexDesktop = ["/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"];
  const codexCli = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Terminal.app/Contents/MacOS/Terminal",
  ];
  const claudeWork = ["/Applications/Claude.app/Contents/MacOS/Claude"];
  const claudeEmbedded = [
    "/Users/me/Library/Application Support/Claude/claude-code/2.1.247/claude.app/Contents/MacOS/claude",
  ];
  const claudePersonal = [
    "/Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/me/Library/Application Support/Claude-personal",
  ];
  assert.equal(classifyInvocation("codex", codexDesktop), true);
  assert.equal(classifyInvocation("codex", codexCli), false);
  assert.equal(classifyInvocation("claude", claudeWork), true);
  assert.equal(classifyInvocation("claude", claudeEmbedded), true);
  assert.equal(classifyInvocation("claude", claudePersonal), false);
});

test("detects main desktop processes without relying on Electron lock files", () => {
  const claudeExecutable = "/Applications/Claude.app/Contents/MacOS/Claude";
  assert.equal(isMainApplicationProcess(claudeExecutable, claudeExecutable, ["Claude-personal"]), true);
  assert.equal(
    isMainApplicationProcess(
      `${claudeExecutable} --user-data-dir=/Users/test/Library/Application Support/Claude-personal`,
      claudeExecutable,
      ["Claude-personal"],
    ),
    false,
  );
  assert.equal(
    isMainApplicationProcess(
      "/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper",
      claudeExecutable,
      ["Claude-personal"],
    ),
    false,
  );
});
