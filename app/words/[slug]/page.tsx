import { notFound } from "next/navigation";
import { connection } from "next/server";

/** Essays arrive in stage 2 through the strict content module (W-1). Until then no slug exists. */
export default async function EssayPage() {
  await connection();
  notFound();
}
