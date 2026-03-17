import { useEffect, useState } from "react";
import { Color, getPreferenceValues, Icon, MenuBarExtra } from "@raycast/api";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import type { Dialog } from "telegram/tl/custom/dialog";

interface Preferences {
  apiId: string;
  apiHash: string;
  sessionKey: string;
}

const HIDE_WHEN_READ = true;
const SHOW_COUNTER = true;

function hasUnreads(d: Dialog): boolean {
  if (d.dialog.unreadMark && d.isUser) {
    return true;
  }

  const hasUnreadMessages = d.unreadCount > 0 || d.unreadMentionsCount > 0;
  if (!hasUnreadMessages) {
    return false;
  }

  const muteUntil = d.dialog.notifySettings.muteUntil;
  const now = new Date().getTime() / 1000;
  const isMuted = typeof muteUntil === "number" && muteUntil > now;
  const hasDefaultNotifications = muteUntil === null;
  const isNotificationsOff = isMuted || hasDefaultNotifications;

  if (isNotificationsOff) {
    return false;
  }

  return true;
}

async function getUnreadDialogs(): Promise<Dialog[]> {
  const preferences = getPreferenceValues<Preferences>();
  const { apiId, apiHash, sessionKey } = preferences;

  const stringSession = new StringSession(sessionKey);
  const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, { connectionRetries: 1 });
  await client.connect();
  const dialogs = await client.getDialogs({ folder: 0 });
  const unreadDialogs = dialogs.filter((d) => hasUnreads(d));
  await client.disconnect();
  return unreadDialogs;
}

export default function Command() {
  const [unreadDialogs, setUnreadDialogs] = useState<Dialog[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const unreadsCount = unreadDialogs.length;

  const updateUnreadTelegramMessagesCount = async () => {
    const d = await getUnreadDialogs();
    setUnreadDialogs(d);
    setIsLoading(false);
  };

  useEffect(() => {
    const timerId = setTimeout(updateUnreadTelegramMessagesCount, 200);
    return () => {
      clearInterval(timerId);
    };
  }, []);

  const hideIcon = !isLoading && unreadsCount === 0 && HIDE_WHEN_READ;

  return hideIcon ? null : (
    <MenuBarExtra
      icon={{ source: "telegram.svg", tintColor: Color.PrimaryText }}
      title={SHOW_COUNTER && unreadsCount ? `${unreadsCount}` : undefined}
      isLoading={isLoading}
    >
      {unreadDialogs.length > 0 ? (
        unreadDialogs.map((d, i) => <MenuBarExtra.Item key={i} title={d.title} />)
      ) : (
        <MenuBarExtra.Item title="No Unread Dialogs" />
      )}
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title={"Refresh"} onAction={updateUnreadTelegramMessagesCount} />
    </MenuBarExtra>
  );
}
