import { DownloadableModel } from "../components/model/DownloadableModelItem";

export const DOWNLOADABLE_MODELS: DownloadableModel[] = [
  {
    "name": "Gemma 3n-E4B Instruct (Q2_K)",
    "description": "Google's enhanced Gemma 3 variant with optimized efficiency and fast inference capabilities.",
    "size": "2.76 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF/resolve/main/gemma-3n-E4B-it-Q2_K.gguf",
    "modelFamily": "3+ Billion",
    "quantization": "Q2_K",
    "tags": ["recommended"]
  },
  {
    "name": "Gemma 3 Instruct - 1B",
    "description": "Google's latest compact instruction-tuned model with strong reasoning and fast inference with 1 billion parameters.",
    "size": "1.07 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q8_0.gguf",
    "modelFamily": "1 Billion",
    "quantization": "Q8_0",
    "tags": ["recommended", "fastest"]
  },
  {
    "name": "SmolVLM2 Instruct",
    "description": "Compact vision-language model with 2.2B parameters optimized for multimodal tasks.",
    "size": "2.5 GB",
    "huggingFaceLink": "https://huggingface.co/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/SmolVLM2-2.2B-Instruct-Q8_0.gguf",
    "modelFamily": "2.2 Billion",
    "quantization": "Q8_0",
    "tags": ["vision", "fastest"],
    "additionalFiles": [
      {
        "name": "mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf",
        "url": "https://huggingface.co/ggml-org/SmolVLM2-2.2B-Instruct-GGUF/resolve/main/mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf",
        "description": "Multimodal projector for SmolVLM2"
      }
    ]
  },
  {
    "name": "Gemma 3 Instruct - 4B",
    "description": "Google's latest compact instruction-tuned model with strong reasoning and fast inference with 4 billion parameters.",
    "size": "2.83 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q5_K_M.gguf",
    "modelFamily": "4 Billion",
    "quantization": "Q5_K_M",
    "tags": ["recommended"]
  },
  {
    "name": "Gemma 3n-E4B Instruct (Q4_K_S)",
    "description": "Google's enhanced Gemma 3 variant with balanced performance and quality optimization.",
    "size": "4.1 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/gemma-3n-E4B-it-GGUF/resolve/main/gemma-3n-E4B-it-Q4_K_S.gguf",
    "modelFamily": "3+ Billion",
    "quantization": "Q4_K_S",
  },
  {
    "name": "DeepSeek-R1 Distill Qwen",
    "description": "Highly optimized distillation of DeepSeek's R1 model using Qwen architecture for improved efficiency.",
    "size": "1.89 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q8_0.gguf",
    "modelFamily": "1.5 Billion",
    "quantization": "Q8_0",
    "tags": ["fastest"]
  },
  {
    "name": "Phi-3 Mini Instruct",
    "description": "Microsoft's compact instruction-tuned model with strong reasoning capabilities despite its small size.",
    "size": "2.2 GB",
    "huggingFaceLink": "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf",
    "modelFamily": "3.8 Billion",
    "quantization": "Q4_K_M",
    "tags": ["fastest"]
  },
  {
    "name": "Qwen 2.5 Coder Instruct",
    "description": "Alibaba's specialized coding model with excellent code completion and explanation abilities.",
    "size": "2.27 GB",
    "huggingFaceLink": "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q5_k_m.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q5_K_M",
    "tags": ["fastest"]
  },
  {
    "name": "CodeLlama",
    "description": "Meta's code-specialized model trained on code repositories with strong programming capabilities.",
    "size": "2.95 GB",
    "huggingFaceLink": "https://huggingface.co/TheBloke/CodeLlama-7B-GGUF/resolve/main/codellama-7b.Q3_K_S.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q3_K_S"
  },
  {
    "name": "DeepSeek-R1 Distill Llama",
    "description": "Distilled version of DeepSeek's R1 model with balanced performance and efficiency.",
    "size": "3.8 GB",
    "huggingFaceLink": "https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "Mistral Instruct",
    "description": "Instruction-tuned version of Mistral's powerful base model with excellent reasoning abilities.",
    "size": "4.1 GB",
    "huggingFaceLink": "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "DeepSeek Base",
    "description": "Foundation model from DeepSeek trained on diverse data with strong general capabilities.",
    "size": "4.6 GB",
    "huggingFaceLink": "https://huggingface.co/TheBloke/deepseek-llm-7B-base-GGUF/resolve/main/deepseek-llm-7b-base.Q4_K_S.gguf",
    "modelFamily": "8 Billion",
    "quantization": "Q4_K_S"
  },
  {
    "name": "LLaMA 3.1 Instruct",
    "description": "Meta's latest instruction-tuned model with improved reasoning and instruction following.",
    "size": "4.7 GB",
    "huggingFaceLink": "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
    "modelFamily": "8 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "DeepSeek Coder Instruct",
    "description": "Specialized coding assistant trained on high-quality programming data with instruction tuning.",
    "size": "4.8 GB",
    "huggingFaceLink": "https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct-Q6_K.gguf",
    "modelFamily": "6.7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "CodeGemma Instruct",
    "description": "Google's code-focused model with strong programming and technical documentation capabilities.",
    "size": "5.1 GB",
    "huggingFaceLink": "https://huggingface.co/bartowski/codegemma-7b-it-GGUF/resolve/main/codegemma-7b-it-Q6_K.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "Mistral Grok",
    "description": "Mistral's adaptation of the Grok model with enhanced conversational abilities.",
    "size": "5.1 GB",
    "huggingFaceLink": "https://huggingface.co/mradermacher/mistral-7b-grok-GGUF/resolve/main/mistral-7b-grok.Q3_K_L.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q3_K_L"
  },
  {
    "name": "Qwen 2.5 Instruct",
    "description": "Alibaba's general-purpose instruction-tuned model with strong multilingual capabilities.",
    "size": "5.2 GB",
    "huggingFaceLink": "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q6_K.gguf",
    "modelFamily": "7 Billion",
    "quantization": "Q6_K"
  },
  {
    "name": "Gemma 2 Instruct",
    "description": "Google's previous instruction-tuned model with excellent reasoning and helpfulness.",
    "size": "5.4 GB",
    "huggingFaceLink": "https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf",
    "modelFamily": "9 Billion",
    "quantization": "Q4_K_M"
  },
  {
    "name": "LLaMA 2 Chat",
    "description": "Meta's larger chat-optimized model with enhanced reasoning and instruction following.",
    "size": "8.7 GB",
    "huggingFaceLink": "https://huggingface.co/TheBloke/Llama-2-13B-chat-GGUF/resolve/main/llama-2-13b-chat.Q5_K_M.gguf",
    "modelFamily": "13 Billion",
    "quantization": "Q5_K_M"
  }
]; 