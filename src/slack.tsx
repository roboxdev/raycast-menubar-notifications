import { useCallback, useEffect, useState } from "react";
import { Color, Icon, MenuBarExtra } from "@raycast/api";
import { execSync } from "child_process";

const HIDE_WHEN_READ = true;
const SHOW_COUNTER = true;

export default function Command() {
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const updateBadge = useCallback(() => {
    try {
      const result = execSync(`lsappinfo info -only StatusLabel "Slack"`).toString().trim();
      const match = result.match(/"label"="([^"]*)"/);
      const label = match?.[1] ?? "";
      if (label === "•" || label === "●") {
        setBadgeCount(-1); // dot badge = has unreads but no count
      } else if (label === "") {
        setBadgeCount(0);
      } else {
        const count = parseInt(label);
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
      icon={{ source: "slack.svg", tintColor: Color.PrimaryText }}
      title={SHOW_COUNTER ? displayCount : undefined}
      isLoading={isLoading}
    >
      <MenuBarExtra.Item
        title={
          badgeCount === -1
            ? "New activity in Slack"
            : badgeCount && badgeCount > 0
              ? `${badgeCount} Unread in Slack`
              : "No Unread in Slack"
        }
      />
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title={"Refresh"} onAction={updateBadge} />
    </MenuBarExtra>
  );
}
