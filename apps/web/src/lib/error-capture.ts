/**
 * Remembers the last few API failures so "Ask Saarthi about this" can attach
 * real context instead of asking the user to describe what went wrong.
 *
 * Deliberately minimal: method, path, status, code, message, correlation id and
 * the route the user was on. No tokens, no passwords, no request bodies — this
 * is about to be shown in a chat panel and sent to the server, so it holds the
 * least that is useful rather than the most that is available.
 *
 * The server does not trust any of it. The correlation id is the important
 * field: the API looks up its OWN record of that failure and diagnoses from
 * that, using the rest only as a fallback when the record has aged out.
 */
export interface CapturedError {
  correlationId: string | null;
  endpoint: string;
  method: string;
  status: number;
  errorCode: string;
  message: string;
  route: string;
  timestamp: number;
}

const MAX = 5;
let captured: CapturedError[] = [];

type Listener = (errors: CapturedError[]) => void;
const listeners = new Set<Listener>();

export function captureError(e: Omit<CapturedError, 'timestamp' | 'route'>): void {
  if (typeof window === 'undefined') return;
  const entry: CapturedError = {
    ...e,
    route: window.location.pathname,
    timestamp: Date.now(),
  };
  captured = [entry, ...captured].slice(0, MAX);
  for (const fn of listeners) fn(captured);
}

export function getCapturedErrors(): CapturedError[] {
  return captured;
}

export function latestError(): CapturedError | null {
  return captured[0] ?? null;
}

export function clearCapturedErrors(): void {
  captured = [];
  for (const fn of listeners) fn(captured);
}

export function subscribeToErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Compact one-line label for the chip in the chat panel. */
export function describeError(e: CapturedError): string {
  return `${e.method} ${e.endpoint} · ${e.status} · ${e.errorCode}`;
}

/** The full text handed to the assistant when no server record survives. */
export function serialiseError(e: CapturedError): string {
  return [
    `method: ${e.method}`,
    `path: ${e.endpoint}`,
    `status: ${e.status}`,
    `code: ${e.errorCode}`,
    `message: ${e.message}`,
    `screen: ${e.route}`,
  ].join('\n');
}
