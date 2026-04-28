# Vision MCP

An MCP (Model Context Protocol) server that bridges non-vision LLMs to a vision-capable model via Ollama's native API, enabling image understanding through a single `analyze_image` tool call.

## How It Works

```
Non-vision LLM  ──►  MCP Client (Claude Desktop, Cursor, etc.)
                           │
                           ▼
                    Vision MCP Server
                           │
                    ┌──────┴──────┐
                    │  image_path  │──► reads file, base64 encodes
                    │ image_base64 │──► passes through directly
                    └──────┬──────┘
                           │
                           ▼
               Ollama /api/chat (vision model)
                           │
                           ▼
                    Text response returned
```

The server accepts an image (file path or base64 string) and a text query, forwards them to a configurable Ollama vision model, and returns the model's textual analysis.

## Features

- **Dual image input** — provide a local file path (`image_path`) or a raw base64 string (`image_base64`)
- **Native Ollama API** — uses the `/api/chat` endpoint with `message.images[]` for maximum compatibility
- **Configurable model** — defaults to `kimi-k2.6:cloud`, override via environment variable
- **File validation** — MIME type checking, size limits, and clear error messages
- **Zero heavy runtime dependencies** — uses Node.js native `fetch`, no `openai` SDK required

## Installation

```bash
git clone git@github.com:procodingtools/vision-mcp.git
cd vision-mcp
npm install
npm run build
```

## Configuration

Set the following environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `VISION_API_KEY` | **Yes** | — | API key for authenticating with Ollama Cloud |
| `VISION_API_BASE_URL` | No | `https://ollama.com` | Base URL for the Ollama API (no trailing slash) |
| `VISION_MODEL` | No | `kimi-k2.6:cloud` | Vision model identifier |
| `VISION_MAX_IMAGE_SIZE_MB` | No | `20` | Maximum image file size in megabytes |
| `VISION_REQUEST_TIMEOUT_MS` | No | `300000` | Timeout for API requests in milliseconds |
| `VISION_MAX_RETRIES` | No | `3` | Max retry attempts for transient errors (503, 429, 500, 502, 504) |

For local development, copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

## Usage

### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vision-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/vision-mcp/dist/index.js"],
      "env": {
        "VISION_API_KEY": "your-api-key",
        "VISION_API_BASE_URL": "https://ollama.com",
        "VISION_MODEL": "kimi-k2.6:cloud"
      }
    }
  }
}
```

### With MCP Inspector (for debugging)

```bash
npm run inspect
```

### Direct invocation

```bash
VISION_API_KEY=your-key node dist/index.js
```

## Tool Reference

### `analyze_image`

Analyze an image using a vision-capable language model.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | **Yes** | Question or instruction about the image |
| `image_path` | string | No* | Path to a local image file (absolute, relative, or `file://` URL) |
| `image_base64` | string | No* | Base64-encoded image string (raw or `data:image/...;base64,...`) |

*\*Exactly one of `image_path` or `image_base64` must be provided.*

**Examples:**

_Analyze a local file:_
```json
{
  "image_path": "/home/user/screenshot.png",
  "query": "Describe the UI elements visible in this screenshot."
}
```

_Analyze a base64 image:_
```json
{
  "image_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "query": "Extract all text from this document."
}
```

**Supported image formats:** PNG, JPEG, GIF, WebP, BMP, SVG, TIFF, AVIF

## Supported Models

The server works with any Ollama model that supports vision. Tested models include:

| Model | Tag | Context | Notes |
|---|---|---|---|
| **kimi-k2.6** | `kimi-k2.6:cloud` | 256K | Default. Native multimodal, agentic, coding-driven design |
| kimi-k2.5 | `kimi-k2.5:cloud` | 256K | Predecessor, strong multimodal |
| qwen3-vl | `qwen3-vl:235b-cloud` | 256K | Best OCR (32 languages), visual coding |
| gemma3 | `gemma3:27b-cloud` | 128K | Google's model, good general vision |

Switch models by setting `VISION_MODEL`:
```bash
VISION_MODEL=qwen3-vl:235b-cloud node dist/index.js
```

## Project Structure

```
src/
├── index.ts               # Entry point — stdio transport
├── server.ts               # MCP server + tool registration
├── config.ts               # Environment variable loading & validation
├── tools/
│   └── analyze-image.ts    # Zod schema + handler logic
└── utils/
    ├── image-processor.ts   # File reading, MIME detection, base64 encoding
    └── vision-client.ts     # Ollama /api/chat HTTP wrapper
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run with hot-reload using `tsx watch` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |
| `npm run inspect` | Launch MCP Inspector for debugging |

## Error Handling

The server returns clear, actionable error messages as text content:

- **Missing image**: `"You must provide either image_path or image_base64"`
- **File not found**: `"Image file not found: /path/to/image.png"`
- **File too large**: `"Image file too large: 45.2MB exceeds the 20MB limit"`
- **Unsupported format**: `"Unsupported image type: .pdf (application/pdf)"`
- **Auth failure**: `"Authentication failed (401). Check VISION_API_KEY"`
- **Model not found**: `"Model or endpoint not found. Verify VISION_MODEL and VISION_API_BASE_URL"`
- **Transient errors**: Automatically retried with exponential backoff (429, 500, 502, 503, 504)

## Retry Behavior

When the Ollama API returns a transient error (503 Service Unavailable, 429 Rate Limited, 500 Internal Server Error, 502 Bad Gateway, or 504 Gateway Timeout), the server automatically retries the request with exponential backoff:

- **Max retries**: 3 (configurable via `VISION_MAX_RETRIES`)
- **Initial backoff**: 2 seconds
- **Backoff multiplier**: 2× per attempt (2s → 4s → 8s)
- **Max backoff**: 30 seconds
- **Jitter**: ±25% to avoid thundering herd

Retry progress is logged to stderr so it doesn't interfere with the MCP stdio protocol.

## License

MIT