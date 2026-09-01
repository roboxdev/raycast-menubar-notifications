import { AgentMenuBar } from "./agent-menu-bar";
import { AGENT_CONFIGS } from "./agent-config";

export default function Command() {
  return <AgentMenuBar config={AGENT_CONFIGS.codex} />;
}
