import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { handleHook, resetAgent } from "../scripts/agent-status-handler.mjs";

const baseEnv = {
  MENUBAR_NOTIFICATIONS_ALLOW_UNSCOPED: "1",
};

test("handler writes one allowlisted atomic session file and removes it on SessionEnd", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-status-handler-"));
  const env = { ...baseEnv, MENUBAR_NOTIFICATIONS_STATE_DIR: root };
  await handleHook({
    agent: "codex",
    payload: {
      session_id: "abc",
      hook_event_name: "PermissionRequest",
      prompt: "must not be written",
      tool_input: { password: "secret" },
    },
    env,
    ancestors: [],
  });

  const directory = join(root, "sessions", "codex");
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  const content = await readFile(join(directory, entries[0]), "utf8");
  assert.equal(content.includes("must not be written"), false);
  assert.equal(content.includes("secret"), false);
  assert.equal(JSON.parse(content).attentionKind, "permission");

  await handleHook({
    agent: "codex",
    payload: { session_id: "abc", hook_event_name: "SessionEnd" },
    env,
    ancestors: [],
  });
  assert.deepEqual(await readdir(directory), []);
  await resetAgent("codex", env);
});

test("handler ignores unscoped terminal events", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-status-handler-"));
  const result = await handleHook({
    agent: "codex",
    payload: { session_id: "abc", hook_event_name: "UserPromptSubmit" },
    env: { MENUBAR_NOTIFICATIONS_STATE_DIR: root },
    ancestors: ["/Applications/Terminal.app/Contents/MacOS/Terminal"],
  });
  assert.equal(result.ignored, true);
});

test("concurrent writes for one session use distinct atomic temporary files", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-status-handler-"));
  const env = { ...baseEnv, MENUBAR_NOTIFICATIONS_STATE_DIR: root };
  const originalDateNow = Date.now;
  Date.now = () => 42;
  try {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        handleHook({
          agent: "codex",
          payload: { session_id: "concurrent", hook_event_name: index % 2 === 0 ? "PreToolUse" : "PostToolUse" },
          env,
          ancestors: [],
        }),
      ),
    );
  } finally {
    Date.now = originalDateNow;
  }

  const directory = join(root, "sessions", "codex");
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  assert.equal(JSON.parse(await readFile(join(directory, entries[0]), "utf8")).sessionId, "concurrent");
});
