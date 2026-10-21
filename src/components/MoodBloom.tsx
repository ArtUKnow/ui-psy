import { useId, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const LAYERS = 11;

export type BloomShape = 'mood' | 'petal' | 'wave' | 'sun';

function petalPath(radius: number, phase: number, value: number, shape: BloomShape) {
  const warmth = (value - 1) / 9;
  const points = Array.from({ length: 60 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 60;
    const moodRipple = 0.855
      + 0.145 * (1 - warmth) * Math.cos(12 * (angle + Math.PI / 2) + phase)
      + 0.145 * warmth * Math.cos(5 * (angle + Math.PI / 2) + phase)
      + 0.012 * Math.sin(10 * angle - phase);
    const ripple = shape === 'petal' ? .79 + .21 * Math.cos(5 * (angle + Math.PI / 2) + phase)
      : shape === 'wave' ? .86 + .11 * Math.cos(7 * angle + phase) + .035 * Math.sin(3 * angle - phase)
      : shape === 'sun' ? .82 + .16 * Math.cos(9 * angle + phase) + .025 * Math.cos(18 * angle)
      : moodRipple;
    return {
      x: 150 + Math.cos(angle) * radius * ripple,
      y: 150 + Math.sin(angle) * radius * ripple,
    };
  });
  const midpoint = (a: typeof points[number], b: typeof points[number]) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = midpoint(points[points.length - 1], points[0]);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${points.map((point, index) => {
    const end = midpoint(point, points[(index + 1) % points.length]);
    return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }).join(' ')} Z`;
}

const hues = [145, 170, 190, 155, 115, 75, 45, 20, -5, -30];

export default function MoodBloom({ value, className = 'checkin-mood-star', compact = false, shape = 'mood', hue }: { value: number; className?: string; compact?: boolean; shape?: BloomShape; hue?: number }) {
  const id = useId().replace(/:/g, '');
  const visibleLayers = value + 1;
  const petals = useMemo(() => Array.from({ length: compact ? visibleLayers : LAYERS }, (_, index) =>
    petalPath(39 + index * 10.1, index * 0.025, value, shape)), [compact, value, visibleLayers, shape]);
  const reducedMotion = useReducedMotion() || document.documentElement.dataset.motion === 'off';

  return (
    <div className={`mood-bloom ${className}`} data-value={value} data-layers={visibleLayers} aria-hidden="true">
      <div className="mood-bloom-halo" />
      <svg viewBox="0 0 300 300" className="mood-bloom-art" style={{ '--bloom-hue': `${hue ?? hues[value - 1]}deg` } as React.CSSProperties}>
        <defs>
          <radialGradient id={`bloom-fill-${id}`} cx="49%" cy="43%" r="62%">
            <stop stopColor="#f7ffd5" stopOpacity=".42" />
            <stop offset=".45" stopColor="#dcf585" stopOpacity=".18" />
            <stop offset="1" stopColor="#adbf55" stopOpacity=".025" />
          </radialGradient>
          <linearGradient id={`bloom-edge-${id}`} x1="15%" y1="0%" x2="85%" y2="100%">
            <stop stopColor="#f7ffcb" stopOpacity=".4" />
            <stop offset=".35" stopColor="#efffa2" stopOpacity=".9" />
            <stop offset=".68" stopColor="#d5ec78" stopOpacity=".62" />
            <stop offset="1" stopColor="#f5ffd0" stopOpacity=".36" />
          </linearGradient>
          <radialGradient id={`bloom-core-${id}`}>
            <stop stopColor="#f8ffbe" stopOpacity=".95" />
            <stop offset=".5" stopColor="#e6fa83" stopOpacity=".56" />
            <stop offset="1" stopColor="#d5ed6b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <AnimatePresence initial={false}>
          <motion.g key={value} initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .32 }}>
            {petals.map((path, index) => (
              <path
                key={index}
                className={`mood-bloom-layer ${index < visibleLayers ? 'is-visible' : ''}`}
                d={path}
                fill={`url(#bloom-fill-${id})`}
                stroke={`url(#bloom-edge-${id})`}
                strokeWidth={index < 3 ? 1.6 : 1.1}
              />
            ))}
            <circle cx="150" cy="150" r="54" fill={`url(#bloom-core-${id})`} className="mood-bloom-core" />
            <path d="M150 139 C152 146 154 148 161 150 C154 152 152 154 150 161 C148 154 146 152 139 150 C146 148 148 146 150 139Z" fill="#faffdd" opacity=".8" />
          </motion.g>
        </AnimatePresence>
      </svg>
    </div>
  );
}
