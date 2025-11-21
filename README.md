
## Inferra
<p>
  <a href="" target="_blank"><img src="https://img.shields.io/badge/App_Version-0.7.1-6a1b9a" alt="App Version 0.7.1"></a>
  <a href="https://opensource.org/licenses/AGPL-3.0" target="_blank"><img src="https://img.shields.io/badge/License-AGPL--3.0-orange" alt="License: AGPL-3.0"></a>
</p>
<p>
  <img src="https://lh3.googleusercontent.com/XTXWqqQPgW4KM6fALBRViYQQPR-qobXzGCu7pNWM8ZYJ8ymbKKh2v_6n-jFyDg5mtu2Z5tsVv23RJGDTamjjzBY" alt="Inferra Header" width="400">
</p>

Inferra is a mobile application built on React Native and Expo that brings large language models (LLMs) & small language models (SLMs) directly to your Android & iOS device. Cloud-based models (remote models) like Claude, DeepSeek, Gemini and ChatGPT are also supported. File attachments are also well-supported for both local & remote models.

[<img src="https://github.com/user-attachments/assets/bdc18fc5-5a99-410c-b383-eaf9c737176e" alt="Get it on Google Play" width="150">](https://play.google.com/store/apps/details?id=com.gorai.ragionare)

[<img src="https://github.com/user-attachments/assets/9274a034-3fed-4ed9-bad9-d99e55064e8f" alt="Get it on App Store" width="150">](https://apps.apple.com/us/app/inferra/id6754396856)

If you want to support me and the development of this project, you can donate to me through [Ko-fi](https://ko-fi.com/subhajitgorai). Any amount is appreciated.

## Screenshots

<p align="center">
   <img src="https://lh3.googleusercontent.com/jFJWO1yItb9Nr6xIp66vukWrI2XR1YO2aauREiBolk-D78hzsU_wlxQv7Ny1-9ZELF6FYFPdgLAWQve9g__S" alt="Screenshot 1" height="300px">
   <img src="https://lh3.googleusercontent.com/kmyPf6GGEs5HHFZrUQtYWhsdMw4h0Izsvfdubn10mBFADopTthWJEZfJ7kAKtUWMpJM-QUhF9DQNOc_Hi2pBeg" alt="Screenshot 2" height="300px">
   <img src="https://lh3.googleusercontent.com/GwF7L1kMENYt7TgAZHfzpV4ZCwoTieSc0H4SFPsHgrn9ZARC-nDgtzf2R2VxqaAyCni2efSvxVJIcWIb5HaScKA" alt="Screenshot 3" height="300px">
   <img src="https://lh3.googleusercontent.com/E-VO33t0ZLwkQsZR97_PEWaA18ei4czXCA77nPRp4akBbpsX2pDL-Je9cOYHadQkc3WeDCdM_Q_UovaHoH-k" alt="Screenshot 4" height="300px">
   <img src="https://lh3.googleusercontent.com/ujPaHQZK4Wvbo1pmugeQZepyI2iTP77IrTIbAJn85VLmdqfGrALUqITNZ71PJF0TuJU77DsSRkgeaxnPdop-xw" alt="Screenshot 5" height="300px">
   <img src="https://lh3.googleusercontent.com/hsLQ0OyKlLBxPX_d_X52hLsEbpzRJvrPcU3Sj9N9mKxRbYkpk598wgZF6Yqr3y5vrk8VNPQKF5Hdp8DgoRPO" alt="Screenshot 6" height="300px">
   <img src="https://lh3.googleusercontent.com/kIdj7hMfVmLS_6s_Yk1gtRxgsYLjWXz7evPIBBrGvnZ5-T4FosUqzOucKEMYNxJgpDyvViI8S2x3EjVJUsQe" alt="Screenshot 7" height="300px">
</p>

## Features

### Core Inference
- Local inference through llama.cpp with support for GGUF models. More inference engines are planned for future releases. You can become a contributor by implementing additional engines. See the [contributions guide](#contributing) below.
- Seamless integration with cloud-based models from OpenAI, Gemini, Anthropic and DeepSeek. You need your own API keys and an Inferra registered account for remote models. Using remote models is optional.
- Apple Foundation support for compatible iOS devices, for Apple Intelligence supported devices when available.

### Vision and Multimodal
- Vision support through multimodal models with their corresponding projector (mmproj) files which you can find [here](https://github.com/ggml-org/llama.cpp). SmolVLM2 and its multimodal projector file are included by default in the Models -> Download Models tab. Both files are combined, meaning downloading "SmolVLM2" will also download its projector, but you can cancel either download if needed.
- Built-in camera (based on expo-camera) lets you capture pictures directly in the app and send them to models. Clicked pictures are saved to your gallery by default.

### Document Processing and RAG
- RAG (Retrieval-Augmented Generation) support for enhanced document understanding and context-aware responses.
- File attachment support with a built-in document extractor that performs OCR locally on all pages of your documents and extracts text content to send to models (local or remote).
- Document ingestion system that processes and indexes your files for efficient retrieval during conversations.

### Local Server
- Built-in HTTP server that exposes REST APIs for accessing your models from any device on your WiFi network.
- Server can be started from the Server tab with configuration options for network access and auto-start.
- Share your Inferra chat interface with computers, tablets, or other devices through a simple URL or QR code.
- Full API documentation is available [HERE](docs/REST_APIs.md) and at the server homepage when running.
- A command-line interface tool is available at [github.com/sbhjt-gr/inferra-cli](https://github.com/sbhjt-gr/inferra-cli) that demonstrates how to build applications using these REST APIs.

### Model Management
- Download manager that fetches models directly from HuggingFace. Cherry-picked model list optimized for running on edge devices available in Models -> Download Models tab.
- Downloaded models appear in the chat screen model selector and the "Stored Models" tab under the "Models" section.
- Import models from local storage or download from custom URLs.
- Model operations including load, unload, reload, and refresh through the app or REST API.

### Chat Experience
- Messages support editing, regeneration, copy functionality and markdown rendering.
- Code generated by models is rendered in codeblocks with clipboard copying functionality.
- Chat history management with the ability to create, save, and organize conversations.
- Real-time streaming responses for both local and remote models.

## Getting Started
If you want to contribute or just try to run it locally, follow the guide below. Please adhere to the rules of the <a href="https://github.com/sbhjt-gr/inferra/blob/main/LICENSE">LICENSE</a> because you are not supposed to just `git clone` and pass it as your own work.

### Prerequisites

- Node.js (>= 16.0.0, < 23.0.0)
- npm or yarn
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/sbhjt-gr/inferra
   cd inferra
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Configure your API keys and Firebase settings as shown in app.config.json
   ```

4. **Run on device or emulator**
   ```bash
   # For Android
   npx expo run:android
   
   # For iOS
   npx expo run:ios
   ```

## Command Line Interface

The inferra-cli tool is a terminal-based client that connects to your Inferra server and provides an interactive chat interface directly from your command line. This serves as both a functional tool and a reference implementation for developers who want to build applications using the Inferra REST APIs.

The CLI is built with React and Ink to provide a modern terminal UI with features like streaming responses, conversation history, and an interactive setup flow. You can find the complete source code and installation instructions at [github.com/sbhjt-gr/inferra-cli](https://github.com/sbhjt-gr/inferra-cli).

To get started with the CLI, make sure your Inferra server is running on your mobile device, then install the CLI tool and follow the setup instructions in its repository.

## REST API

Inferra includes a built-in HTTP server that exposes REST APIs for accessing your local models from any device on your WiFi network. This allows you to integrate Inferra with other applications, scripts, or services.

### Starting the Server

1. Open the Inferra app
2. Navigate to the Server tab
3. Toggle the server switch to start it
4. The server URL will be displayed (typically `http://YOUR_DEVICE_IP:8889`)

### API Documentation

Once the server is running, you can access the complete API documentation by opening the server URL in any web browser. The documentation includes:

- Chat and completion endpoints
- Model management operations
- RAG and embeddings APIs
- Server configuration and status

For detailed API reference, see the [REST API Documentation](docs/REST_APIs.md).

### Example Usage

```bash
# Chat with a model
curl -X POST http://YOUR_DEVICE_IP:8889/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.2-1b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# List available models
curl http://YOUR_DEVICE_IP:8889/api/tags

# Ingest a document for RAG
curl -X POST http://YOUR_DEVICE_IP:8889/api/files/ingest \
  -H "Content-Type: application/json" \
  -d '{"content": "Your document content here"}'
```

## License

This project is distributed under the AGPL-3.0 License. Please read it [here](https://github.com/sbhjt-gr/inferra/blob/main/LICENSE). Any modifications must adhere to the rules of this LICENSE.

## Contributing

Contributions are welcome! Before starting work:

1. Find an issue in the [issues](https://github.com/sbhjt-gr/inferra/issues) tab or create a new one
2. Comment on the issue to express your interest
3. Wait to be assigned before starting work

When proposing new features, clearly explain what it is, why it's useful, and how you plan to implement it.

Read our [Contributing Guide](docs/CONTRIBUTING.md) for detailed contribution guidelines, code standards, and best practices. 

### Features We're Looking For

- Support for different inference engines other than llama.cpp, including MNN and MLX (Apple-specific) which require custom native code

If you're interested in working on these or have other ideas, open an issue to discuss it.

## Acknowledgments

- [llama.cpp](https://github.com/ggerganov/llama.cpp) - The default underlying engine for running local LLMs and it's the only one that's been implemented yet.
- [inferra-llama.rn](https://github.com/sbhjt-gr/inferra-llama.rn) - The customized React Native adapter which provides the bridge for llama.cpp. Originally forked and self-hosted from [llama.rn](https://github.com/mybigday/llama.rn) for updating llama.cpp more frequently.
- [react-native-rag](https://github.com/software-mansion-labs/react-native-rag) + [@langchain/textsplitters](https://github.com/langchain-ai/langchainjs) - RAG implementation for React Native that powers the document retrieval and ingestion features using LangChain.
- [react-native-ai](https://github.com/callstackincubator/ai) - Adaptor that provides Apple Foundation bridge from Swift to JavaScript.
- If someone thinks they also need to be mentioned here, please let me know.

## Tech Stack

- **React Native + Expo**: For cross-platform support.
- **TypeScript**: The syntactical superset of JavaScript, widely used for React Development.
- **Firebase**: For authentication, Firestore database, and cloud services.
- **inferra-llama**: Custom llama.cpp bridge for local inference originally maintained by <a href="https://www.bricks.tools/" target="_blank">BRICS</a>.
- **React Navigation**: For navigation and routing.
- **React Native Paper**: Used for many Material Design UI components, although the whole UI is not purely based on the Material design.
- **React Native ML Kit**: For on-device text recognition and OCR.
- **react-native-tcp-socket**: For HTTP server implementation and network communication.
- **ESLint**: For code quality.
- **Some Expo Modules**: For camera, file system, notifications, device APIs etc.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=sbhjt-gr/inferra&type=Date)](https://star-history.com/#sbhjt-gr/inferra&Date)

---

<p align="center">
  <sub>Star this repository if you find it useful!</sub>
</p>
