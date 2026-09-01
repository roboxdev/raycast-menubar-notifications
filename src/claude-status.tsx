import { AGENT_CONFIGS } from "./agent-config";
import { AgentMenuBar } from "./agent-menu-bar";

export default function Command() {
  return <AgentMenuBar config={AGENT_CONFIGS.claude} />;
}
