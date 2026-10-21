import { ArrowUpRight, ChevronRight, Cloud, Smile, Waves, Zap } from './icons';
import { dateKey, friendlyDate, metricInfo, moodLabel, type Entry, type Metric, type Page, type TestResult } from '../lib/data';
import { dailyPoints, type PlotPoint } from './ClinicalCharts';
import { GlassStar } from './Visuals';

const colors = { mood: '#c9baff', anxiety: '#95ded9', energy: '#8dcaff' };
const icons = { mood: Smile, anxiety: Cloud, energy: Zap };

function OverviewPlot({ points, color, compact = false }: { points: PlotPoint[]; color: string; compact?: boolean }) {
  const width = compact ? 150 : 420;
  const height = compact ? 45 : 110;
  const x = (index: number) => 8 + index * (width - 16) / 6;
  const y = (value: number) => 8 + (10 - value) / 10 * (height - 20);
  const segments: number[][] = [[]];
  points.forEach((point, index) => {
    if (point.value === null) { if (segments.at(-1)!.length) segments.push([]); }
    else segments.at(-1)!.push(index);
  });
  const measured = points.filter(p => p.value !== null);
  return <svg className={compact ? 'overview-spark' : 'overview-chart'} viewBox={`0 0 ${width} ${height + (compact ? 0 : 22)}`} aria-hidden="true">
    {!compact && [2, 5, 8].map(value => <line key={value} x1="8" x2={width - 8} y1={y(value)} y2={y(value)} stroke="currentColor" strokeOpacity=".12" strokeDasharray="2 5" />)}
    {segments.filter(segment => segment.length > 1).map((segment, index) => <path key={index} d={segment.map((point, i) => `${i ? 'L' : 'M'}${x(point)} ${y(points[point].value!)}`).join(' ')} fill="none" stroke={color} strokeWidth={compact ? 1.8 : 2.2} strokeLinecap="round" strokeLinejoin="round" />)}
    {points.map((point, index) => point.value !== null && <circle key={point.date} cx={x(index)} cy={y(point.value)} r={compact ? 2.5 : 4} fill={color} stroke="#d9ecff" strokeOpacity=".5" strokeWidth=".7" />)}
    {!compact && points.map((point, index) => <text key={point.date} x={x(index)} y={height + 14} textAnchor={index === 0 ? 'start' : index === 6 ? 'end' : 'middle'}>{new Date(`${point.date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' })}</text>)}
    {!compact && !measured.length && <text className="overview-chart-empty" x={width / 2} y={height / 2} textAnchor="middle">Начни с первой отметки</text>}
  </svg>;
}

export default function HomeOverview({ name, entries, onRecord, onMetric, results, onNavigate }: { name: string; entries: Entry[]; results: TestResult[]; onRecord: () => void; onMetric: (metric: Metric) => void; onNavigate: (page: Page) => void }) {
  const latest = [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const series = { mood: dailyPoints(entries, 'mood', 7), anxiety: dailyPoints(entries, 'anxiety', 7), energy: dailyPoints(entries, 'energy', 7) };
  const measured = series.mood.filter(point => point.value !== null);
  const average = measured.length ? measured.reduce((sum, point) => sum + point.value!, 0) / measured.length : null;
  const latestTests = ['phq9', 'gad7'].map(id => [...results].filter(r => r.testId === id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]).filter(Boolean);
  const today = latest && dateKey(latest.createdAt) === dateKey(new Date());
  return <div className="home-overview concept-home">
    <header className="page-greeting"><h1>Привет, {name}</h1></header>
    <section className="overview-hero" aria-label="Отметить настроение">
      <svg className="overview-contours" viewBox="0 0 700 300" preserveAspectRatio="none" aria-hidden="true">{Array.from({ length: 14 }, (_, index) => <path key={index} d={`M${100 + index * 8} -30 C ${330 + index * 6} ${20 + index * 12}, ${280 + index * 9} ${250 - index * 8}, 730 ${70 + index * 18}`} />)}</svg>
      <div className="overview-hero-copy"><h2>Как ты сегодня?</h2><p className="overview-feeling"><span aria-hidden="true"><Waves size={22} /></span>{latest ? latest.feelings[0] || moodLabel(latest.mood) : 'Твой момент'}</p><p className="overview-record-date">{latest ? `Последняя отметка · ${friendlyDate(latest.createdAt).toLocaleLowerCase()}` : 'Минутка внимания к своему состоянию'}</p><button className="primary-button" onClick={onRecord}>Отметить настроение<ChevronRight size={19} /></button></div>
      <div className="overview-star" aria-hidden="true"><GlassStar value={latest?.mood ?? 6} shape="petal" hue={145} ambient /></div>
    </section>
    <section className="overview-metrics" aria-label="Основные показатели"><span className="sr-only">{latest ? `Последняя запись: ${friendlyDate(latest.createdAt)}` : 'Пока нет записей'}</span>{(['mood', 'anxiety', 'energy'] as Metric[]).map(metric => {
      const Icon = icons[metric];
      return <button key={metric} className={`overview-metric overview-metric-${metric}`} onClick={() => onMetric(metric)} aria-label={latest ? `${metricInfo[metric].label}: ${latest[metric]} из 10. Подробнее` : `${metricInfo[metric].label}: пока нет записи. Подробнее`}>
        <span className="overview-metric-name"><Icon size={21} />{metricInfo[metric].label}</span><span className="overview-metric-value">{latest?.[metric] ?? '—'}{latest && <small>/10</small>}</span>
        {series[metric].some(point => point.value !== null) ? <OverviewPlot points={series[metric]} color={colors[metric]} compact /> : <span className="overview-metric-empty">Нет отметок</span>}
      </button>;
    })}</section>
    {latest && !today && <p className="overview-stale">Показатели из записи {friendlyDate(latest.createdAt).toLocaleLowerCase()}. Сегодня можно сделать новую отметку.</p>}
    <nav className="overview-destinations" aria-label="Быстрые переходы">
      <button className="overview-week-card" aria-label="Динамика" onClick={() => onNavigate('statistics')}>
        <span className="overview-card-heading"><strong>Твоя неделя</strong><span>Вся динамика<ChevronRight size={17} /></span></span>
        <span className="overview-week-caption">{measured.length ? `Дней с отметками: ${measured.length} из 7` : 'Здесь появится твой ритм недели'}{average !== null && <span>В среднем {average.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}/10</span>}</span>
        <OverviewPlot points={series.mood} color="#a5ceff" />
        <span className="sr-only">Настроение по дням: {series.mood.map(point => `${point.date}: ${point.value === null ? 'нет записи' : point.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`).join('; ')}</span>
      </button>
      <button className="overview-art-card overview-plan" aria-label="Мой план" onClick={() => onNavigate('care')}><span><strong>Мой план</strong><small>Назначения и приём</small></span><ArrowUpRight className="overview-card-arrow" size={18} /><img src="/illustrations/my-plan.webp" alt="" width="1254" height="1254" /></button>
      <button className="overview-art-card overview-pause" aria-label="Практики" onClick={() => onNavigate('practices')}><span><strong>Время для себя</strong><small>Дыхание и тихая пауза</small></span><ArrowUpRight className="overview-card-arrow" size={18} /><img src="/illustrations/time-for-self.webp" alt="" width="1254" height="1254" /></button>
    </nav>
    {latestTests.length > 0 && <a className="overview-results" href="/app?section=tests&view=results"><span>Последние результаты</span><strong>{latestTests.map(r => `${r.testId === 'phq9' ? 'Настроение' : 'Тревога'}: ${r.score}/${r.maxScore}`).join(' · ')}</strong><ChevronRight size={18} /></a>}
  </div>;
}
