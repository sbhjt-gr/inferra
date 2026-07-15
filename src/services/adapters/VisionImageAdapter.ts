import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

const MAX_EDGE = 768;

const getSize = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });

export const prepVisionImage = async (uri: string): Promise<string> => {
  console.log('vision_img_prep');

  try {
    const { width, height } = await getSize(uri);
    console.log('vision_img_size', { width, height });
    const longEdge = Math.max(width, height);
    const actions =
      longEdge > MAX_EDGE
        ? [
            {
              resize:
                width >= height
                  ? { width: MAX_EDGE }
                  : { height: MAX_EDGE },
            },
          ]
        : [];

    const result = await manipulateAsync(uri, actions, {
      compress: 0.7,
      format: SaveFormat.JPEG,
    });
    console.log('vision_img_ready', result.uri ? 'ok' : 'empty');
    return result.uri || uri;
  } catch (error) {
    console.log('vision_img_prep_fail', error instanceof Error ? error.message : 'unknown');
    return uri;
  }
};
