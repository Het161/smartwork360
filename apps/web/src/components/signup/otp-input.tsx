'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { pop, shakeKeyframes, useReducedMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

const LENGTH = 6;

/**
 * Six-box OTP entry.
 *
 * Behaviours that matter more than the animation: paste distributes across all
 * boxes (people paste codes from their mail client), backspace on an empty box
 * steps back, arrow keys move, and the whole group is one labelled field for
 * screen readers rather than six unlabelled text inputs.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  status,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  status: 'idle' | 'error' | 'success';
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);

  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  useEffect(() => {
    // Autofocus the first empty box when the step mounts.
    const firstEmpty = Math.min(value.length, LENGTH - 1);
    refs.current[firstEmpty]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === 'error') refs.current[0]?.focus();
  }, [status]);

  function setDigit(index: number, digit: string) {
    const next = value.padEnd(LENGTH, ' ').split('');
    next[index] = digit;
    const joined = next.join('').replace(/\s/g, ' ').trimEnd();
    const cleaned = joined.replace(/\s/g, '');
    onChange(cleaned);
    return cleaned;
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;

    const chars = value.split('');
    chars[index] = digit;
    const next = chars.join('').slice(0, LENGTH);
    onChange(next);

    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
    if (next.length === LENGTH && !next.includes(' ')) onComplete(next);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const chars = value.split('');
      if (chars[index]) {
        chars[index] = '';
        onChange(chars.join('').trimEnd());
      } else if (index > 0) {
        chars[index - 1] = '';
        onChange(chars.slice(0, index - 1).join(''));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < LENGTH - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    const target = Math.min(pasted.length, LENGTH - 1);
    refs.current[target]?.focus();
    if (pasted.length === LENGTH) onComplete(pasted);
  }

  return (
    <motion.div
      role="group"
      aria-label="6-digit verification code"
      className="flex justify-center gap-2 sm:gap-2.5"
      animate={status === 'error' && !reduced ? shakeKeyframes : { x: 0 }}
      transition={{ duration: 0.42 }}
    >
      {Array.from({ length: LENGTH }).map((_, i) => {
        const digit = digits[i]?.trim() ?? '';
        return (
          <motion.input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            disabled={disabled}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            // Each freshly-entered digit pops; success turns the boxes green in a
            // left-to-right stagger so the eye follows the confirmation.
            animate={
              reduced
                ? {}
                : status === 'success'
                  ? { scale: [1, 1.08, 1], transition: { delay: i * 0.06, duration: 0.3 } }
                  : digit
                    ? { scale: [0.7, 1] }
                    : { scale: 1 }
            }
            transition={pop}
            className={cn(
              'h-14 w-11 rounded-btn border-2 text-center text-2xl font-semibold tabular-nums transition-colors sm:h-16 sm:w-12',
              'focus-visible:outline-none disabled:opacity-60',
              status === 'error'
                ? 'border-danger bg-danger-soft text-danger'
                : status === 'success'
                  ? 'border-success bg-success-soft text-success'
                  : digit
                    ? 'border-primary bg-white text-slate-900'
                    : 'border-borderx bg-white text-slate-900',
              focused === i && status === 'idle' && 'ring-2 ring-primary ring-offset-1',
            )}
          />
        );
      })}
    </motion.div>
  );
}
