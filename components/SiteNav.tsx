"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, navState } from "@/lib/site";

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav aria-label="Primary">
      <ul className="nav-list">
        {PRIMARY_NAV.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={navState(link.href, pathname)}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
