import { createHashHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { PageError } from "./components/page-error";
import { Shell } from "./components/shell";
import { DiscoveryPage, type DiscoveryTab, TABS } from "./pages/discovery";
import { AI_TABS, AiPage, type AiSearch, type AiTab } from "./pages/ai";
import { GraphPage, type GraphMode, type GraphSearch } from "./pages/graph";
import { OverviewPage } from "./pages/overview";
import { OperatorPage } from "./pages/operator";
import { AgentsPage } from "./pages/agents";
import { UsagePage } from "./pages/usage";
import { ImpactPage, type ImpactSearch } from "./pages/impact";
import { ProcessesPage } from "./pages/processes";
import { SecurityPage } from "./pages/security";
import { SnapshotsPage } from "./pages/snapshots";
import { StoragePage } from "./pages/storage";
import { PrivacyPage } from "./pages/privacy";
import { SettingsPage } from "./pages/settings";

const rootRoute = createRootRoute({ component: Shell });

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: OverviewPage });

export interface DiscoverySearch {
  tab: DiscoveryTab;
  q?: string;
  id?: string;
  filter?: string;
}

const discoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discovery",
  validateSearch: (s: Record<string, unknown>): DiscoverySearch => {
    const tab = TABS.some((t) => t.id === s.tab) ? (s.tab as DiscoveryTab) : "repositories";
    return {
      tab,
      q: typeof s.q === "string" && s.q ? s.q : undefined,
      id: typeof s.id === "string" && s.id ? s.id : undefined,
      filter: typeof s.filter === "string" && s.filter ? s.filter : undefined,
    };
  },
  component: DiscoveryPage,
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  validateSearch: (s: Record<string, unknown>): GraphSearch => {
    const focus = typeof s.focus === "string" && s.focus ? s.focus : undefined;
    // Older links used "projects", "software" or "ai"; they all open the map now.
    const view: GraphMode = s.view === "focus" && focus ? "focus" : "map";
    const depth = Number(s.depth);
    const days = Number(s.days);
    return {
      view,
      focus,
      depth: depth >= 1 && depth <= 3 ? Math.floor(depth) : 1,
      sel: typeof s.sel === "string" && s.sel ? s.sel : undefined,
      around: typeof s.around === "string" && s.around ? s.around : undefined,
      days: [7, 30, 90].includes(days) ? days : undefined,
    };
  },
  component: GraphPage,
});

const aiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ai",
  validateSearch: (s: Record<string, unknown>): AiSearch => {
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    const tab = AI_TABS.some((t) => t.id === s.tab) ? (s.tab as AiTab) : "overview";
    return { tab, id: str(s.id), q: str(s.q), filter: str(s.filter) };
  },
  component: AiPage,
});

const processesRoute = createRoute({ getParentRoute: () => rootRoute, path: "/processes", component: ProcessesPage });
const storageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/storage", component: StoragePage });

const impactRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/impact",
  validateSearch: (s: Record<string, unknown>): ImpactSearch => ({
    tab: s.tab === "lab" ? "lab" : "impact",
    id: typeof s.id === "string" && s.id ? s.id : undefined,
  }),
  component: ImpactPage,
});
const snapshotsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/snapshots", component: SnapshotsPage });
const agentsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/agents", component: AgentsPage });
const usageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/usage", component: UsagePage });
const operatorRoute = createRoute({ getParentRoute: () => rootRoute, path: "/operator", component: OperatorPage });
const securityRoute = createRoute({ getParentRoute: () => rootRoute, path: "/security", component: SecurityPage });

const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: "/privacy", component: PrivacyPage });

const routeTree = rootRoute.addChildren([overviewRoute, discoveryRoute, graphRoute, aiRoute, processesRoute, storageRoute, securityRoute, impactRoute, snapshotsRoute, operatorRoute, agentsRoute, usageRoute, settingsRoute, privacyRoute]);

// Hash history: the packaged app serves static files, so deep links must not hit the server.
// A page that fails to render shows an error in its place; the rest of the app keeps working.
export const router = createRouter({ routeTree, history: createHashHistory(), defaultErrorComponent: PageError });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
