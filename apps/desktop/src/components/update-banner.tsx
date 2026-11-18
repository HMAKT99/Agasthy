import { Button } from "@agasthy/ui";
import { Download, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { autoCheckEnabled, checkForUpdate, dismissUpdate, installUpdate, isDismissed, updatesSupported, useUpdateState } from "../lib/updates";
import { formatBytes } from "../lib/format";
import { api } from "../lib/ipc";

/**
 * Checks once at start-up (if enabled) and offers an available update. When
 * the check fails for a reason other than the network, this copy cannot update
 * itself, so it says so and links to the download page instead of staying silent.
 */
export function UpdateBanner() {
  const s = useUpdateState();
  useEffect(() => {
    if (!updatesSupported() || !autoCheckEnabled()) return;
    // Let the app settle first; then check once per launch.
    const t = setTimeout(() => void checkForUpdate(), 8000);
    return () => clearTimeout(t);
  }, []);

  if (s.status === "installing") {
    return (
      <div className="flex items-center gap-2 border-b border-line bg-accent/10 px-5 py-2 text-[12.5px] text-fg" role="status">
        <Download className="size-3.5 animate-pulse text-accent" aria-hidden />
        Downloading update… {formatBytes(s.downloaded)}
        {s.total ? ` of ${formatBytes(s.total)}` : ""}. AGASTHY restarts when it is installed.
      </div>
    );
  }
  if (s.status === "error" && !s.network && !isDismissed()) {
    return (
      <div className="flex items-center gap-3 border-b border-line bg-warning/10 px-5 py-2 text-[12.5px]" role="status">
        <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1 text-fg">
          This copy of AGASTHY can't update itself, so a newer version may be waiting.{" "}
          <span className="text-muted">Install the latest from the download page; your data stays as it is.</span>
        </span>
        <Button size="sm" variant="ghost" onClick={dismissUpdate}>
          Later
        </Button>
        <Button size="sm" variant="primary" onClick={() => void api.openReleases().catch(() => undefined)}>
          Open download page
        </Button>
      </div>
    );
  }
  if (s.status !== "available" || isDismissed()) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line bg-accent/10 px-5 py-2 text-[12.5px]" role="status">
      <Download className="size-3.5 text-accent" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">
        AGASTHY {s.version} is available.{s.notes ? <span className="text-muted"> {s.notes.split("\n")[0]}</span> : null}
      </span>
      <Button size="sm" variant="ghost" onClick={dismissUpdate}>
        Later
      </Button>
      <Button size="sm" variant="primary" onClick={() => void installUpdate()}>
        Install and restart
      </Button>
    </div>
  );
}
