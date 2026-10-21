import { useId } from 'react';
import MoodBloom, { type BloomShape } from './MoodBloom';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M22.1 4.9Q24 4 25.9 4.9Q27.9 5.7 29.2 7.5Q30.5 9.3 31.6 10.7Q32.7 12 34.3 12.6Q36 13.2 38.1 13.9Q40.2 14.7 41.6 16.2Q43 17.8 42.8 19.9Q42.6 22 41.3 23.9Q40 25.7 39 27.1Q38.1 28.6 38 30.3Q37.9 32 37.9 34.3Q37.9 36.5 36.8 38.3Q35.8 40.2 33.7 40.6Q31.6 41.1 29.5 40.4Q27.3 39.7 25.7 39.3Q24 38.8 22.3 39.3Q20.7 39.7 18.5 40.4Q16.4 41.1 14.3 40.6Q12.2 40.2 11.2 38.3Q10.1 36.5 10.1 34.3Q10.1 32.1 10 30.3Q9.9 28.6 9 27.1Q8 25.7 6.7 23.9Q5.4 22 5.2 19.9Q5 17.8 6.4 16.2Q7.8 14.7 9.9 13.9Q12 13.2 13.7 12.6Q15.3 12 16.4 10.7Q17.5 9.3 18.8 7.5Q20.1 5.7 22.1 4.9Z" fill="#a3c1e4" fillOpacity=".09" stroke="currentColor" strokeWidth="1.7" />
      <path d="M22.7 11.4Q24 11 25.2 11.7Q26.5 12.4 27.3 13.5Q28.2 14.7 28.9 15.4Q29.7 16.2 30.8 16.5Q32 16.8 33.4 17.3Q34.7 17.8 35.5 18.9Q36.3 20 36.1 21.4Q35.8 22.8 35 23.9Q34.2 25.1 33.7 26Q33.2 27 33.2 28.2Q33.3 29.4 33.3 30.8Q33.2 32.3 32.4 33.4Q31.6 34.5 30.2 34.7Q28.8 34.9 27.5 34.4Q26.1 34 25.1 33.8Q24 33.6 22.9 34.1Q21.8 34.5 20.4 34.9Q19 35.3 17.7 34.9Q16.4 34.5 15.8 33.2Q15.2 31.9 15.2 30.5Q15.2 29.1 15 28Q14.8 27 14.1 26.1Q13.3 25.1 12.5 23.9Q11.7 22.7 11.7 21.3Q11.7 20 12.7 19Q13.7 18.1 15.1 17.6Q16.4 17.2 17.4 16.7Q18.3 16.2 19 15.2Q19.6 14.2 20.5 13Q21.4 11.9 22.7 11.4Z" stroke="#9dbfce" strokeOpacity=".72" strokeWidth="1.1" />
      <path d="M18.5 20.5v2.6a5.5 5.5 0 0 0 11 0v-2.6M24 18v15M20.5 33h7" stroke="#dee9f6" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoodNavIcon({ className = '' }: { className?: string }) {
  return <svg className={className} width="25" height="25" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M24 4C29 4 29 12 34 14S44 17 44 22S38 29 39 34S38 43 33 43S27 39 24 39S15 44 11 41S10 33 9 30S4 25 4 21S11 15 15 14S19 4 24 4Z" fill="#aac6e624" stroke="currentColor" strokeWidth="2" />
    <path d="M24 12C27 12 28 18 31 19S37 20 37 24S32 28 32 31S28 37 24 35S17 37 15 32S16 28 12 24S16 19 19 18S21 12 24 12Z" stroke="currentColor" strokeOpacity=".7" strokeWidth="1.4" />
    <circle cx="24" cy="24" r="2.2" fill="currentColor" />
  </svg>;
}

export function GlassStar({ value = 7, className = '', ambient = false, shape = 'mood', hue }: { value?: number; className?: string; ambient?: boolean; shape?: BloomShape; hue?: number }) {
  return <MoodBloom value={value} shape={shape} hue={hue ?? (ambient ? 145 : undefined)} className={`glass-star ${ambient ? 'glass-star-ambient' : ''} ${className}`} />;
}

export function GlassOrb({ className = '', value = 5, shape = 'wave', hue }: { className?: string; value?: number; shape?: BloomShape; hue?: number }) {
  return <MoodBloom value={value} shape={shape} hue={hue} className={className} compact />;
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const id = useId().replace(/:/g, '');
  const points = values.map((value, index) => ({ x: values.length === 1 ? 56 : index * (110 / (values.length - 1)), y: 36 - value * 3 }));
  if (!points.length) return null;
  const path = smoothPath(points);
  return (
    <svg className="sparkline" viewBox="0 0 112 42" fill="none" aria-hidden="true">
      <defs><linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".12" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {points.length > 1 && <path d={`${path} L110 42 L0 42Z`} fill={`url(#spark-${id})`} />}
      <path d={path} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.4" fill={color} />
    </svg>
  );
}

export function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const before = points[Math.max(0, i - 2)];
    const from = points[i - 1];
    const to = points[i];
    const after = points[Math.min(points.length - 1, i + 1)];
    path += ` C${from.x + (to.x - before.x) * .17},${from.y + (to.y - before.y) * .17} ${to.x - (after.x - from.x) * .17},${to.y - (after.y - from.y) * .17} ${to.x},${to.y}`;
  }
  return path;
}
