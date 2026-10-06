import type { ReactNode } from "react";
import { Unreleased } from "./Unreleased";

export function PageShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="wrap">
      <h1>{title}</h1>
      <Unreleased />
      {children}
    </div>
  );
}
