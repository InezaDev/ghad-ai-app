import { ChatMessage, GraphicsQuality, GroundingSource } from '../types/ghad';

export interface GeminiHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

/**
 * Extracts clean alternating conversation history prior to the active user turn.
 * Targeting `activeUserMessageId` prevents misaligning or dropping turns when
 * multiple queued jobs or retries occur on the same thread.
 */
export function buildAssistantHistory(
  messages: ChatMessage[],
  activeUserMessageId?: string,
  maxTurns = 24
): GeminiHistoryTurn[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  let sliceEnd = messages.length;
  if (activeUserMessageId) {
    const idx = messages.findIndex((m) => m.id === activeUserMessageId);
    if (idx >= 0) {
      sliceEnd = idx;
    }
  } else {
    // Fallback: if no ID provided and last non-error message is user, exclude it
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id.endsWith('_err')) continue;
      if (messages[i].role === 'user') {
        sliceEnd = i;
      }
      break;
    }
  }

  const rawTurns: GeminiHistoryTurn[] = [];
  for (const m of messages.slice(0, sliceEnd)) {
    if (!m || typeof m.text !== 'string') continue;
    const trimmed = m.text.trim();
    if (!trimmed || m.id.endsWith('_err')) continue;
    const role: 'user' | 'model' = m.role === 'user' ? 'user' : 'model';
    const prev = rawTurns[rawTurns.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${trimmed}`;
    } else {
      rawTurns.push({ role, text: trimmed });
    }
  }

  const sliced = rawTurns.slice(-Math.max(1, maxTurns));
  // Gemini expects history prior to a new 'user' turn not to end on 'user'
  while (sliced.length > 0 && sliced[sliced.length - 1].role === 'user') {
    sliced.pop();
  }
  return sliced;
}

export function isSafeHttpUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeGroundingSources(
  sources: Array<{ title?: string; uri?: string } | null | undefined>,
  maxCount = 10
): GroundingSource[] {
  if (!Array.isArray(sources)) return [];
  const seen = new Set<string>();
  const out: GroundingSource[] = [];

  for (const item of sources) {
    const uri = typeof item?.uri === 'string' ? item.uri.trim() : '';
    if (!isSafeHttpUrl(uri) || seen.has(uri)) continue;
    seen.add(uri);
    let title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!title) {
      try {
        title = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        title = uri;
      }
    }
    out.push({ title, uri });
    if (out.length >= maxCount) break;
  }
  return out;
}

export function normalizeGraphicsQuality(value: unknown): GraphicsQuality {
  return value === 'low' ? 'low' : 'ultra';
}
