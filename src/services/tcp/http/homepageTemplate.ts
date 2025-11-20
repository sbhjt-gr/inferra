export function getHomepageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inferra API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px;
    }
    h1 {
      color: #333;
      font-size: 2.5em;
      margin-bottom: 10px;
      text-align: center;
    }
    .subtitle {
      color: #666;
      text-align: center;
      margin-bottom: 30px;
      font-size: 1.1em;
    }
    .status {
      background: #f7f9fc;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e1e8ed;
    }
    .status-item:last-child { border-bottom: none; }
    .status-label {
      color: #666;
      font-weight: 500;
    }
    .status-value {
      color: #333;
      font-weight: 600;
    }
    .status-value.active {
      color: #10b981;
    }
    .nav {
      background: #f7f9fc;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .nav-btn {
      background: white;
      border: 2px solid #667eea;
      color: #667eea;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .nav-btn:hover {
      background: #667eea;
      color: white;
    }
    .section {
      margin-bottom: 40px;
    }
    .section-title {
      color: #333;
      font-size: 1.8em;
      margin-bottom: 20px;
      font-weight: 600;
      border-bottom: 3px solid #667eea;
      padding-bottom: 10px;
    }
    .endpoint-card {
      background: #f7f9fc;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #667eea;
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      margin-bottom: 15px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .method {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.9em;
      font-weight: bold;
      color: white;
    }
    .method.get { background: #10b981; }
    .method.post { background: #3b82f6; }
    .method.delete { background: #ef4444; }
    .endpoint-path {
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 1.1em;
      color: #333;
      font-weight: 600;
    }
    .endpoint-desc {
      color: #666;
      margin-bottom: 15px;
      line-height: 1.6;
    }
    .code-block {
      background: #2d3748;
      color: #e2e8f0;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 10px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
    }
    .code-label {
      color: #667eea;
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.9em;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e1e8ed;
      color: #666;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Inferra API Documentation</h1>
    <p class="subtitle">Complete API reference for local AI inference</p>

    <div class="nav">
      <button class="nav-btn" onclick="document.getElementById('chat').scrollIntoView({behavior:'smooth'})">Chat</button>
      <button class="nav-btn" onclick="document.getElementById('models').scrollIntoView({behavior:'smooth'})">Models</button>
      <button class="nav-btn" onclick="document.getElementById('rag').scrollIntoView({behavior:'smooth'})">RAG</button>
      <button class="nav-btn" onclick="document.getElementById('server').scrollIntoView({behavior:'smooth'})">Server</button>
    </div>

    <div id="chat" class="section">
      <h2 class="section-title">Chat & Completion APIs</h2>
      
      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/chat</span>
        </div>
        <p class="endpoint-desc">Stream chat completions with conversation history. Use local GGUF names, <code>apple-foundation</code>, or remote provider identifiers in the <code>model</code> field.</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "model": "gemini",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,
  "temperature": 0.7
}</pre>
        <div class="code-label">Response (streaming):</div>
        <pre class="code-block">{"message": {"role": "assistant", "content": "Hi"}, "done": false}
{"message": {"role": "assistant", "content": " there"}, "done": false}
{"message": {"role": "assistant", "content": "!"}, "done": true}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/generate</span>
        </div>
        <p class="endpoint-desc">Generate completion from a prompt without conversation context using local, Apple Foundation, or remote providers.</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "model": "apple-foundation",
  "prompt": "Explain quantum computing",
  "stream": false,
  "max_tokens": 500
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "response": "Quantum computing uses quantum mechanics...",
  "done": true,
  "context": [...]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/chats</span>
        </div>
        <p class="endpoint-desc">List all saved chat conversations</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "chats": [
    {"id": "chat-1", "title": "Quantum Physics", "updated": "2025-10-23T10:30:00Z"},
    {"id": "chat-2", "title": "Cooking Tips", "updated": "2025-10-22T15:20:00Z"}
  ]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/chats</span>
        </div>
        <p class="endpoint-desc">Create or update a chat conversation</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "id": "chat-1",
  "title": "My Conversation",
  "messages": [...]
}</pre>
      </div>
    </div>

    <div id="models" class="section">
      <h2 class="section-title">Model Management</h2>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/tags</span>
        </div>
        <p class="endpoint-desc">List all available models</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "models": [
    {
      "name": "llama-3.2-1b",
      "modified_at": "2025-10-20T10:00:00Z",
      "size": 1234567890,
      "model_type": "llama",
      "is_external": false
    }
  ]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/ps</span>
        </div>
        <p class="endpoint-desc">List currently loaded models</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "models": [
    {
      "name": "llama-3.2-1b",
      "model": "/path/to/model.gguf",
      "size": 1234567890,
      "loaded_at": "2025-10-23T10:00:00Z",
      "is_external": false
    }
  ]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/show</span>
        </div>
        <p class="endpoint-desc">Get detailed information about a model</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "model": "llama-3.2-1b"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "modelinfo": {
    "general.architecture": "llama",
    "general.file_type": "GGUF",
    "general.parameter_count": 1000000000
  },
  "parameters": "temperature=0.7\\ntop_p=0.9",
  "template": "{{.System}}\\n{{.Prompt}}"
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/pull</span>
        </div>
        <p class="endpoint-desc">Download a model from URL</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "url": "https://example.com/model.gguf",
  "model": "my-custom-model"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "status": "downloading",
  "model": "my-custom-model",
  "downloadId": "download-123"
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/copy</span>
        </div>
        <p class="endpoint-desc">Create a copy of an existing model</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "source": "llama-3.2-1b",
  "destination": "llama-3.2-1b-backup"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "success": true
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method delete">DELETE</span>
          <span class="endpoint-path">/api/delete</span>
        </div>
        <p class="endpoint-desc">Delete a model</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "name": "llama-3.2-1b"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "success": true
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/models</span>
        </div>
        <p class="endpoint-desc">Manage model operations: load, unload, reload, or refresh model list</p>
        <div class="code-label">Request (refresh):</div>
        <pre class="code-block">{
  "action": "refresh"
}</pre>
        <div class="code-label">Request (load/unload):</div>
        <pre class="code-block">{
  "action": "load",
  "model": "llama-3.2-1b"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "status": "refreshed",
  "count": 5,
  "models": [...]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/models/apple-foundation</span>
        </div>
        <p class="endpoint-desc">Check Apple Foundation model availability and status</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "available": true,
  "requirementsMet": true,
  "enabled": true,
  "status": "ready",
  "message": "Apple Foundation is ready to use."
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/models/apple-foundation</span>
        </div>
        <p class="endpoint-desc">Configure Apple Foundation model settings</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "enabled": true,
  "model": "gpt-4o"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "success": true,
  "enabled": true,
  "model": "gpt-4o"
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/models/remote/status</span>
        </div>
        <p class="endpoint-desc">Get status of all remote model providers (Gemini, ChatGPT, DeepSeek, Claude)</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
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
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/models/remote</span>
        </div>
  <p class="endpoint-desc">Configure remote model provider settings; use the same provider name in the <code>model</code> field of /api/chat or /api/generate.</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "apiKey": "your-api-key-here"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "success": true,
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "configured": true
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/version</span>
        </div>
        <p class="endpoint-desc">Get API version</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "version": "1.0.0"
}</pre>
      </div>
    </div>

    <div id="rag" class="section">
      <h2 class="section-title">RAG & Embeddings</h2>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/embeddings</span>
        </div>
        <p class="endpoint-desc">Generate embeddings for text</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "model": "llama-3.2-1b",
  "input": "The quick brown fox"
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "embeddings": [
    [0.123, -0.456, 0.789, ...]
  ],
  "model": "llama-3.2-1b"
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/files/ingest</span>
        </div>
        <p class="endpoint-desc">Ingest documents for RAG (supports multiple input methods)</p>
        <div class="code-label">Request (direct content):</div>
        <pre class="code-block">{
  "content": "Document content here..."
}</pre>
        <div class="code-label">Request (single file path):</div>
        <pre class="code-block">{
  "filePath": "/documents/doc1.pdf"
}</pre>
        <div class="code-label">Request (multiple files):</div>
        <pre class="code-block">{
  "files": [
    "/documents/doc1.pdf",
    "/documents/doc2.txt"
  ]
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "status": "success",
  "processed": 2
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/rag</span>
        </div>
        <p class="endpoint-desc">List ingested documents</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "documents": [
    {"id": "doc1", "name": "doc1.pdf", "chunks": 45, "indexed": "2025-10-23T10:00:00Z"}
  ]
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/rag</span>
        </div>
        <p class="endpoint-desc">Query documents with RAG</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "query": "What is the main topic?",
  "top_k": 5
}</pre>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "results": [
    {"text": "Relevant chunk 1", "score": 0.92, "source": "doc1.pdf"},
    {"text": "Relevant chunk 2", "score": 0.85, "source": "doc2.pdf"}
  ]
}</pre>
      </div>
    </div>

    <div id="server" class="section">
      <h2 class="section-title">Server & Settings</h2>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method get">GET</span>
          <span class="endpoint-path">/api/status</span>
        </div>
        <p class="endpoint-desc">Get detailed server status</p>
        <div class="code-label">Response:</div>
        <pre class="code-block">{
  "status": "running",
  "version": "1.0.0",
  "models_loaded": 1,
  "uptime": 3600,
  "memory_usage": "2.5 GB"
}</pre>
      </div>

      <div class="endpoint-card">
        <div class="endpoint-header">
          <span class="method post">POST</span>
          <span class="endpoint-path">/api/settings/thinking</span>
        </div>
        <p class="endpoint-desc">Configure thinking mode settings</p>
        <div class="code-label">Request:</div>
        <pre class="code-block">{
  "enabled": true,
  "model": "llama-3.2-1b",
  "max_thinking_tokens": 1000
}</pre>
      </div>
    </div>

    <div class="footer">
      <p style="margin-bottom: 10px;"><strong>Base URL:</strong> Use the server URL shown in the status section above</p>
      <p style="margin-bottom: 10px;"><strong>Headers:</strong> Content-Type: application/json</p>
      <p style="margin-bottom: 10px;"><strong>CORS:</strong> Enabled for all origins</p>
    </div>
  </div>
</body>
</html>`;
}
