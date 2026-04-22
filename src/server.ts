/**
 * MCP Server — creates and configures the Model Context Protocol server
 * with the analyze_image tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, type VisionConfig } from "./config.js";
import {
  toolName,
  toolDescription,
  AnalyzeImageSchema,
  handleAnalyzeImage,
} from "./tools/analyze-image.js";

/**
 * Create and configure the MCP server.
 *
 * The server exposes a single tool — `analyze_image` — which forwards
 * images + queries to an Ollama vision model and returns the text response.
 */
export function createServer(): { server: McpServer; config: VisionConfig } {
  const config = loadConfig();

  const server = new McpServer({
    name: "vision-mcp",
    version: "1.0.0",
    description:
      "MCP server that enables non-vision LLMs to understand images " +
      "by delegating to an Ollama Cloud vision model.",
  });

  server.tool(
    toolName,
    toolDescription,
    AnalyzeImageSchema.shape,
    async (input) => {
      return handleAnalyzeImage(input, config);
    }
  );

  return { server, config };
}