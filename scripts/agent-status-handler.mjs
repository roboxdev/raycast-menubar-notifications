#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import statusCore from "../lib/status-core.js";

const { classifyInvocation, isAgentId, transitionForHook } = statusCore;
const DEFAULT_STATE_ROOT = join(homedir(), "Library", "Application Support", "Menubar Notifications", "agent-status");
function parseArguments(argv) {
  const agentIndex = argv.indexOf("--agent");
  const agent = agentIndex >= 0 ? argv[agentIndex + 1] : null;
  return { agent, reset: argv.includes("--reset") };
}

async function readStandardInput(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

function stateRoot(env = process.env) {
  return env.MENUBAR_NOTIFICATIONS_STATE_DIR || DEFAULT_STATE_ROOT;
}

function agentDirectory(agent, env = process.env) {
  return join(stateRoot(env), "sessions", agent);
}

function statePath(agent, sessionId, env = process.env) {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return join(agentDirectory(agent, env), `${digest}.json`);
}

async function writeState(state, env = process.env) {
  const destination = statePath(state.agent, state.sessionId, env);
  const directory = dirname(destination);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT" || attempt === 1) throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

async function removeSession(agent, sessionId, env = process.env) {
  await rm(statePath(agent, sessionId, env), { force: true });
}

async function resetAgent(agent, env = process.env) {
  await rm(agentDirectory(agent, env), { recursive: true, force: true });
}

function processAncestors(startPid = process.ppid, maximumDepth = 16) {
  const commands = [];
  let pid = startPid;
  for (let depth = 0; depth < maximumDepth && pid > 1; depth += 1) {
    const result = spawnSync("/bin/ps", ["-o", "ppid=", "-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 1_000,
    });
    if (result.status !== 0 || !result.stdout.trim()) break;
    const line = result.stdout.trim();
    const match = line.match(/^(\d+)\s+(.*)$/s);
    if (!match) break;
    pid = Number(match[1]);
    commands.push(match[2]);
  }
  return commands;
}

async function handleHook({ agent, payload, env = process.env, ancestors = processAncestors() }) {
  if (!isAgentId(agent)) throw new Error("--agent must be codex or claude");
  if (!classifyInvocation(agent, ancestors, env)) return { ignored: true };

  const state = transitionForHook(agent, payload);
  if (!state) return { ignored: true };
  if (state.status === "closed") await removeSession(agent, state.sessionId, env);
  else await writeState(state, env);
  return { ignored: false, state };
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const { agent, reset } = parseArguments(argv);
  if (!isAgentId(agent)) throw new Error("Usage: agent-status-handler.mjs --agent <codex|claude> [--reset]");
  if (reset) {
    await resetAgent(agent, env);
    return;
  }
  const payload = await readStandardInput();
  await handleHook({ agent, payload, env });
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  main()
    .catch((error) => {
      console.error(`[menubar-notifications] ${error instanceof Error ? error.message : String(error)}`);
    })
    .finally(() => {
      // Stop hooks expect valid JSON on stdout. An empty object is non-steering.
      process.stdout.write("{}\n");
    });
}

export { handleHook, main, parseArguments, processAncestors, readStandardInput, resetAgent, statePath, writeState };
