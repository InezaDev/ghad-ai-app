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

export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
}

export function getHeader(req: ApiRequest, name: string): string | undefined {
  if (!req.headers) return undefined;
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === target) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

export interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
  end?: () => void;
}

export interface ApiErrorPayload {
  status: number;
  message: string;
  error: string;
  code?: string;
  route?: string;
}

export interface NormalizedErrorInput {
  status: number;
  body: {
    error: string;
    status: number;
    code?: string;
    details?: string;
  };
}

export function buildApiErrorResponse(
  err: unknown,
  formatError: (error: unknown) => NormalizedErrorInput,
  route?: string
): { status: number; payload: ApiErrorPayload } {
  const { status, body } = formatError(err);
  const message = body.error || 'Internal server error.';
  const errorDetail = body.details || body.error || (err instanceof Error ? err.message : String(err));

  return {
    status,
    payload: {
      status,
      message,
      error: errorDetail,
      ...(body.code ? { code: body.code } : {}),
      ...(route ? { route } : {}),
    },
  };
}

export function withApiErrorHandler<Req extends ApiRequest, Res extends ApiResponse>(
  route: string,
  formatError: (error: unknown) => NormalizedErrorInput,
  handler: (req: Req, res: Res) => Promise<void> | void
) {
  return async (req: Req, res: Res): Promise<void> => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(`[GHAD AI ${route}]`, err);
      const { status, payload } = buildApiErrorResponse(err, formatError, route);
      res.status(status).json(payload);
    }
  };
}

