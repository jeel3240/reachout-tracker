export const AUTH_COOKIE = "rt_session";

/** SHA-256 hex of the password; used as the cookie value so the raw password is never stored. */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`reachout-tracker:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
