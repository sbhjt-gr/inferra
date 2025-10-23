export type JsonResponder = (socket: any, status: number, payload: any) => void;

export type ApiHandler = (
  method: string,
  segments: string[],
  body: string,
  socket: any,
  path: string
) => Promise<boolean>;

export type StatusHandler = (method: string, socket: any, path: string) => Promise<boolean>;
