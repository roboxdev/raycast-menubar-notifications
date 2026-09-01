import { useCallback, useEffect, useState } from "react";
import { Icon, MenuBarExtra } from "@raycast/api";
import { execSync } from "child_process";

const HIDE_WHEN_READ = true;
const SHOW_COUNTER = false;

export default function Command() {
  const [unreadsCount, setUnreadsCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const updateUnreadMailCount = useCallback(() => {
    const r = execSync(
      `osascript -e 'tell application "Mail"
    set unreadCount to count of (messages of inbox whose read status is false)
end tell'`,
    ).toString();
    if (r) {
      setUnreadsCount(parseInt(r));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    updateUnreadMailCount();
  }, [updateUnreadMailCount]);

  const hideIcon = !isLoading && unreadsCount === 0 && HIDE_WHEN_READ;

  return hideIcon ? null : (
    <MenuBarExtra
      icon={{ source: Icon.Envelope }}
      title={SHOW_COUNTER && unreadsCount ? `${unreadsCount}` : undefined}
      isLoading={isLoading}
    >
      <MenuBarExtra.Item title={unreadsCount ? `${unreadsCount} Unread Emails` : "No Unread Emails"} />
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title={"Refresh"} onAction={updateUnreadMailCount} />
    </MenuBarExtra>
  );
}
