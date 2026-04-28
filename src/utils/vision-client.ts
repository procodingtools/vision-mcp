/**
 * Vision client — wraps Ollama's native /api/chat endpoint.
 *
 * Sends a chat message with an image (as base64 in messages[].images[])
 * and returns the model's text response.
 *
 * Includes automatic retry with exponential backoff for transient errors
 * (503 Service Unavailable, 429 Rate Limited, 500 Internal Server Error).
 *
 * Reference: https://docs.ollama.com/api/chat
 */

import type { VisionConfig } from "../config.js";

/** Shape of a single Ollama chat message */
interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

/** Shape of the Ollama /api/chat response (stream: false) */
interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
  };
  model: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/** HTTP status codes that are transient and worth retrying */
const RETRYABLE_STATUS_CODES = new Set([
  429, // Rate Limited
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/** Default retry configuration */
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000; // 2 seconds
const MAX_BACKOFF_MS = 30_000; // 30 seconds
const BACKOFF_MULTIPLIER = 2;

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with jitter for a given attempt (0-indexed).
 */
function getBackoffDelay(attempt: number): number {
  const delay = Math.min(
    INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt),
    MAX_BACKOFF_MS
  );
  // Add ±25% jitter to avoid thundering herd
  const jitter = delay * 0.25 * (2 * Math.random() - 1);
  return Math.max(1_000, delay + jitter);
}

/**
 * Make a single HTTP request to the Ollama /api/chat endpoint.
 *
 * @returns The fetch Response (may be non-OK; caller decides whether to retry)
 * @throws On network errors or timeout
 */
async function makeRequest(
  url: string,
  body: object,
  apiKey: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        `[vision-mcp] Request timed out after ${Math.round(timeoutMs / 1000)}s. ` +
        `The vision model may still be processing. Try again or increase VISION_REQUEST_TIMEOUT_MS.`
      );
    }
    throw new Error(
      `[vision-mcp] Network error calling vision API: ${err.message}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Read the response body text (best-effort; returns "" on failure).
 */
async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Send an image + query to the Ollama vision model and return the text response.
 *
 * Automatically retries on transient errors (429, 500, 502, 503, 504)
 * with exponential backoff and jitter.
 *
 * @param config   — Server configuration (API URL, key, model)
 * @param base64   — Base64-encoded image string (no data-URL prefix)
 * @param mimeType — MIME type of the image (used for logging; Ollama infers it from bytes)
 * @param query    — The user's question / instruction about the image
 */
export async function queryVisionModel(
  config: VisionConfig,
  base64: string,
  mimeType: string,
  query: string
): Promise<string> {
  const url = `${config.apiBaseUrl}/api/chat`;

  const messages: OllamaChatMessage[] = [
    {
      role: "user",
      content: query,
      images: [base64],
    },
  ];

  const body = {
    model: config.model,
    messages,
    stream: false,
  };

  const timeoutMs = config.requestTimeoutMs || 300_000; // 5 minutes default
  const maxRetries = config.maxRetries ?? MAX_RETRIES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // If this is a retry, wait with exponential backoff
    if (attempt > 0) {
      const delay = getBackoffDelay(attempt - 1);
      console.error(
        `[vision-mcp] Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms…`
      );
      await sleep(delay);
    }

    // Make the request (network errors throw immediately)
    const response = await makeRequest(url, body, config.apiKey, timeoutMs);

    // --- Success path ---
    if (response.ok) {
      let data: OllamaChatResponse;
      try {
        data = await response.json() as OllamaChatResponse;
      } catch {
        throw new Error(
          `[vision-mcp] Failed to parse API response as JSON. ` +
          `The server may have returned a non-JSON body.`
        );
      }

      const content = data.message?.content;
      if (!content && content !== "") {
        throw new Error(
          `[vision-mcp] API returned an empty or malformed response. ` +
          `Model: ${data.model || config.model}`
        );
      }

      return content;
    }

    // --- Error path ---
    const statusText = response.statusText || "Unknown error";
    const errorBody = await readErrorBody(response);
    const statusLabel = `${response.status} ${statusText}`.trim();

    // Non-retryable auth errors — fail immediately
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `[vision-mcp] Authentication failed (${statusLabel}). ` +
        `Check that VISION_API_KEY is set correctly.`
      );
    }

    // Non-retryable "not found" errors — fail immediately
    if (response.status === 404) {
      throw new Error(
        `[vision-mcp] Model or endpoint not found (${statusLabel}). ` +
        `Verify VISION_MODEL ("${config.model}") and VISION_API_BASE_URL ("${config.apiBaseUrl}"). ` +
        (errorBody ? `Server response: ${errorBody}` : "")
      );
    }

    // Retryable transient errors — retry if we have attempts left
    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries) {
      lastError = new Error(
        `[vision-mcp] API request failed (${statusLabel}). ` +
        (errorBody ? `Server response: ${errorBody}` : "")
      );
      console.error(
        `[vision-mcp] Transient error ${statusLabel}, will retry (${attempt + 1}/${maxRetries}). ` +
        (errorBody ? `Server: ${errorBody.substring(0, 200)}` : "")
      );
      continue;
    }

    // Exhausted retries or non-retryable error — fail
    throw new Error(
      `[vision-mcp] API request failed (${statusLabel}). ` +
      (errorBody ? `Server response: ${errorBody}` : "") +
      (attempt > 0 ? ` (failed after ${attempt + 1} attempts)` : "")
    );
  }

  // Should not reach here, but just in case
  throw lastError || new Error("[vision-mcp] Unexpected error in retry loop.");
}