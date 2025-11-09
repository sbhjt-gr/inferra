# Inferra REST API Documentation

Complete API reference for Inferra's local HTTP server that exposes AI inference capabilities over your WiFi network.

## Getting Started

### Starting the Server

1. Open the Inferra app on your device
2. Navigate to the **Server** tab
3. Toggle the server switch to start it
4. Your server URL will be displayed (typically `http://YOUR_DEVICE_IP:8889`)
5. You can share this URL via QR code or copy it to access from other devices

### Configuration Options

The server includes several configuration options:

- **Auto-start**: Automatically start the server when the app launches
- **Network Access**: Control whether external devices can access the server
- **Port**: Default port is 8889 (configurable in settings)

### Accessing from Other Devices

Once the server is running, you can access it from any device on the same WiFi network:

- Open a web browser and navigate to the server URL
- Use the API endpoints from your applications or scripts
- View the interactive API documentation at the root URL (`http://YOUR_DEVICE_IP:8889`)

### Base Configuration

**Base URL**: `http://YOUR_DEVICE_IP:8889`  
**Content-Type**: `application/json`  
**CORS**: Enabled for all origins

---

## Chat & Completion APIs

### POST /api/chat

Stream chat completions with full conversation history support.

**Request Body:**
```json
{
  "model": "llama-3.2-1b",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,
  "temperature": 0.7
}
```

**Response (streaming):**
```json
{"message": {"role": "assistant", "content": "Hi"}, "done": false}
{"message": {"role": "assistant", "content": " there"}, "done": false}
{"message": {"role": "assistant", "content": "!"}, "done": true}
```

**Parameters:**
- `model` (string, required): Name of the model to use
- `messages` (array, required): Conversation history with role and content
- `stream` (boolean, optional): Enable streaming responses (default: true)
- `temperature` (number, optional): Sampling temperature 0.0-2.0 (default: 0.7)
- `max_tokens` (number, optional): Maximum tokens to generate

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.2-1b",
    "messages": [{"role": "user", "content": "Explain AI"}],
    "stream": false
  }'
```

---

### POST /api/generate

Generate completion from a single prompt without conversation context.

**Request Body:**
```json
{
  "model": "llama-3.2-1b",
  "prompt": "Explain quantum computing in simple terms",
  "stream": false,
  "max_tokens": 500
}
```

**Response:**
```json
{
  "response": "Quantum computing uses quantum mechanics principles...",
  "done": true,
  "context": [...]
}
```

**Parameters:**
- `model` (string, required): Name of the model to use
- `prompt` (string, required): Input prompt for generation
- `stream` (boolean, optional): Enable streaming responses
- `max_tokens` (number, optional): Maximum tokens to generate
- `temperature` (number, optional): Sampling temperature

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.2-1b", "prompt": "Hello world", "stream": false}'
```

---

### GET /api/chats

List all saved chat conversations.

**Response:**
```json
{
  "chats": [
    {
      "id": "chat-1",
      "title": "Quantum Physics Discussion",
      "updated": "2025-10-23T10:30:00Z"
    },
    {
      "id": "chat-2",
      "title": "Cooking Tips",
      "updated": "2025-10-22T15:20:00Z"
    }
  ]
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/chats
```

---

### POST /api/chats

Create or update a chat conversation.

**Request Body:**
```json
{
  "id": "chat-1",
  "title": "My Conversation",
  "messages": [...]
}
```

**Response:**
```json
{
  "success": true,
  "id": "chat-1"
}
```

---

## Model Management

### GET /api/tags

List all available models in the local storage.

**Response:**
```json
{
  "models": [
    {
      "name": "llama-3.2-1b",
      "modified_at": "2025-10-20T10:00:00Z",
      "size": 1234567890,
      "model_type": "llama",
      "is_external": false
    }
  ]
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/tags
```

---

### GET /api/ps

List currently loaded models in memory.

**Response:**
```json
{
  "models": [
    {
      "name": "llama-3.2-1b",
      "model": "/path/to/model.gguf",
      "size": 1234567890,
      "loaded_at": "2025-10-23T10:00:00Z",
      "is_external": false
    }
  ]
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/ps
```

---

### POST /api/show

Get detailed information about a specific model including architecture, parameters, and configuration.

**Request Body:**
```json
{
  "model": "llama-3.2-1b"
}
```

**Response:**
```json
{
  "modelinfo": {
    "general.architecture": "llama",
    "general.file_type": "GGUF",
    "general.parameter_count": 1000000000
  },
  "parameters": "temperature=0.7\ntop_p=0.9",
  "template": "{{.System}}\n{{.Prompt}}"
}
```

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/show \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.2-1b"}'
```

---

### POST /api/pull

Download a model from a URL.

**Request Body:**
```json
{
  "url": "https://example.com/model.gguf",
  "model": "my-custom-model"
}
```

**Response:**
```json
{
  "status": "downloading",
  "model": "my-custom-model",
  "downloadId": "download-123"
}
```

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/pull \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://huggingface.co/model.gguf",
    "model": "my-model"
  }'
```

---

### POST /api/copy

Create a copy of an existing model with a new name.

**Request Body:**
```json
{
  "source": "llama-3.2-1b",
  "destination": "llama-3.2-1b-backup"
}
```

**Response:**
```json
{
  "success": true
}
```

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/copy \
  -H "Content-Type: application/json" \
  -d '{"source": "llama-3.2-1b", "destination": "llama-backup"}'
```

---

### DELETE /api/delete

Delete a model from local storage.

**Request Body:**
```json
{
  "name": "llama-3.2-1b"
}
```

**Response:**
```json
{
  "success": true
}
```

**Example:**
```bash
curl -X DELETE http://YOUR_DEVICE_IP:8889/api/delete \
  -H "Content-Type: application/json" \
  -d '{"name": "old-model"}'
```

---

### POST /api/models

Manage model operations: load, unload, reload, or refresh the model list.

**Request Body (refresh):**
```json
{
  "action": "refresh"
}
```

**Request Body (load/unload):**
```json
{
  "action": "load",
  "model": "llama-3.2-1b"
}
```

**Response:**
```json
{
  "status": "refreshed",
  "count": 5,
  "models": [...]
}
```

**Available Actions:**
- `refresh`: Reload the model list from storage
- `load`: Load a specific model into memory
- `unload`: Unload a model from memory
- `reload`: Reload a currently loaded model

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/models \
  -H "Content-Type: application/json" \
  -d '{"action": "load", "model": "llama-3.2-1b"}'
```

---

### GET /api/models/apple-foundation

Check Apple Foundation model availability and status (iOS only).

**Response:**
```json
{
  "available": true,
  "requirementsMet": true,
  "enabled": true,
  "status": "ready",
  "message": "Apple Foundation is ready to use."
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/models/apple-foundation
```

---

### POST /api/models/apple-foundation

Configure Apple Foundation model settings (iOS only).

**Request Body:**
```json
{
  "enabled": true,
  "model": "gpt-4o"
}
```

**Response:**
```json
{
  "success": true,
  "enabled": true,
  "model": "gpt-4o"
}
```

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/models/apple-foundation \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "model": "gpt-4o"}'
```

---

### GET /api/models/remote/status

Get status of all configured remote model providers (OpenAI, Gemini, Anthropic, DeepSeek).

**Response:**
```json
{
  "providers": [
    {
      "provider": "gemini",
      "configured": true,
      "model": "gemini-1.5-pro",
      "usingDefault": false
    },
    {
      "provider": "chatgpt",
      "configured": false,
      "model": null,
      "usingDefault": false
    }
  ]
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/models/remote/status
```

---

### POST /api/models/remote

Configure remote model provider settings.

**Request Body:**
```json
{
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "apiKey": "your-api-key-here"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "configured": true
}
```

**Supported Providers:**
- `chatgpt`: OpenAI ChatGPT models
- `gemini`: Google Gemini models
- `claude`: Anthropic Claude models
- `deepseek`: DeepSeek models

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/models/remote \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "chatgpt",
    "model": "gpt-4o",
    "apiKey": "sk-..."
  }'
```

---

### GET /api/version

Get the API version.

**Response:**
```json
{
  "version": "1.0.0"
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/version
```

---

## RAG & Embeddings

### POST /api/embeddings

Generate embeddings for text using the specified model.

**Request Body:**
```json
{
  "model": "llama-3.2-1b",
  "input": "The quick brown fox jumps over the lazy dog"
}
```

**Response:**
```json
{
  "embeddings": [
    [0.123, -0.456, 0.789, ...]
  ],
  "model": "llama-3.2-1b"
}
```

**Parameters:**
- `model` (string, required): Name of the model to use for embeddings
- `input` (string or array, required): Text or array of texts to embed

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "llama-3.2-1b", "input": "Sample text"}'
```

---

### POST /api/files/ingest

Ingest documents for RAG with support for multiple input methods.

**Request Body (direct content):**
```json
{
  "content": "Document content to ingest for RAG queries..."
}
```

**Request Body (single file path):**
```json
{
  "filePath": "/documents/doc1.pdf"
}
```

**Request Body (multiple files):**
```json
{
  "files": [
    "/documents/doc1.pdf",
    "/documents/doc2.txt",
    "/documents/doc3.docx"
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "processed": 2
}
```

**Supported Formats:**
- PDF documents
- Text files (.txt)
- Word documents (.docx)
- Images (OCR will be performed)

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/files/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Machine learning is a subset of AI..."}'
```

---

### GET /api/rag

List all ingested documents in the RAG system.

**Response:**
```json
{
  "documents": [
    {
      "id": "doc1",
      "name": "doc1.pdf",
      "chunks": 45,
      "indexed": "2025-10-23T10:00:00Z"
    }
  ]
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/rag
```

---

### POST /api/rag

Query ingested documents using RAG to find relevant context.

**Request Body:**
```json
{
  "query": "What is the main topic of the document?",
  "top_k": 5
}
```

**Response:**
```json
{
  "results": [
    {
      "text": "Relevant chunk from document 1",
      "score": 0.92,
      "source": "doc1.pdf"
    },
    {
      "text": "Relevant chunk from document 2",
      "score": 0.85,
      "source": "doc2.pdf"
    }
  ]
}
```

**Parameters:**
- `query` (string, required): The question or query to search for
- `top_k` (number, optional): Number of top results to return (default: 5)

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the key findings?", "top_k": 3}'
```

---

## Server & Settings

### GET /api/status

Get detailed server status including uptime, memory usage, and loaded models.

**Response:**
```json
{
  "status": "running",
  "version": "1.0.0",
  "models_loaded": 1,
  "uptime": 3600,
  "memory_usage": "2.5 GB"
}
```

**Example:**
```bash
curl http://YOUR_DEVICE_IP:8889/api/status
```

---

### POST /api/settings/thinking

Configure thinking mode settings for enhanced reasoning capabilities.

**Request Body:**
```json
{
  "enabled": true,
  "model": "llama-3.2-1b",
  "max_thinking_tokens": 1000
}
```

**Response:**
```json
{
  "success": true,
  "enabled": true
}
```

**Parameters:**
- `enabled` (boolean, required): Enable or disable thinking mode
- `model` (string, optional): Model to use for thinking
- `max_thinking_tokens` (number, optional): Maximum tokens for thinking process

**Example:**
```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/settings/thinking \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "max_thinking_tokens": 500}'
```

---

## Error Handling

All endpoints return appropriate HTTP status codes and error messages:

**Success Codes:**
- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully

**Error Codes:**
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error occurred

**Error Response Format:**
```json
{
  "error": "Error message describing what went wrong",
  "code": "ERROR_CODE"
}
```

---

## Security Considerations

- The server is designed for local network use only
- No authentication is required by default (secured by network isolation)
- CORS is enabled to allow browser-based access
- API keys for remote models are stored securely on the device
- Consider using a VPN or firewall if exposing to broader networks

---

## Rate Limiting

Currently, there are no rate limits enforced. However, performance depends on:
- Device capabilities (CPU, RAM)
- Model size and complexity
- Number of concurrent connections

---

## Common Use Cases

### Chat Application Integration

```bash
curl -X POST http://YOUR_DEVICE_IP:8889/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.2-1b",
    "messages": [
      {"role": "system", "content": "You are a helpful coding assistant"},
      {"role": "user", "content": "Write a Python function to calculate fibonacci"}
    ],
    "stream": true
  }'
```

### Document Q&A with RAG

```bash
# First, ingest your documents
curl -X POST http://YOUR_DEVICE_IP:8889/api/files/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Your document content here..."}'

# Then query them
curl -X POST http://YOUR_DEVICE_IP:8889/api/rag \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the main points?", "top_k": 5}'
```

### Model Management

```bash
# List available models
curl http://YOUR_DEVICE_IP:8889/api/tags

# Load a specific model
curl -X POST http://YOUR_DEVICE_IP:8889/api/models \
  -H "Content-Type: application/json" \
  -d '{"action": "load", "model": "llama-3.2-1b"}'

# Check loaded models
curl http://YOUR_DEVICE_IP:8889/api/ps
```

---

## Example Applications

### Inferra CLI

The Inferra CLI is a command-line interface tool that demonstrates how to build applications using these REST APIs. It provides a fully functional terminal-based chat interface with streaming support, conversation history, and an interactive setup flow.

The CLI is built using React and Ink for the terminal UI, with TypeScript for type safety. It connects to your Inferra server and allows you to chat with your local models directly from the command line. This serves as a practical reference implementation for developers who want to integrate Inferra into their own applications.

You can find the complete source code in the inferra-cli directory of the repository. The implementation shows how to handle streaming responses, manage conversation state, and provide a smooth user experience when working with the Inferra APIs.

To use the CLI, start your Inferra server on your mobile device, then run the CLI tool on any computer connected to the same WiFi network. The tool will guide you through connecting to your server and selecting a model to chat with.

---

## Additional Resources

- [Inferra GitHub Repository](https://github.com/sbhjt-gr/inferra)
- [Inferra CLI Tool](../../inferra-cli)
- [Contributing Guide](CONTRIBUTING.md)
- [License](../LICENSE)

---

**Last Updated**: October 23, 2025  
**API Version**: 1.0.0
