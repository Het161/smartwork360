'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { SaarthiPose } from './tours/shared';
import { SaarthiFace } from './SaarthiFace';
import { useReducedMotion } from '@/lib/motion';

/**
 * Saarthi, built entirely from Three.js primitives.
 *
 * No GLB, no HDRI, no Environment, no CDN — the project's offline rule applies
 * to the mascot too, so every shape is generated in code and every light is a
 * plain light. That also keeps the bundle cost to the libraries alone.
 */

const NAVY = '#14417B';
const NAVY_DARK = '#0E2A52';
const SCREEN = '#0B1D3A';
const SAFFRON = '#FF9933';
const GREEN = '#2BAE66';

/** Frame-rate independent easing towards a target. */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function Robot({ pose }: { pose: SaarthiPose }) {
  const group = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const leftEye = useRef<THREE.Mesh>(null!);
  const rightEye = useRef<THREE.Mesh>(null!);
  const antenna = useRef<THREE.MeshStandardMaterial>(null!);

  // Pose timeline state. Poses are one-shot performances that settle back to
  // idle, so each needs its own clock rather than reading the global one.
  const poseStart = useRef(0);
  const lastPose = useRef<SaarthiPose>(pose);
  const nextBlink = useRef(2 + Math.random() * 3);
  const blinkUntil = useRef(-1);
  const spin = useRef(0);

  useEffect(() => {
    if (pose !== lastPose.current) {
      lastPose.current = pose;
      poseStart.current = -1; // picked up on the next frame
      spin.current = 0;
    }
  }, [pose]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    if (poseStart.current < 0) poseStart.current = t;
    const local = t - poseStart.current;

    const g = group.current;
    const h = head.current;
    const la = leftArm.current;
    const ra = rightArm.current;
    if (!g || !h || !la || !ra) return;

    /* ---------------------------------------------------------- blinking */
    if (pose === 'sleep') {
      // Half-closed lids rather than a blink cycle.
      if (leftEye.current) leftEye.current.scale.y = damp(leftEye.current.scale.y, 0.18, 8, dt);
      if (rightEye.current) rightEye.current.scale.y = damp(rightEye.current.scale.y, 0.18, 8, dt);
    } else {
      if (t > nextBlink.current && blinkUntil.current < 0) blinkUntil.current = t + 0.15;
      const blinking = blinkUntil.current > 0 && t < blinkUntil.current;
      if (blinkUntil.current > 0 && t >= blinkUntil.current) {
        blinkUntil.current = -1;
        nextBlink.current = t + 3 + Math.random() * 2;
      }
      const target = blinking ? 0.08 : 1;
      if (leftEye.current) leftEye.current.scale.y = damp(leftEye.current.scale.y, target, 22, dt);
      if (rightEye.current) rightEye.current.scale.y = damp(rightEye.current.scale.y, target, 22, dt);
    }

    /* --------------------------------------------------- antenna pulse */
    if (antenna.current) {
      antenna.current.emissiveIntensity = 0.6 + Math.sin(t * 2.4) * 0.35;
    }

    /* --------------------------------------------------------- posing */
    const bobSpeed = pose === 'sleep' ? 0.7 : 1.6;
    const bobAmount = pose === 'sleep' ? 0.02 : 0.05;
    let targetY = Math.sin(t * bobSpeed) * bobAmount;
    let headTiltX = 0;
    let headTiltY = 0;
    let leftArmZ = 0.15;
    let rightArmZ = -0.15;
    let groupRotY = 0;

    switch (pose) {
      case 'wave': {
        // Raise the right arm and oscillate for ~1.8s, then relax.
        const active = local < 1.8;
        rightArmZ = active ? -2.35 + Math.sin(local * 9) * 0.42 : -0.15;
        headTiltY = active ? 0.12 : 0;
        break;
      }
      case 'point-left': {
        leftArmZ = 1.9;
        headTiltY = 0.26;
        break;
      }
      case 'point-right': {
        rightArmZ = -1.9;
        headTiltY = -0.26;
        break;
      }
      case 'celebrate': {
        // Two hops plus a full turn, then settle.
        const hop = local < 1.1 ? Math.abs(Math.sin(local * 5.6)) * 0.34 : 0;
        targetY += hop;
        spin.current = local < 1.2 ? THREE.MathUtils.lerp(spin.current, Math.PI * 2, dt * 4.5) : spin.current;
        groupRotY = spin.current;
        leftArmZ = local < 1.2 ? 2.1 : 0.15;
        rightArmZ = local < 1.2 ? -2.1 : -0.15;
        break;
      }
      case 'sleep': {
        headTiltX = 0.42;
        break;
      }
      default: {
        // idle — a slow head tilt of about ±4°.
        headTiltX = Math.sin(t * 0.9) * 0.07;
        headTiltY = Math.sin(t * 0.6) * 0.07;
      }
    }

    g.position.y = damp(g.position.y, targetY, 6, dt);
    g.rotation.y = damp(g.rotation.y, groupRotY, 6, dt);
    h.rotation.x = damp(h.rotation.x, headTiltX, 6, dt);
    h.rotation.y = damp(h.rotation.y, headTiltY, 6, dt);
    la.rotation.z = damp(la.rotation.z, leftArmZ, 9, dt);
    ra.rotation.z = damp(ra.rotation.z, rightArmZ, 9, dt);
  });

  return (
    <group ref={group} position={[0, -0.15, 0]}>
      {/* ------------------------------------------------------------ head */}
      <group ref={head} position={[0, 0.95, 0]}>
        <RoundedBox args={[1.5, 1.2, 1.05]} radius={0.26} smoothness={4}>
          <meshStandardMaterial color={NAVY} roughness={0.42} metalness={0.16} />
        </RoundedBox>

        {/* inset screen */}
        <RoundedBox args={[1.12, 0.78, 0.06]} radius={0.16} smoothness={4} position={[0, 0.02, 0.53]}>
          <meshStandardMaterial color={SCREEN} roughness={0.28} metalness={0.05} />
        </RoundedBox>

        {/* eyes — emissive so they read even in the dimmest corner of the card */}
        <mesh ref={leftEye} position={[-0.26, 0.06, 0.58]}>
          <capsuleGeometry args={[0.075, 0.14, 4, 12]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#CFE4FF" emissiveIntensity={0.85} />
        </mesh>
        <mesh ref={rightEye} position={[0.26, 0.06, 0.58]}>
          <capsuleGeometry args={[0.075, 0.14, 4, 12]} />
          <meshStandardMaterial color="#FFFFFF" emissive="#CFE4FF" emissiveIntensity={0.85} />
        </mesh>

        {/* ears */}
        <mesh position={[-0.79, 0, 0]}>
          <capsuleGeometry args={[0.09, 0.26, 4, 10]} />
          <meshStandardMaterial color={NAVY_DARK} roughness={0.5} />
        </mesh>
        <mesh position={[0.79, 0, 0]}>
          <capsuleGeometry args={[0.09, 0.26, 4, 10]} />
          <meshStandardMaterial color={NAVY_DARK} roughness={0.5} />
        </mesh>

        {/* antenna */}
        <mesh position={[0, 0.78, 0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.36, 10]} />
          <meshStandardMaterial color={NAVY_DARK} />
        </mesh>
        <mesh position={[0, 1.0, 0]}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial ref={antenna} color={GREEN} emissive={GREEN} emissiveIntensity={0.8} />
        </mesh>
      </group>

      {/* ----------------------------------------------------------- torso */}
      <mesh position={[0, -0.1, 0]}>
        <capsuleGeometry args={[0.5, 0.62, 6, 18]} />
        <meshStandardMaterial color={NAVY} roughness={0.45} metalness={0.14} />
      </mesh>

      {/* saffron chest ring */}
      <mesh position={[0, -0.02, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.055, 12, 32]} />
        <meshStandardMaterial color={SAFFRON} roughness={0.35} metalness={0.25} />
      </mesh>

      {/* buttons */}
      <mesh position={[0, -0.34, 0.47]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color={SAFFRON} emissive={SAFFRON} emissiveIntensity={0.25} />
      </mesh>

      {/* ------------------------------------------------------------ arms */}
      <group ref={leftArm} position={[-0.56, 0.12, 0]}>
        <mesh position={[-0.1, -0.3, 0]}>
          <capsuleGeometry args={[0.1, 0.42, 4, 12]} />
          <meshStandardMaterial color={NAVY_DARK} roughness={0.5} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.56, 0.12, 0]}>
        <mesh position={[0.1, -0.3, 0]}>
          <capsuleGeometry args={[0.1, 0.42, 4, 12]} />
          <meshStandardMaterial color={NAVY_DARK} roughness={0.5} />
        </mesh>
      </group>

      {/* base — keeps him floating rather than legless */}
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.34, 0.42, 0.13, 20]} />
        <meshStandardMaterial color={NAVY_DARK} roughness={0.6} />
      </mesh>
    </group>
  );
}

export interface SaarthiMascotProps {
  pose?: SaarthiPose;
  /** `lg` = welcome modal (~180px), `sm` = tour card corner (~90px). */
  size?: 'sm' | 'lg';
  className?: string;
}

const PX: Record<'sm' | 'lg', number> = { sm: 90, lg: 180 };

export default function SaarthiMascot({ pose = 'idle', size = 'sm', className }: SaarthiMascotProps) {
  const reduced = useReducedMotion();
  const [webglFailed, setWebglFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const px = PX[size];

  /**
   * Stop rendering when the tab is hidden.
   *
   * `frameloop="never"` unmounts the rAF loop entirely, so a mascot sitting in a
   * background tab costs nothing. Without this the canvas keeps animating
   * forever behind whatever the user switched to.
   */
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (reduced || webglFailed) {
    return <SaarthiFace size={px} className={className} />;
  }

  return (
    <div className={className} style={{ width: px, height: px }} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0.15, 4], fov: 42 }}
        frameloop={visible ? 'always' : 'never'}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => gl.setClearAlpha(0)}
        // A device with no WebGL should get the SVG, not a black box.
        fallback={<SaarthiFace size={px} />}
        onError={() => setWebglFailed(true)}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 5]} intensity={1.15} />
        {/* faint saffron rim so the navy body separates from a white card */}
        <pointLight position={[-3, 1, 2]} intensity={22} distance={10} color={SAFFRON} />
        <Suspense fallback={null}>
          <Robot pose={pose} />
        </Suspense>
      </Canvas>
    </div>
  );
}
