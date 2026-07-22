import TextRecognition, {
  TextRecognitionScript,
  type TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';

class TextRecognitionAdapterClass {
  async recognize(
    imageUrl: string,
    script: TextRecognitionScript = TextRecognitionScript.LATIN
  ): Promise<TextRecognitionResult> {
    console.log('ocr_adapt_start');
    const result = await TextRecognition.recognize(imageUrl, script);
    console.log('ocr_adapt_done');
    return result;
  }
}

export const textRecognitionAdapter = new TextRecognitionAdapterClass();
export { TextRecognitionScript };
export type { TextRecognitionResult };
