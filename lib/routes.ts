/**
 * Every route in PRD §04, with the state it should have in stage 1.
 * Tests read this table; app/ must implement each entry.
 */
export type RouteSpec = {
  path: string;
  /** File under app/ that implements the route. */
  file: string;
  /** Expected status with every feature flag off. */
  status: 200 | 404;
  kind: "page" | "feed";
};

export const ROUTES: readonly RouteSpec[] = [
  { path: "/", file: "app/page.tsx", status: 200, kind: "page" },
  { path: "/words", file: "app/words/page.tsx", status: 200, kind: "page" },
  { path: "/words/sample-slug", file: "app/words/[slug]/page.tsx", status: 404, kind: "page" },
  { path: "/words/feed.xml", file: "app/words/feed.xml/route.ts", status: 200, kind: "feed" },
  { path: "/code", file: "app/code/page.tsx", status: 200, kind: "page" },
  { path: "/the-record", file: "app/the-record/page.tsx", status: 200, kind: "page" },
  { path: "/the-record/sample-slug", file: "app/the-record/[slug]/page.tsx", status: 404, kind: "page" },
  { path: "/the-record/feed.xml", file: "app/the-record/feed.xml/route.ts", status: 200, kind: "feed" },
  { path: "/vibes", file: "app/vibes/page.tsx", status: 200, kind: "page" },
  { path: "/agency", file: "app/agency/page.tsx", status: 200, kind: "page" },
  { path: "/contact", file: "app/contact/page.tsx", status: 200, kind: "page" },
  { path: "/governance", file: "app/governance/page.tsx", status: 200, kind: "page" },
  { path: "/plan/onerhythm", file: "app/plan/onerhythm/page.tsx", status: 404, kind: "page" },
  { path: "/marrs-rover", file: "app/marrs-rover/page.tsx", status: 200, kind: "page" },
  { path: "/marrs-rover/demo/periods/sample", file: "app/marrs-rover/[entity]/periods/[period]/page.tsx", status: 404, kind: "page" },
  { path: "/marrs-rover/demo/events/sample", file: "app/marrs-rover/[entity]/events/[eventId]/page.tsx", status: 404, kind: "page" },
  { path: "/marrs-rover/demo/budgets/sample", file: "app/marrs-rover/[entity]/budgets/[budgetId]/page.tsx", status: 404, kind: "page" },
  { path: "/marrs-rover/reviews/sample", file: "app/marrs-rover/reviews/[reviewId]/page.tsx", status: 404, kind: "page" },
  { path: "/marrs-rover/verify", file: "app/marrs-rover/verify/page.tsx", status: 200, kind: "page" },
  { path: "/marrs-rover/method", file: "app/marrs-rover/method/page.tsx", status: 200, kind: "page" },
  { path: "/policies/comments", file: "app/policies/comments/page.tsx", status: 200, kind: "page" },
  { path: "/policies/privacy", file: "app/policies/privacy/page.tsx", status: 200, kind: "page" },
  { path: "/policies/terms", file: "app/policies/terms/page.tsx", status: 200, kind: "page" },
  { path: "/admin", file: "app/admin/[[...path]]/page.tsx", status: 404, kind: "page" },
  { path: "/sitemap.xml", file: "app/sitemap.ts", status: 200, kind: "feed" },
];

export const PAGES_200 = ROUTES.filter((r) => r.kind === "page" && r.status === 200).map((r) => r.path);
