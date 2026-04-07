import { useCallback, useEffect, useState } from "react";
import { Color, Icon, MenuBarExtra, getPreferenceValues, open } from "@raycast/api";

interface Issue {
  key: string;
  fields: { summary: string };
}

interface Prefs {
  jiraAuth: string;
  jiraBaseUrl: string;
}

export default function Command() {
  const { jiraAuth, jiraBaseUrl } = getPreferenceValues<Prefs>();
  const baseUrl = jiraBaseUrl.replace(/\/$/, "");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const update = useCallback(async () => {
    setIsLoading(true);
    try {
      const jql = encodeURIComponent('assignee = currentUser() AND status = "In Progress"');
      const res = await fetch(`${baseUrl}/rest/api/3/search/jql?jql=${jql}&fields=summary`, {
        headers: {
          Authorization: `Basic ${jiraAuth}`,
          Accept: "application/json",
        },
      });
      const parsed = (await res.json()) as { issues?: Issue[] };
      setIssues(parsed.issues || []);
    } catch {
      setIssues([]);
    }
    setIsLoading(false);
  }, [jiraAuth, baseUrl]);

  useEffect(() => {
    update();
  }, [update]);

  const hideIcon = !isLoading && issues.length > 0;

  return hideIcon ? null : issues.length === 0 ? (
    <MenuBarExtra icon={{ source: "jira.svg", tintColor: Color.Red }} isLoading={isLoading}>
      <MenuBarExtra.Item title="No issues In Progress" />
    </MenuBarExtra>
  ) : (
    <MenuBarExtra icon={{ source: "jira.svg", tintColor: Color.PrimaryText }} isLoading={isLoading}>
      {issues.map((i) => (
        <MenuBarExtra.Item
          key={i.key}
          title={i.fields.summary}
          subtitle={i.key}
          onAction={() => open(`${baseUrl}/browse/${i.key}`)}
        />
      ))}
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title="Refresh" onAction={update} />
    </MenuBarExtra>
  );
}
