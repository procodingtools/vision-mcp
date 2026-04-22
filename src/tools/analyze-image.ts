/**
 * analyze_image tool — the single MCP tool exposed by this server.
 *
 * Accepts an image (as a local file path OR a base64 string) and a text query,
 * sends them to the configured Ollama vision model, and returns the model's
 * textual analysis.
 */

import { z } from "zod";
import type { VisionConfig } from "../config.js";
import { processImageFile, processBase64Image } from "../utils/image-processor.js";
import { queryVisionModel } from "../utils/vision-client.js";

// ---------------------------------------------------------------------------
// Zod input schema
// ---------------------------------------------------------------------------

export const AnalyzeImageSchema = z.object({
  image_path: z
    .string()
    .optional()
    .describe(
      "Absolute or relative path to a local image file " +
      "(e.g. /home/user/photo.png or ./chart.jpg). " +
      "file:// URLs are also supported. Mutually exclusive with image_base64."
    ),
  image_base64: z
    .string()
    .optional()
    .describe(
      "Base64-encoded image string. Can be a raw base64 string or a " +
      "data-URL (data:image/png;base64,...). Mutually exclusive with image_path."
    ),
  query: z
    .string()
    .min(1)
    .describe(
      "The question or instruction for the vision model regarding the image. " +
      "Be specific for best results, e.g. 'Describe the UI elements in this screenshot' " +
      "or 'Extract all text from this document.'"
    ),
});

// ---------------------------------------------------------------------------
// Tool metadata (for MCP registration)
// ---------------------------------------------------------------------------

export const toolName = "analyze_image";

export const toolDescription =
  "Analyze an image using a vision-capable language model. " +
  "Provide either a local file path (image_path) or a base64-encoded string " +
  "(image_base64) along with a text query describing what you want to understand " +
  "about the image. The vision model will return a detailed textual response. " +
  "Supported formats: PNG, JPEG, GIF, WebP, BMP, SVG, TIFF, AVIF.";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleAnalyzeImage(
  rawInput: unknown,
  config: VisionConfig
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Validate input
  const parsed = AnalyzeImageSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      content: [
        { type: "text", text: `[vision-mcp] Invalid input: ${issues}` },
      ],
    };
  }

  const { image_path, image_base64, query } = parsed.data;

  // Exactly one image source is required
  if (!image_path && !image_base64) {
    return {
      content: [
        {
          type: "text",
          text:
            "[vision-mcp] You must provide either `image_path` or `image_base64`. " +
            "Both are missing.",
        },
      ],
    };
  }

  if (image_path && image_base64) {
    return {
      content: [
        {
          type: "text",
          text:
            "[vision-mcp] Provide only one of `image_path` or `image_base64`, not both. " +
            "The server will prefer `image_path` when both are given.",
        },
      ],
    };
  }

  try {
    // Process the image
    let processed: { base64: string; mimeType: string };

    if (image_path) {
      processed = await processImageFile(image_path, config.maxImageSizeBytes);
    } else {
      processed = processBase64Image(image_base64!);
    }

    // Query the vision model
    const result = await queryVisionModel(
      config,
      processed.base64,
      processed.mimeType,
      query
    );

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (err: any) {
    const message =
      err?.message || "An unknown error occurred during image analysis.";
    return {
      content: [{ type: "text", text: message }],
    };
  }
}