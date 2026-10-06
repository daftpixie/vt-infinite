import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Admin shell. Denies everything server-side until stage 6 supplies
 * authentication and storage (PRD §22). The proxy denies first; this is
 * the second layer.
 */
export default async function AdminPage() {
  await connection();
  notFound();
}
