import type { Prisma } from '@prisma/client';

/**
 * Audit payloads are stored as `jsonb`, so every value written into one must be a
 * `Prisma.JsonValue`. Dates in particular need normalising — they are common in
 * task diffs (dueDate) and would otherwise fail the type check or serialise
 * inconsistently between write and re-hash.
 */
export function jsonSafe(value: unknown): Prisma.JsonValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value as Prisma.JsonValue;
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

/**
 * Builds a `{ field: { from, to } }` object containing ONLY the fields that
 * actually changed. Audit payloads are evidence, not a dump of the whole row.
 */
export function diffFields<T extends object>(
  existing: T,
  input: Partial<Record<keyof T, unknown>>,
  fields: readonly (keyof T)[],
): Prisma.JsonObject {
  const changes: Prisma.JsonObject = {};
  for (const key of fields) {
    const next = input[key];
    if (next === undefined) continue;

    const before = existing[key];
    const changed =
      before instanceof Date && next instanceof Date
        ? before.getTime() !== next.getTime()
        : before !== next;

    if (changed) {
      changes[String(key)] = { from: jsonSafe(before), to: jsonSafe(next) };
    }
  }
  return changes;
}

export const hasChanges = (changes: Prisma.JsonObject) => Object.keys(changes).length > 0;
