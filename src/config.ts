/**
 * Configuration module — loads and validates environment variables.
 *
 * Required:
 *   VISION_API_KEY      — API key for authenticating with Ollama Cloud
 *   VISION_API_BASE_URL — Base URL for the Ollama API (e.g. https://ollama.com)
 *
 * Optional:
 *   VISION_MODEL                — Model identifier (default: kimi-k2.6:cloud)
 *   VISION_MAX_IMAGE_SIZE_MB    — Max image file size in MB (default: 20)
 *   VISION_REQUEST_TIMEOUT_MS   — Timeout for API requests in ms (default: 300000 = 5 min)
 */

export interface VisionConfig {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  maxImageSizeBytes: number;
  requestTimeoutMs: number;
}

function getEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[vision-mcp] Missing required environment variable: ${name}. ` +
      `Please set it before starting the server.`
    );
  }
  return value;
}

export function loadConfig(): VisionConfig {
  const apiKey = requireEnv("VISION_API_KEY");
  const apiBaseUrl = (getEnv("VISION_API_BASE_URL") || "https://ollama.com").replace(/\/+$/, "");
  const model: string = getEnv("VISION_MODEL") ?? "kimi-k2.6:cloud";
  const maxImageSizeMB = Math.max(1, Number(getEnv("VISION_MAX_IMAGE_SIZE_MB", "20")) || 20);
  const requestTimeoutMs = Math.max(10_000, Number(getEnv("VISION_REQUEST_TIMEOUT_MS", "300000")) || 300_000);

  return {
    apiKey,
    apiBaseUrl,
    model,
    maxImageSizeBytes: maxImageSizeMB * 1024 * 1024,
    requestTimeoutMs,
  };
}