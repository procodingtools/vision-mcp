/**
 * Image processor — reads local files, detects MIME type, and base64 encodes.
 *
 * Supports:
 *   - Absolute file paths
 *   - Relative file paths
 *   - file:// URL paths
 *   - Raw base64 strings (pass-through)
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { lookup } from "mime-types";

/** Supported image MIME types with their common extensions */
const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "image/tiff",
  "image/avif",
]);

export interface ProcessedImage {
  /** The base64-encoded image string (no data-URL prefix) */
  base64: string;
  /** The detected or inferred MIME type */
  mimeType: string;
}

/**
 * Strip `file://` prefix and resolve to an absolute path.
 */
function normalizeFilePath(inputPath: string): string {
  let path = inputPath.trim();
  if (path.startsWith("file://")) {
    path = path.slice("file://".length);
  }
  return resolve(path);
}

/**
 * Read an image from a local file path, detect its MIME type,
 * validate its size, and return a base64-encoded string.
 */
export async function processImageFile(
  filePath: string,
  maxImageSizeBytes: number
): Promise<ProcessedImage> {
  const normalizedPath = normalizeFilePath(filePath);

  // Check file exists and get size
  let fileSize: number;
  try {
    const fileStat = await stat(normalizedPath);
    fileSize = fileStat.size;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(
        `[vision-mcp] Image file not found: ${normalizedPath}`
      );
    }
    throw new Error(
      `[vision-mcp] Cannot access image file: ${normalizedPath} — ${err.message}`
    );
  }

  // Size guard
  if (fileSize > maxImageSizeBytes) {
    const maxMB = (maxImageSizeBytes / (1024 * 1024)).toFixed(1);
    const fileMB = (fileSize / (1024 * 1024)).toFixed(1);
    throw new Error(
      `[vision-mcp] Image file too large: ${fileMB}MB exceeds the ${maxMB}MB limit. ` +
      `Adjust VISION_MAX_IMAGE_SIZE_MB to allow larger files.`
    );
  }

  // Detect MIME type
  const mimeType = lookup(normalizedPath);
  if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) {
    const ext = normalizedPath.split(".").pop() || "unknown";
    throw new Error(
      `[vision-mcp] Unsupported image type: .${ext} (${mimeType || "unknown MIME"}). ` +
      `Supported formats: PNG, JPEG, GIF, WebP, BMP, SVG, TIFF, AVIF.`
    );
  }

  // Read and encode
  const buffer = await readFile(normalizedPath);
  const base64 = buffer.toString("base64");

  return { base64, mimeType };
}

/**
 * Validate a raw base64 string that the caller provides directly.
 * We attempt to detect the MIME type from the data-URL prefix if present,
 * otherwise default to image/png.
 */
export function processBase64Image(rawBase64: string): ProcessedImage {
  const trimmed = rawBase64.trim();

  // Check if it's a data URL like "data:image/png;base64,iVBOR..."
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-z+]+);base64,(.+)$/s);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const base64 = dataUrlMatch[2];
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new Error(
        `[vision-mcp] Unsupported MIME type in data URL: ${mimeType}. ` +
        `Supported: ${[...SUPPORTED_MIME_TYPES].join(", ")}`
      );
    }
    return { base64, mimeType };
  }

  // Assume it's raw base64 — default MIME to image/png
  // (The Ollama API will handle the image regardless of the MIME we report here)
  return { base64: trimmed, mimeType: "image/png" };
}