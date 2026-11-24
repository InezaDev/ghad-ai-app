export interface ParsedBodyResult {
  ok: true;
  body: Record<string, unknown>;
}

export interface ParsedBodyError {
  ok: false;
  error: string;
}

export function parseRequestBody(rawBody: unknown): ParsedBodyResult | ParsedBodyError {
  if (rawBody === undefined || rawBody === null || rawBody === '') {
    return { ok: true, body: {} };
  }

  if (typeof rawBody === 'string') {
    const trimmed = rawBody.trim();
    if (!trimmed) return { ok: true, body: {} };
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ok: true, body: parsed as Record<string, unknown> };
      }
      return { ok: false, error: 'Request JSON body must be an object.' };
    } catch {
      return { ok: false, error: 'Malformed JSON in request body.' };
    }
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawBody)) {
    return parseRequestBody(rawBody.toString('utf8'));
  }

  if (typeof rawBody === 'object' && !Array.isArray(rawBody)) {
    return { ok: true, body: rawBody as Record<string, unknown> };
  }

  return { ok: false, error: 'Unsupported request body format.' };
}
