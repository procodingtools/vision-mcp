#!/usr/bin/env node

/**
 * Vision MCP Server — Entry Point
 *
 * Starts the MCP server using the stdio transport.
 * This is the standard transport for local MCP servers that are
 * spawned by clients like Claude Desktop, Cursor, OpenCode, etc.
 *
 * Environment variables (see .env.example for details):
 *   VISION_API_KEY              — Required. API key for Ollama Cloud.
 *   VISION_API_BASE_URL         — Optional. Base URL for the Ollama API (default: https://ollama.com)
 *   VISION_MODEL                — Optional. Model identifier (default: kimi-k2.6:cloud)
 *   VISION_MAX_IMAGE_SIZE_MB    — Optional. Max image file size in MB (default: 20)
 *   VISION_REQUEST_TIMEOUT_MS   — Optional. Timeout for API requests in ms (default: 300000)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const { server, config } = createServer();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP stdio protocol
  console.error(
    `[vision-mcp] Server started. Model: ${config.model}, ` +
    `API: ${config.apiBaseUrl}/api/chat, ` +
    `Max image size: ${(config.maxImageSizeBytes / (1024 * 1024)).toFixed(0)}MB, ` +
    `Request timeout: ${(config.requestTimeoutMs / 1000).toFixed(0)}s, ` +
    `Max retries: ${config.maxRetries}`
  );
}

main().catch((err) => {
  console.error("[vision-mcp] Fatal error:", err);
  process.exit(1);
});