export function privateConfigStatus(ctx: {
  eventName?: string;
  repository?: string;
  headRepository?: string;
  value?: string;
}): { status: "ok" | "fail" | "skip-fork"; message: string };
