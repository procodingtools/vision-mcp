/**
 * Vision client — wraps Ollama's native /api/chat endpoint.
 *
 * Sends a chat message with an image (as base64 in messages[].images[])
 * and returns the model's text response.
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

/**
 * Send an image + query to the Ollama vision model and return the text response.
 *
 * @param config   — Server configuration (API URL, key, model)
 * @param base64   — Base64-encoded image string (no data-URL prefix)
 * @param mimeType — MIME type of the image (used for logging; Ollama infer it from bytes)
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  // Handle non-OK responses
  if (!response.ok) {
    const statusText = response.statusText || "Unknown error";
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore read errors
    }

    const statusLabel = `${response.status} ${statusText}`.trim();

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `[vision-mcp] Authentication failed (${statusLabel}). ` +
        `Check that VISION_API_KEY is set correctly.`
      );
    }

    if (response.status === 404) {
      throw new Error(
        `[vision-mcp] Model or endpoint not found (${statusLabel}). ` +
        `Verify VISION_MODEL ("${config.model}") and VISION_API_BASE_URL ("${config.apiBaseUrl}"). ` +
        (errorBody ? `Server response: ${errorBody}` : "")
      );
    }

    throw new Error(
      `[vision-mcp] API request failed (${statusLabel}). ` +
      (errorBody ? `Server response: ${errorBody}` : "")
    );
  }

  // Parse the response
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