import type { AgentId } from "../lib/status-core";

export interface AgentConfig {
  id: AgentId;
  displayName: string;
  bundleId: string;
  processExecutable: string;
  excludedProcessFragments: string[];
  icon: string;
}

export const AGENT_CONFIGS: Record<AgentId, AgentConfig> = {
  codex: {
    id: "codex",
    displayName: "Codex",
    bundleId: "com.openai.codex",
    processExecutable: "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
    excludedProcessFragments: [],
    icon: "openai-menubar.svg",
  },
  claude: {
    id: "claude",
    displayName: "Claude",
    bundleId: "com.anthropic.claudefordesktop",
    processExecutable: "/Applications/Claude.app/Contents/MacOS/Claude",
    excludedProcessFragments: ["Claude-personal"],
    icon: "claude-menubar.svg",
  },
};
