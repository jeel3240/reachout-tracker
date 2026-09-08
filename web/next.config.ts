import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The MCP tools live in the sibling workspace package as TypeScript source.
  transpilePackages: ["reachout-mcp"],
};

export default nextConfig;
