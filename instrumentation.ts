/** Runs once when the server starts: bad storage configuration fails here. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkStorageConfig } = await import("@/lib/storage");
    checkStorageConfig();
  }
}
