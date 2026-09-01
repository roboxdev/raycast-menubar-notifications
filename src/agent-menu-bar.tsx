import { useCallback, useEffect, useState } from "react";
import { Color, getFrontmostApplication, MenuBarExtra } from "@raycast/api";
import { aggregateSessions } from "../lib/status-core";
import type { AggregateStatus } from "../lib/status-core";
import type { AgentConfig } from "./agent-config";
import { clearAgentState, isApplicationProcessRunning, markCompletedAsRead, readAgentSessions } from "./state-store";

interface ViewState {
  isLoading: boolean;
  status: AggregateStatus;
}

export function AgentMenuBar({ config }: { config: AgentConfig }) {
  const [view, setView] = useState<ViewState>({ isLoading: true, status: "hidden" });

  const refresh = useCallback(async () => {
    try {
      const isRunning = await isApplicationProcessRunning(config.processExecutable, config.excludedProcessFragments);
      if (!isRunning) {
        await clearAgentState(config.id);
        setView({ isLoading: false, status: "hidden" });
        return;
      }

      const frontmost = await getFrontmostApplication();
      const isForeground = frontmost.bundleId === config.bundleId;
      let sessions = await readAgentSessions(config.id);
      if (isForeground) sessions = await markCompletedAsRead(config.id, sessions);
      setView({ isLoading: false, status: aggregateSessions(sessions, { isForeground }) });
    } catch (error) {
      console.error(`Failed to refresh ${config.displayName} status`, error);
      setView({ isLoading: false, status: "hidden" });
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
