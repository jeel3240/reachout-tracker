import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "reachout-mcp/tools";

/**
 * Hosted MCP endpoint (Streamable HTTP, stateless). Same tools as the stdio server.
 *
 * Auth: either `Authorization: Bearer <MCP_TOKEN>` or `?token=<MCP_TOKEN>` in the URL
 * (claude.ai's custom connector form has no header field). The endpoint is disabled when
 * MCP_TOKEN is unset, because the tools use the service role key and can read/write everything.
 */
function authorized(req: Request): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const fromHeader = header.replace(/^Bearer\s+/i, "").trim();
  const fromQuery = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  const given = fromHeader || fromQuery;
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(req: Request): Promise<Response> {
  if (!process.env.MCP_TOKEN) {
    return Response.json({ error: "MCP endpoint disabled: set MCP_TOKEN" }, { status: 503 });
  }
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }
  // Stateless: fresh server + transport per request, nothing kept between calls.
  // The reply is written into the response stream after handleRequest returns, so the
  // server must not be closed here. Per-request objects are simply garbage collected.
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
