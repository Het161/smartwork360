'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, RotateCcw, Wrench, AlertTriangle, Loader2 } from 'lucide-react';
import { api, ApiError, type SupportReplyDTO } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * The confirm step for a proposed remediation.
 *
 * Nothing here decides whether the change is allowed — the server re-checks the
 * role, the department and the arguments when Apply is pressed. This card's job
 * is to make sure a person actually chose it, and to say plainly what will
 * happen. Medium-risk actions additionally require a typed reason, which is
 * stored on the audit chain next to the operator's name.
 */
export function FixCard({
  reply,
  onApplied,
}: {
  reply: SupportReplyDTO;
  onApplied?: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'applying' | 'applied' | 'undone' | 'failed'>('idle');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chainIndex, setChainIndex] = useState<number | null>(null);
  const [undoable, setUndoable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!reply.fixId || !reply.suggestedFix || dismissed) return null;

  const medium = reply.fixRisk === 'medium';
  const needsReason = medium && reason.trim().length === 0;

  const apply = async () => {
    setState('applying');
    setError(null);
    try {
      const res = await api.applyFix(reply.fixId!, reason.trim() || undefined);
      setResult(res.summary);
      setChainIndex(res.auditChainIndex);
      setUndoable(res.undoable);
      setState('applied');
      onApplied?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.support.failed);
      setState('failed');
    }
  };

  const undo = async () => {
    setState('applying');
    try {
      const res = await api.undoFix(reply.fixId!);
      setResult(res.summary);
      setChainIndex(res.auditChainIndex);
      setState('undone');
      onApplied?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.support.failed);
      setState('applied');
    }
  };

  const done = state === 'applied' || state === 'undone';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-card border px-3 py-3 text-sm',
        done
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-amber-200 bg-amber-50/70',
      )}
      data-testid="fix-card"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
            done ? 'bg-emerald-600' : 'bg-amber-500',
          )}
          aria-hidden
        >
          {done ? (
            <motion.span
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            >
              <Check className="h-3.5 w-3.5 text-white" />
            </motion.span>
          ) : (
            <Wrench className="h-3.5 w-3.5 text-white" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {done ? t.support.applied : t.support.fixTitle}
          </p>

          {!done ? (
            <>
              <p className="mt-0.5 text-slate-700">{reply.suggestedFix.reason}</p>
              <p className="mt-1 font-mono text-xs text-slate-500">{reply.suggestedFix.action}</p>

              <span
                className={cn(
                  'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                  medium ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700',
                )}
              >
                {medium ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
                {medium ? t.support.riskMedium : t.support.riskLow}
              </span>

              {medium ? (
                <div className="mt-2">
                  <label
                    htmlFor={`reason-${reply.fixId}`}
                    className="block text-xs font-medium text-slate-700"
                  >
                    {t.support.reasonLabel}
                  </label>
                  <textarea
                    id={`reason-${reply.fixId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    placeholder={t.support.reasonPlaceholder}
                    className="mt-1 w-full rounded-btn border border-borderx bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  />
                </div>
              ) : null}

              {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={apply}
                  disabled={state === 'applying' || needsReason}
                  className="inline-flex items-center gap-1.5 rounded-btn bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {state === 'applying' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {state === 'applying' ? t.support.applying : t.support.apply}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="rounded-btn px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  {t.support.notNow}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-slate-800">{result}</p>
              {chainIndex !== null ? (
                <p className="mt-1 text-xs text-slate-500">
                  {t.support.auditedAs} #{chainIndex}
                </p>
              ) : null}
              {state === 'applied' && undoable ? (
                <div className="mt-2">
                  <p className="text-xs text-slate-500">{t.support.undoWindow}</p>
                  <button
                    type="button"
                    onClick={undo}
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary underline"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t.support.undo}
                  </button>
                </div>
              ) : null}
              {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
