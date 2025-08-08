import { HUGGINGFACE_TOKEN } from '@env';

export const testHuggingFaceConnection = async () => {
  try {
    const testUrl = 'https://huggingface.co/api/models?filter=gguf&sort=-downloads&limit=5';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (HUGGINGFACE_TOKEN) {
      headers['Authorization'] = `Bearer ${HUGGINGFACE_TOKEN}`;
    }

    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};