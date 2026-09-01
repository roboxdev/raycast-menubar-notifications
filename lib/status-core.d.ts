export type AgentId = "codex" | "claude";
export type SessionStatus = "idle" | "working" | "completed" | "attention" | "closed";
export type AttentionKind = "permission" | "input" | "error" | "completed";
export type AggregateStatus = "hidden" | "working" | "attention";

export interface SessionState {
  version: 1;
  agent: AgentId;
  sessionId: string;
  status: SessionStatus;
  attentionKind?: AttentionKind;
  updatedAt: string;
  sourceEvent: string;
}

export function isAgentId(value: unknown): value is AgentId;
export function transitionForHook(agent: AgentId, payload: Record<string, unknown>, now?: Date): SessionState | null;
export function aggregateSessions(sessions: SessionState[], options?: { isForeground?: boolean }): AggregateStatus;
export function resetAttentionState(session: SessionState, now?: Date): SessionState;
export function classifyInvocation(agent: AgentId, ancestorCommands: string[], env?: Record<string, string>): boolean;
export function isMainApplicationProcess(
  command: string,
  executable: string,
  excludedFragments?: string[],
): boolean;
