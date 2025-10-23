import { Buffer } from 'buffer';
import { getHTTPStatusText } from './httpStatus';

export function sendChunkedResponseStart(socket: any, status: number, headers: Record<string, string>): void {
  const statusText = getHTTPStatusText(status);
  const mergedHeaders: Record<string, string> = {
    'Transfer-Encoding': 'chunked',
    'Connection': 'close',
    'Access-Control-Allow-Origin': '*',
    ...headers,
  };

  const headerLines = Object.entries(mergedHeaders)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\r\n');

  const response = `HTTP/1.1 ${status} ${statusText}\r\n${headerLines}\r\n\r\n`;
  socket.write(response);
}

export function writeChunk(socket: any, payload: any): void {
  const body = JSON.stringify(payload) + '\n';
  const size = Buffer.byteLength(body, 'utf8').toString(16);
  const chunk = `${size}\r\n${body}\r\n`;
  socket.write(chunk);
}

export function endChunkedResponse(socket: any): void {
  socket.write('0\r\n\r\n');
  socket.end();
}
