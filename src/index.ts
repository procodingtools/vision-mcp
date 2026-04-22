#!/usr/bin/env node

/**
 * Vision MCP Server — Entry Point
 *
 * Starts the MCP server using the stdio transport.
 * This is the standard transport for local MCP servers that are
 * spawned by clients like Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   node dist/index.js
 *
 * Environment variables (see .env.example for details):
 *   VISION_API_KEY       — Required. API key for Ollama Cloud.
 *   VISION_API_BASE_URL — Required. Base URL for the Ollama API.
 *   VISION_MODEL        — Optional. Default: kimi-k2.6:cloud
 *   VISION_MAX_IMAGE_SIZE_MB — Optional. Default: 20
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  // Load .env for local development (no-op if file doesn't exist)
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    // dotenv is a devDependency — not required in production
  }

  const { server, config } = createServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP stdio protocol
  console.error(
    `[vision-mcp] Server started. Model: ${config.model}, ` +
    `API: ${config.apiBaseUrl}/api/chat, ` +
    `Max image size: ${(config.maxImageSizeBytes / (1024 * 1024)).toFixed(0)}MB`
  );
}

main().catch((err) => {
  console.error("[vision-mcp] Fatal error:", err);
  process.exit(1);
});