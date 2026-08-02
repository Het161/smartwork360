'use client';

import { motion } from 'framer-motion';
import { useReducedMotion } from '@/lib/motion';

/**
 * "Your code is on its way" animation.
 *
 * Pure inline SVG + Framer Motion — no Lottie, no external asset. The offline rule
 * applies to delight as much as to data.
 *
 * Beat 1 (0.0–0.6s)  the flap swings open
 * Beat 2 (0.5–1.1s)  a letter rises out of the envelope
 * Beat 3 (0.9–1.7s)  a paper plane traces a curved path away and fades
 */
export function EnvelopeAnimation({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  if (reduced) {
    // Static, correct, and non-moving: the same information without the motion.
    return (
      <div className={className} aria-hidden>
        <svg width="120" height="88" viewBox="0 0 120 88" fill="none">
          <rect x="14" y="24" width="92" height="56" rx="8" fill="#EEF3FA" stroke="#14417B" strokeWidth="2" />
          <path d="M14 32 L60 60 L106 32" stroke="#14417B" strokeWidth="2" fill="none" />
          <circle cx="96" cy="26" r="12" fill="#0E7A3D" />
          <path d="M90 26 l4 4 l8 -8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
    );
  }

  return (
    <div className={className} aria-hidden>
      <svg width="140" height="104" viewBox="0 0 140 104" fill="none" overflow="visible">
        {/* Letter — rises out of the envelope body */}
        <motion.g
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: -14, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.0, delay: 0.45, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
        >
          <rect x="38" y="24" width="64" height="42" rx="4" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="1.5" />
          <rect x="46" y="34" width="34" height="3" rx="1.5" fill="#CBD5E1" />
          <rect x="46" y="42" width="48" height="3" rx="1.5" fill="#E2E8F0" />
          <rect x="46" y="50" width="26" height="3" rx="1.5" fill="#E2E8F0" />
        </motion.g>

        {/* Envelope body */}
        <rect x="24" y="36" width="92" height="56" rx="8" fill="#EEF3FA" stroke="#14417B" strokeWidth="2" />
        {/* Front fold, drawn over the letter so it appears to emerge from inside */}
        <path d="M24 92 L70 62 L116 92" fill="#EEF3FA" stroke="#14417B" strokeWidth="2" strokeLinejoin="round" />

        {/* Flap — opens upward around its hinge */}
        <motion.path
          d="M24 44 L70 72 L116 44 L116 40 A4 4 0 0 0 112 36 L28 36 A4 4 0 0 0 24 40 Z"
          fill="#D9E4F3"
          stroke="#14417B"
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ originX: '50%', originY: '36px' }}
          initial={{ rotateX: 0 }}
          animate={{ rotateX: -165 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />

        {/* Paper plane — follows a curved flight path, then fades */}
        <motion.g
          initial={{ x: 62, y: 40, opacity: 0, rotate: -12, scale: 0.7 }}
          animate={{
            x: [62, 92, 128],
            y: [40, 8, -14],
            opacity: [0, 1, 0],
            rotate: [-12, 8, 22],
            scale: [0.7, 1, 0.9],
          }}
          transition={{ duration: 0.85, delay: 0.9, ease: 'easeOut', times: [0, 0.5, 1] }}
        >
          <path d="M0 0 L18 7 L7 9 L5 18 Z" fill="#FF9933" />
          <path d="M7 9 L18 7 L5 18 Z" fill="#E07A1F" />
        </motion.g>

        {/* Motion trail behind the plane */}
        <motion.path
          d="M64 44 Q 92 20 126 -6"
          stroke="#FF9933"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.9, delay: 0.92, ease: 'easeOut' }}
        />
      </svg>
    </div>
  );
}
