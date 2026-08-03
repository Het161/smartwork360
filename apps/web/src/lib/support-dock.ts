/**
 * Lets anything on the page open Saarthi Support, with a failure attached.
 *
 * A store rather than props because the callers are scattered and unrelated —
 * the help menu, an error toast, an error boundary — and none of them should
 * have to be a descendant of whatever renders the panel.
 */
import { latestError, type CapturedError } from './error-capture';

type Listener = (state: { open: boolean; seedError: CapturedError | null }) => void;

let state: { open: boolean; seedError: CapturedError | null } = { open: false, seedError: null };
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(state);
}

/**
 * Opens the panel. With no argument it attaches the most recent failure, so
 * "Ask Saarthi about this" works from a toast that does not itself hold the
 * error object.
 */
export function openSupport(error?: CapturedError | null): void {
  state = { open: true, seedError: error === undefined ? latestError() : error };
  emit();
}

export function closeSupport(): void {
  state = { ...state, open: false };
  emit();
}

export function subscribeToSupportDock(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
