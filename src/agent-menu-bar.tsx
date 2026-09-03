import { useCallback, useEffect, useState } from "react";
import { Color, getFrontmostApplication, MenuBarExtra } from "@raycast/api";
import { aggregateSessions } from "../lib/status-core";
import type { AggregateStatus, SessionState } from "../lib/status-core";
import type { AgentConfig } from "./agent-config";
import {
  clearAgentState,
  isApplicationProcessRunning,
  markCompletedAsRead,
  readAgentSessions,
  readSessionDisplayInfo,
  reconcileAgentActivity,
} from "./state-store";

interface DisplaySession extends SessionState {
  title: string;
  context?: string;
}

interface ViewState {
  isLoading: boolean;
  status: AggregateStatus;
  sessions: DisplaySession[];
}

function visibleSessions(sessions: DisplaySession[], status: AggregateStatus): DisplaySession[] {
  const filtered = sessions.filter((session) =>
    status === "attention"
      ? session.status === "attention" || session.status === "completed"
      : session.status === "working",
  );
  return filtered.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function AgentMenuBar({ config }: { config: AgentConfig }) {
  const [view, setView] = useState<ViewState>({ isLoading: true, status: "hidden", sessions: [] });

  const refresh = useCallback(async () => {
    try {
      const isRunning = await isApplicationProcessRunning(config.processExecutable, config.excludedProcessFragments);
      if (!isRunning) {
        await clearAgentState(config.id);
        setView({ isLoading: false, status: "hidden", sessions: [] });
        return;
      }

      const frontmost = await getFrontmostApplication();
      const isForeground = frontmost.bundleId === config.bundleId;
      let sessions = await readAgentSessions(config.id);
      sessions = await reconcileAgentActivity(config.id, sessions);
      if (isForeground) sessions = await markCompletedAsRead(config.id, sessions);
      const status = aggregateSessions(sessions, { isForeground });
      const displayInfo = await readSessionDisplayInfo(config.id);
      const displaySessions = sessions.map((session) => ({
        ...session,
        title: displayInfo.get(session.sessionId)?.title ?? `Session ${session.sessionId.slice(0, 8)}`,
        context: displayInfo.get(session.sessionId)?.context,
      }));
      setView({ isLoading: false, status, sessions: visibleSessions(displaySessions, status) });
    } catch (error) {
      console.error(`Failed to refresh ${config.displayName} status`, error);
      setView({ isLoading: false, status: "hidden", sessions: [] });
    }
  }, [config]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (view.isLoading) return <MenuBarExtra isLoading />;
  if (view.status === "hidden") return null;

  const icon = {
    source: config.icon,
    tintColor: view.status === "attention" ? Color.Red : Color.PrimaryText,
  };

  return (
    <MenuBarExtra icon={icon} isLoading={false}>
      <MenuBarExtra.Section title={view.status === "attention" ? "Needs Attention" : "Working"}>
        {view.sessions.map((session) => (
          <MenuBarExtra.Item key={session.sessionId} title={session.title} subtitle={session.context} />
        ))}
      </MenuBarExtra.Section>
      <MenuBarExtra.Item
        title="Reset Status"
        onAction={async () => {
          await clearAgentState(config.id);
          await refresh();
        }}
      />
    </MenuBarExtra>
  );
}
