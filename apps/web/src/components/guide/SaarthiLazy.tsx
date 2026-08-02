'use client';

import dynamic from 'next/dynamic';
import { SaarthiFace } from './SaarthiFace';
import type { SaarthiMascotProps } from './SaarthiMascot';

/**
 * The only way the app should reach the 3D mascot.
 *
 * `ssr: false` because Three.js touches `window` at import time, and the whole
 * R3F bundle is code-split so it never loads for a user who never opens the
 * guide. Until it arrives — and forever, on a device without WebGL — the static
 * SVG face stands in.
 */
const Mascot = dynamic(() => import('./SaarthiMascot'), {
  ssr: false,
  loading: () => <SaarthiFace size={90} />,
});

export function Saarthi(props: SaarthiMascotProps) {
  return <Mascot {...props} />;
}
