export function parseJsonBody(body: string | null): { payload: any; error?: string } {
  if (!body) {
    return { payload: null, error: 'empty_body' };
  }

  try {
    const payload = JSON.parse(body);
    return { payload };
  } catch (error) {
    return { payload: null, error: 'invalid_json' };
  }
}
