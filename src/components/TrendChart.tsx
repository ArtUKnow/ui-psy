import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { dateKey, metricInfo, type Entry, type Metric } from '../lib/data';
import { GlassStar, smoothPath } from './Visuals';

const metrics: Metric[] = ['mood', 'anxiety', 'energy'];
export default function TrendChart({ entries, onlyMetric, onRecord }: { entries: Entry[]; onlyMetric?: Metric; onRecord?: () => void }) {
  const [days, setDays] = useState(7);
  const [hidden, setHidden] = useState<Metric[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');
  const data = useMemo(() => Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const items = entries.filter(entry => dateKey(entry.createdAt) === dateKey(date));
    const values = Object.fromEntries(metrics.map(metric => [metric, items.length ? items.reduce((sum, entry) => sum + entry[metric], 0) / items.length : null])) as Record<Metric, number | null>;
    return { date, values };
  }), [days, entries]);

  const x = (index: number) => 28 + index * 572 / (days - 1);
  const y = (value: number) => 145 - value * 12;
  const visible = metrics.filter(metric => !hidden.includes(metric) && (!onlyMetric || onlyMetric === metric));
  const selected = hovered === null ? null : data[hovered];

  if (entries.length === 0) return <section className={`trend-section ${onlyMetric ? 'trend-detail' : ''}`} aria-label="Динамика состояния"><div className="section-heading chart-heading"><h2>Динамика состояния</h2></div><div className="chart-empty"><GlassStar value={5} shape="wave" hue={195} /><div><strong>График начнётся с первой записи</strong><p>После отметки здесь появятся изменения настроения, тревоги и энергии.</p>{onRecord && <button className="secondary-button" onClick={onRecord}>Отметить состояние</button>}</div></div></section>;

  return (
    <section className={`trend-section ${onlyMetric ? 'trend-detail' : ''}`} aria-label="Динамика состояния">
      <div className="section-heading chart-heading">
        <h2>{onlyMetric ? 'Динамика показателя' : 'Динамика состояния'}</h2>
        <div className="segmented-control" role="group" aria-label="Период графика">
          {[7, 30].map(value => <button key={value} className={days === value ? 'selected' : ''} aria-pressed={days === value} onClick={() => { setDays(value); setHovered(null); }}>{value} дней</button>)}
        </div>
      </div>
      <div className="chart-legend">
        {(onlyMetric ? [onlyMetric] : metrics).map(metric => <button key={metric} className={hidden.includes(metric) ? 'muted-legend' : ''} onClick={() => setHidden(current => current.includes(metric) ? current.filter(item => item !== metric) : [...current, metric])} aria-pressed={!hidden.includes(metric)}><i style={{ background: metricInfo[metric].color }} />{metricInfo[metric].label}</button>)}
      </div>
      <div className="chart-wrap">
        <svg viewBox="0 0 622 176" preserveAspectRatio="none" role="img" tabIndex={0} aria-label={`График ${onlyMetric ? metricInfo[onlyMetric].label.toLocaleLowerCase() : 'настроения, тревоги и энергии'} за ${days} дней. Используй стрелки влево и вправо для просмотра дней.`} onKeyDown={event => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            setHovered(current => Math.max(0, Math.min(days - 1, (current ?? days - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
          }
        }} onBlur={() => setHovered(null)} onPointerMove={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          const viewX = (event.clientX - rect.left) / rect.width * 622;
          setHovered(Math.max(0, Math.min(days - 1, Math.round((viewX - 28) / 572 * (days - 1)))));
        }} onPointerLeave={() => setHovered(null)}>
          <defs><linearGradient id={`chart-fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8dd95" stopOpacity=".13" /><stop offset="1" stopColor="#c8dd95" stopOpacity="0" /></linearGradient></defs>
          {[0, 5, 10].map(value => <g key={value}><text x="0" y={y(value) + 3} className="chart-axis">{value}</text><line x1="28" x2="602" y1={y(value)} y2={y(value)} stroke="rgba(210,220,197,.085)" strokeDasharray="3 5" /></g>)}
          {visible.map(metric => {
            // Keep gaps between days without entries instead of inventing measurements.
            const segments: { x: number; y: number }[][] = [[]];
            data.forEach((point, index) => {
              const value = point.values[metric];
              if (value === null) { if (segments[segments.length - 1].length) segments.push([]); }
              else segments[segments.length - 1].push({ x: x(index), y: y(value) });
            });
            return <g key={`${metric}-${days}`}>
              {segments.filter(segment => segment.length).map((points, index) => <g key={index}>
                {metric === 'mood' && points.length > 1 && <path d={`${smoothPath(points)} L${points[points.length - 1].x} 145 L${points[0].x} 145Z`} fill={`url(#chart-fill-${id})`} />}
                <motion.path d={smoothPath(points)} fill="none" stroke={metricInfo[metric].color} strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 1.2, ease: 'easeInOut' }} />
              </g>)}
              {data.map((point, index) => point.values[metric] !== null && <circle key={index} cx={x(index)} cy={y(point.values[metric]!)} r={hovered === index ? 4 : 2.6} fill={metricInfo[metric].color} stroke="#151811" strokeWidth="1.5" />)}
            </g>;
          })}
          {hovered !== null && <line x1={x(hovered)} x2={x(hovered)} y1="17" y2="146" stroke="rgba(225,234,210,.25)" strokeDasharray="3 4" />}
          {data.map((point, index) => (days === 7 || index % 5 === 0 || index === days - 1) && <text key={index} x={x(index)} y="171" textAnchor="middle" className={`chart-axis ${index === days - 1 ? 'chart-today' : ''}`}>{point.date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</text>)}
        </svg>
        {selected && <div className="chart-tooltip" style={{ left: `${Math.max(13, Math.min(86, (hovered! / (days - 1)) * 100))}%` }}>
          <strong>{selected.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</strong>
          {visible.map(metric => <span key={metric}><i style={{ background: metricInfo[metric].color }} />{metricInfo[metric].label}<b>{selected.values[metric]?.toFixed(1) ?? 'Нет записи'}</b></span>)}
        </div>}
      </div>
      <p className="chart-caption">Показаны только дни с записями.</p>
    </section>
  );
}
