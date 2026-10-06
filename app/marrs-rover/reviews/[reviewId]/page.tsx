import { notFound } from "next/navigation";
import { connection } from "next/server";

/** Independent reviews exist only after R9; the proxy also holds real data behind its flag. */
export default async function ReviewPage() {
  await connection();
  notFound();
}
