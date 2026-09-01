import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isMainApplicationProcess, resetAttentionState } from "../lib/status-core";
import type { AgentId, SessionState } from "../lib/status-core";

const STATE_ROOT =
  process.env.MENUBAR_NOTIFICATIONS_STATE_DIR ??
  join(homedir(), "Library", "Application Support", "Menubar Notifications", "agent-status");
const execFileAsync = promisify(execFile);

function agentDirectory(agent: AgentId): string {
  return join(STATE_ROOT, "sessions", agent);
}

function isSessionState(value: unknown, agent: AgentId): value is SessionState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SessionState>;
  return (
    candidate.version === 1 &&
    candidate.agent === agent &&
    typeof candidate.sessionId === "string" &&
    ["idle", "working", "completed", "attention", "closed"].includes(candidate.status ?? "") &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.sourceEvent === "string"
  );
}

function stateFilename(sessionId: string): string {
  return `${createHash("sha256").update(sessionId).digest("hex")}.json`;
}

async function writeState(state: SessionState): Promise<void> {
  const directory = agentDirectory(state.agent);
  const destination = join(directory, stateFilename(state.sessionId));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      await rename(temporary, destination);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || attempt === 1) throw error;
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export async function readAgentSessions(agent: AgentId): Promise<SessionState[]> {
  const directory = agentDirectory(agent);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry): Promise<SessionState | null> => {
        try {
          const value: unknown = JSON.parse(await readFile(join(directory, entry), "utf8"));
          return isSessionState(value, agent) ? value : null;
        } catch {
          return null;
        }
      }),
  );
  return sessions.filter((session): session is SessionState => session !== null && session.status !== "closed");
}

export async function markCompletedAsRead(agent: AgentId, sessions: SessionState[]): Promise<SessionState[]> {
  const updated = await Promise.all(
    sessions.map(async (session) => {
      if (session.status !== "completed") return session;
      const next = resetAttentionState(session);
      await writeState(next);
      return next;
    }),
  );
  return updated;
}

export async function resetAgentAttention(agent: AgentId): Promise<void> {
  const sessions = await readAgentSessions(agent);
  await Promise.all(
    sessions.map(async (session) => {
      const next = resetAttentionState(session);
      if (next !== session) await writeState(next);
    }),
  );
}

export async function clearAgentState(agent: AgentId): Promise<void> {
  await rm(agentDirectory(agent), { recursive: true, force: true });
}

export async function isApplicationProcessRunning(
  processExecutable: string,
  excludedFragments: string[] = [],
): Promise<boolean> {
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "command="], { timeout: 1_000 });
  return stdout
    .split("\n")
    .map((command) => command.trim())
    .some((command) => isMainApplicationProcess(command, processExecutable, excludedFragments));
}
