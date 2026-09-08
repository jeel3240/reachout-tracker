#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./tools";

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error("reachout-tracker MCP server ready (stdio)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
