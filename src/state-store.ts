import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { isMainApplicationProcess, reconcileActiveSessions, resetAttentionState } from "../lib/status-core";
import type { AgentId, SessionState } from "../lib/status-core";

const STATE_ROOT =
  process.env.MENUBAR_NOTIFICATIONS_STATE_DIR ??
  join(homedir(), "Library", "Application Support", "Menubar Notifications", "agent-status");
const execFileAsync = promisify(execFile);

export interface SessionDisplayInfo {
  title: string;
  context?: string;
}

interface ClaudeSessionMetadata {
  sessionId?: unknown;
  cliSessionId?: unknown;
  title?: unknown;
  name?: unknown;
  cwd?: unknown;
}

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

async function readActiveCodexSessionIds(): Promise<Set<string>> {
  try {
    const codexDirectory = join(homedir(), ".codex");
    const databases = (await readdir(codexDirectory))
      .map((entry) => ({ entry, match: entry.match(/^thread_history_(\d+)\.sqlite$/) }))
      .filter((candidate): candidate is { entry: string; match: RegExpMatchArray } => candidate.match !== null)
      .sort((left, right) => Number(right.match[1]) - Number(left.match[1]));
    if (databases.length === 0) return new Set();

    const database = join(codexDirectory, databases[0].entry);
    const { stdout } = await execFileAsync(
      "/usr/bin/sqlite3",
      ["-readonly", database, "SELECT DISTINCT thread_id FROM thread_turns WHERE status = 'inProgress';"],
      { timeout: 1_000 },
    );
    return new Set(
      stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    // Codex's local history is an optional refinement; hook state remains the fallback.
    return new Set();
  }
}

export async function reconcileAgentActivity(agent: AgentId, sessions: SessionState[]): Promise<SessionState[]> {
  if (agent !== "codex" || !sessions.some((session) => session.status === "completed")) return sessions;
  return reconcileActiveSessions(sessions, await readActiveCodexSessionIds());
}

async function readCodexSessionInfo(): Promise<Map<string, SessionDisplayInfo>> {
  const result = new Map<string, SessionDisplayInfo>();
  try {
    const content = await readFile(join(homedir(), ".codex", "session_index.jsonl"), "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
        if (typeof entry.id === "string" && typeof entry.thread_name === "string" && entry.thread_name.trim()) {
          result.set(entry.id, { title: entry.thread_name.trim() });
        }
      } catch {
        // A malformed index entry should not hide the remaining session names.
      }
    }
  } catch {
    // The index is optional and may not exist before the first Codex session.
  }
  return result;
}

async function readClaudeSessionInfo(): Promise<Map<string, SessionDisplayInfo>> {
  const result = new Map<string, SessionDisplayInfo>();
  const runtimeDirectory = join(homedir(), ".claude", "sessions");
  let entries: string[];
  try {
    entries = await readdir(runtimeDirectory);
  } catch {
    entries = [];
  }

  await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) => {
        try {
          const metadata = JSON.parse(await readFile(join(runtimeDirectory, entry), "utf8")) as ClaudeSessionMetadata;
          if (typeof metadata.sessionId !== "string") return;
          const name = typeof metadata.name === "string" && metadata.name.trim() ? metadata.name.trim() : undefined;
          const cwd = typeof metadata.cwd === "string" && metadata.cwd.trim() ? metadata.cwd.trim() : undefined;
          const projectName = cwd ? basename(cwd) : undefined;
          result.set(metadata.sessionId, {
            title: name ?? projectName ?? `Session ${metadata.sessionId.slice(0, 8)}`,
            context: name && projectName && name !== projectName ? projectName : undefined,
          });
        } catch {
          // Session metadata is best-effort; hooks remain the source of status truth.
        }
      }),
  );

  const desktopDirectory = join(homedir(), "Library", "Application Support", "Claude", "claude-code-sessions");
  try {
    const desktopEntries = await readdir(desktopDirectory, { recursive: true });
    await Promise.all(
      desktopEntries
        .filter((entry) => entry.endsWith(".json"))
        .map(async (entry) => {
          try {
            const metadata = JSON.parse(await readFile(join(desktopDirectory, entry), "utf8")) as ClaudeSessionMetadata;
            const title =
              typeof metadata.title === "string" && metadata.title.trim() ? metadata.title.trim() : undefined;
            if (!title) return;
            const cwd = typeof metadata.cwd === "string" && metadata.cwd.trim() ? metadata.cwd.trim() : undefined;
            const info = { title, context: cwd ? basename(cwd) : undefined };
            if (typeof metadata.cliSessionId === "string") result.set(metadata.cliSessionId, info);
            if (typeof metadata.sessionId === "string") result.set(metadata.sessionId, info);
          } catch {
            // Ignore incomplete metadata while Claude Desktop is updating it.
          }
        }),
    );
  } catch {
    // Runtime metadata above remains a usable fallback for older Claude versions.
  }
  return result;
}

export async function readSessionDisplayInfo(agent: AgentId): Promise<Map<string, SessionDisplayInfo>> {
  return agent === "codex" ? readCodexSessionInfo() : readClaudeSessionInfo();
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
