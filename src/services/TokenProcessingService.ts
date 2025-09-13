import { TokenQueueItem } from '../types/llama';
import { TOKEN_PROCESSING_CONFIG } from '../config/llamaConfig';

export class TokenProcessingService {
  private tokenQueue: TokenQueueItem[] = [];
  private isProcessingTokens: boolean = false;
  private tokenProcessingPromise: Promise<void> | null = null;
  private isCancelled: boolean = false;

  queueToken(token: string): void {
    this.tokenQueue.push({
      token,
      timestamp: Date.now()
    });
  }

  async processTokenQueue(onToken?: (token: string) => boolean | void): Promise<void> {
    if (this.isProcessingTokens || this.tokenQueue.length === 0) {
      return;
    }

    this.isProcessingTokens = true;

    try {
      const tokensToProcess = [...this.tokenQueue];
      this.tokenQueue = [];

      for (const item of tokensToProcess) {
        if (this.isCancelled) {
          break;
        }

        if (onToken) {
          const shouldContinue = onToken(item.token);
          if (shouldContinue === false) {
            this.isCancelled = true;
            break;
          }
        }
      }
    } finally {
      this.isProcessingTokens = false;
    }
  }

  async waitForTokenQueueCompletion(): Promise<void> {
    const { maxWaitTime, checkInterval } = TOKEN_PROCESSING_CONFIG;
    let elapsed = 0;

    while ((this.tokenQueue.length > 0 || this.isProcessingTokens) && elapsed < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    if (elapsed >= maxWaitTime) {
    }
  }

  clearTokenQueue(): void {
    this.tokenQueue = [];
    this.isProcessingTokens = false;
    this.tokenProcessingPromise = null;
  }

  setCancelled(cancelled: boolean): void {
    this.isCancelled = cancelled;
  }

  isCancelling(): boolean {
    return this.isCancelled;
  }

  async startTokenProcessing(onToken?: (token: string) => boolean | void): Promise<void> {
    if (!this.tokenProcessingPromise) {
      this.tokenProcessingPromise = this.processTokenQueue(onToken).finally(() => {
        this.tokenProcessingPromise = null;
      });
    }
    await this.tokenProcessingPromise;
  }

  hasQueuedTokens(): boolean {
    return this.tokenQueue.length > 0 || this.isProcessingTokens;
  }
}
