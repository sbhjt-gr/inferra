import React from 'react';
import { WebView } from 'react-native-webview';

interface BackgroundWebViewProps {
  html: string;
  onReady: (webView: WebView) => void;
  onMessage: (message: string) => void;
}

export class WebViewManager {
  private webViewInstance: any = null;
  private htmlContent: string = '';
  private isReady: boolean = false;

  constructor() {
  }

  setHTMLContent(html: string) {
    this.htmlContent = html;
  }

  async start(): Promise<boolean> {
    if (this.isReady) {
      return true;
    }

    try {
      this.isReady = true;

      return true;
    } catch (error) {
      return false;
    }
  }

  setWebView(webView: any) {
    this.webViewInstance = webView;
  }

  async stop(): Promise<void> {
    if (!this.isReady) {
      return;
    }

    try {
      this.webViewInstance = null;
      this.isReady = false;

    } catch (error) {
    }
  }

  getStatus() {
    return {
      isReady: this.isReady,
      hasInstance: !!this.webViewInstance
    };
  }

  getHTMLContent() {
    return this.htmlContent;
  }

  isWebViewReady() {
    return this.isReady && !!this.webViewInstance;
  }
}

export const backgroundWebViewManager = new WebViewManager();