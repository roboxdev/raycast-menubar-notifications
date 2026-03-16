import { useCallback, useEffect, useState } from "react";
import { Icon, MenuBarExtra, open } from "@raycast/api";
import { execSync } from "child_process";

interface PR {
  repository: { nameWithOwner: string };
  number: number;
  url: string;
  title: string;
}

const HIDE_WHEN_EMPTY = true;
const SHOW_COUNTER = true;

export default function Command() {
  const [prs, setPrs] = useState<PR[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const updatePRs = useCallback(() => {
    try {
      const result = execSync(
        `/opt/homebrew/bin/gh search prs --review-requested=@me --state=open --json repository,number,url,title`,
        { timeout: 15000, env: { ...process.env, GH_PAGER: "" } }
      ).toString();
      const parsed: PR[] = JSON.parse(result);
      setPrs(parsed);
    } catch {
      setPrs([]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    updatePRs();
  }, [updatePRs]);

  const hideIcon = !isLoading && prs.length === 0 && HIDE_WHEN_EMPTY;

  return hideIcon ? null : (
    <MenuBarExtra
      icon={{ source: Icon.CodeBlock }}
      title={SHOW_COUNTER && prs.length ? `${prs.length}` : undefined}
      isLoading={isLoading}
    >
      {prs.length > 0 ? (
        prs.map((pr) => (
          <MenuBarExtra.Item
            key={pr.url}
            title={pr.title}
            subtitle={`${pr.repository.nameWithOwner}#${pr.number}`}
            onAction={() => open(pr.url)}
          />
        ))
      ) : (
        <MenuBarExtra.Item title="No PRs Requesting Review" />
      )}
      <MenuBarExtra.Item icon={Icon.RotateClockwise} title={"Refresh"} onAction={updatePRs} />
    </MenuBarExtra>
  );
}
