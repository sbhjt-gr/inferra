import { fs as FileSystem } from '../fs';
import { modelDownloader } from '../ModelDownloader';
import { minilmRemote } from '../adapters/ExecuTorchModelAdapter';

const ASSET_DIR = 'rag-embeddings/all-MiniLM-L6-v2';
const MODEL_SIZE_BYTES = 91 * 1024 * 1024;
const TOKENIZER_SIZE_BYTES = 712 * 1024;

type AssetPaths = {
  modelPath: string;
  tokenizerPath: string;
};

type ProgressCb = (progress: number) => void;

const toFileUri = (path: string): string =>
  path.startsWith('file://') ? path : `file://${path}`;

class MiniLMAssetsClass {
  private downloading: Promise<AssetPaths> | null = null;

  private rootDir(): string {
    return `${FileSystem.documentDirectory}${ASSET_DIR}`;
  }

  getPaths(): AssetPaths {
    const root = this.rootDir();
    return {
      modelPath: `${root}/${minilmRemote.modelFile}`,
      tokenizerPath: `${root}/${minilmRemote.tokenizerFile}`,
    };
  }

  getSources(): { modelSource: string; tokenizerSource: string } {
    const paths = this.getPaths();
    return {
      modelSource: toFileUri(paths.modelPath),
      tokenizerSource: toFileUri(paths.tokenizerPath),
    };
  }

  async isReady(): Promise<boolean> {
    const { modelPath, tokenizerPath } = this.getPaths();
    const modelInfo = await FileSystem.getInfoAsync(modelPath, { size: true });
    const tokInfo = await FileSystem.getInfoAsync(tokenizerPath, { size: true });
    const ready =
      modelInfo.exists &&
      !modelInfo.isDirectory &&
      (modelInfo.size ?? 0) > 0 &&
      tokInfo.exists &&
      !tokInfo.isDirectory &&
      (tokInfo.size ?? 0) > 0;
    console.log('minilm_ready', ready);
    return ready;
  }

  estimatedBytes(): number {
    return MODEL_SIZE_BYTES + TOKENIZER_SIZE_BYTES;
  }

  async ensureDir(): Promise<void> {
    const root = this.rootDir();
    const info = await FileSystem.getInfoAsync(root);
    if (!info.exists) {
      console.log('minilm_mkdir');
      await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    }
  }

  async download(onProgress?: ProgressCb): Promise<AssetPaths> {
    if (await this.isReady()) {
      console.log('minilm_cached');
      return this.getPaths();
    }
    if (this.downloading) {
      console.log('minilm_download_reuse');
      return this.downloading;
    }
    this.downloading = this.runDownload(onProgress);
    try {
      return await this.downloading;
    } finally {
      this.downloading = null;
    }
  }

  private async runDownload(onProgress?: ProgressCb): Promise<AssetPaths> {
    console.log('minilm_download_start');
    await this.ensureDir();
    const paths = this.getPaths();
    const total = this.estimatedBytes();
    let completed = 0;

    const report = (extra: number) => {
      const pct = Math.min(100, Math.round(((completed + extra) / total) * 100));
      onProgress?.(pct);
    };

    await this.fetchFile(
      minilmRemote.modelUrl,
      minilmRemote.modelFile,
      paths.modelPath,
      bytes => {
        report(bytes);
      }
    );
    completed += MODEL_SIZE_BYTES;
    report(0);

    await this.fetchFile(
      minilmRemote.tokenizerUrl,
      minilmRemote.tokenizerFile,
      paths.tokenizerPath,
      bytes => {
        report(bytes);
      }
    );
    completed += TOKENIZER_SIZE_BYTES;
    onProgress?.(100);

    if (!(await this.isReady())) {
      console.log('minilm_download_incomplete');
      throw new Error('minilm_download_incomplete');
    }
    console.log('minilm_download_done');
    return paths;
  }

  private async fetchFile(
    url: string,
    tempName: string,
    finalPath: string,
    onBytes: (bytes: number) => void
  ): Promise<void> {
    const existing = await FileSystem.getInfoAsync(finalPath, { size: true });
    if (existing.exists && (existing.size ?? 0) > 0) {
      console.log('minilm_file_exists', tempName);
      return;
    }

    const downloadName = `temp_minilm_${Date.now()}_${tempName}`;
    console.log('minilm_fetch', tempName);

    await new Promise<void>((resolve, reject) => {
      const onComplete = (data: { modelName?: string }) => {
        if (data.modelName !== downloadName) {
          return;
        }
        cleanup();
        resolve();
      };
      const onFailed = (data: { modelName?: string; error?: string }) => {
        if (data.modelName !== downloadName) {
          return;
        }
        cleanup();
        reject(new Error(data.error || 'minilm_download_failed'));
      };
      const onCancelled = (data: { modelName?: string }) => {
        if (data.modelName !== downloadName) {
          return;
        }
        cleanup();
        reject(new Error('minilm_download_cancelled'));
      };
      const onProgress = (data: {
        modelName?: string;
        bytesDownloaded?: number;
      }) => {
        if (data.modelName !== downloadName) {
          return;
        }
        onBytes(data.bytesDownloaded ?? 0);
      };

      const cleanup = () => {
        modelDownloader.off('downloadCompleted', onComplete);
        modelDownloader.off('downloadFailed', onFailed);
        modelDownloader.off('downloadCancelled', onCancelled);
        modelDownloader.off('downloadProgress', onProgress);
      };

      modelDownloader.on('downloadCompleted', onComplete);
      modelDownloader.on('downloadFailed', onFailed);
      modelDownloader.on('downloadCancelled', onCancelled);
      modelDownloader.on('downloadProgress', onProgress);

      modelDownloader.downloadModel(url, downloadName).catch(error => {
        cleanup();
        reject(error instanceof Error ? error : new Error('minilm_download_failed'));
      });
    });

    const tempPath = `${FileSystem.documentDirectory}temp/${downloadName}`;
    const modelPath = `${FileSystem.documentDirectory}models/${downloadName}`;
    const tempInfo = await FileSystem.getInfoAsync(tempPath);
    const modelInfo = await FileSystem.getInfoAsync(modelPath);

    let source: string | null = null;
    if (tempInfo.exists) {
      source = tempPath;
    } else if (modelInfo.exists) {
      source = modelPath;
    }

    if (!source) {
      console.log('minilm_source_missing', tempName);
      throw new Error('minilm_source_missing');
    }

    await this.ensureDir();
    const finalInfo = await FileSystem.getInfoAsync(finalPath);
    if (finalInfo.exists) {
      await FileSystem.deleteAsync(finalPath, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: source, to: finalPath });
    console.log('minilm_moved', tempName);
  }
}

export const MiniLMAssets = new MiniLMAssetsClass();
export type { AssetPaths };
