import { useCallback, useEffect, useState } from "react";
import { Icon, MenuBarExtra } from "@raycast/api";
import { execSync } from "child_process";

const HIDE_WHEN_READ = true;
const SHOW_COUNTER = true;

export default function Command() {
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const updateBadge = useCallback(() => {
    try {
      const result = execSync(
        `osascript -e 'tell application "BetterTouchTool" to get_dock_badge_for "Slack"'`
      ).toString().trim();
      if (result === "•" || result === "●") {
        setBadgeCount(-1); // dot badge = has unreads but no count
      } else if (result === "missing value" || result === "") {
        setBadgeCount(0);
      } else {
        const count = parseInt(result);
        setBadgeCount(isNaN(count) ? 0 : count);
      }
    } catch {
      setBadgeCount(0);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    updateBadge();
  }, [updateBadge]);

  const hasUnreads = badgeCount !== null && badgeCount !== 0;
  const hideIcon = !isLoading && !hasUnreads && HIDE_WHEN_READ;
  const displayCount = badgeCount && badgeCount > 0 ? `${badgeCount}` : undefined;

  return hideIcon ? null : (
    <MenuBarExtra
      icon={{ source: Icon.SpeechBubble }}
      title={SHOW_COUNTER ? displayCount : undefined}
      isLoading={isLoading}
    >
      <MenuBarExtra.Item title={badgeCount === -1 ? "New activity in Slack" : badgeCount && badgeCount > 0 ? `${badgeCount} Unread in Slack` : "No Unread in Slack"} />
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title={"Refresh"} onAction={updateBadge} />
    </MenuBarExtra>
  );
}
