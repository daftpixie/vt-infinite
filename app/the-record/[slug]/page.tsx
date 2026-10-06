import { notFound } from "next/navigation";
import { connection } from "next/server";

/** Record entries arrive in stage 2. Retired legacy slugs are answered with 410 by the proxy. */
export default async function RecordEntryPage() {
  await connection();
  notFound();
}
