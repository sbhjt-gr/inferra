import { logger } from '../../../utils/logger';

export type HTTPHeaders = { [key: string]: string };

export interface ParsedHTTPRequest {
  requestLine: string;
  headers: HTTPHeaders;
  body: string;
}

export function parseHTTPBuffer(buffer: string): {
  request: ParsedHTTPRequest | null;
  remainingBuffer: string;
  needsMoreData: boolean;
} {
  const separatorIndex = buffer.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return { request: null, remainingBuffer: buffer, needsMoreData: true };
  }

  const headerPart = buffer.slice(0, separatorIndex);
  const requestLineEnd = headerPart.indexOf('\r\n');
  const requestLine = requestLineEnd === -1 ? headerPart : headerPart.slice(0, requestLineEnd);
  const headersPart = requestLineEnd === -1 ? '' : headerPart.slice(requestLineEnd + 2);
  const headerLines = headersPart.length > 0 ? headersPart.split('\r\n') : [];
  const headers: HTTPHeaders = {};

  for (const headerLine of headerLines) {
    const separatorPos = headerLine.indexOf(':');
    if (separatorPos !== -1) {
      const key = headerLine.slice(0, separatorPos).trim().toLowerCase();
      const value = headerLine.slice(separatorPos + 1).trim();
      headers[key] = value;
    }
  }

  const contentLength = parseInt(headers['content-length'] || '0', 10);
  const totalLength = separatorIndex + 4 + contentLength;

  if (buffer.length < totalLength) {
    return { request: null, remainingBuffer: buffer, needsMoreData: true };
  }

  const body = buffer.slice(separatorIndex + 4, separatorIndex + 4 + contentLength);
  const remainingBuffer = buffer.slice(totalLength);

  return {
    request: { requestLine, headers, body },
    remainingBuffer,
    needsMoreData: false
  };
}
