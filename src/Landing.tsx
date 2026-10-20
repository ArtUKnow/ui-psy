import { useId, useMemo, useState } from 'react';
import './styles/landing.css';

const faq = [
  ['Как проходит отметка состояния?', 'Передвинь шкалы настроения, тревоги и энергии, а если захочешь, добавь запись в дневник: всё займёт меньше минуты.'],
  ['Приложение ставит диагноз?', 'Нет: UI-PSY помогает замечать, как меняется состояние, но не ставит диагноз, не назначает лечение и не заменяет консультацию специалиста.'],
  ['Кто видит мои записи?', 'По умолчанию записи видишь только ты, а если решишь открыть доступ специалисту, его можно будет отозвать в любой момент.'],
  ['Для чего нужны опросники?', 'Опросники помогают описать самочувствие, а результат сохраняется в приложении, чтобы ты мог к нему вернуться; он не является диагнозом.'],
  ['Что помогает сделать паузу?', 'Дыхательная практика задаёт мягкий ритм, а лава-лампа помогает переключить внимание, когда хочется ненадолго отвлечься.'],
];

function starPath(anxiety: number, energy: number, layer: number) {
  const points = Array.from({ length: 101 }, (_, index) => {
    const angle = index / 100 * Math.PI * 2 - Math.PI / 2;
    const base = 64 - layer * 5.8 + energy * 1.5;
    const ripple = 0.13 + anxiety * 0.023;
    const radius = base * (1 + ripple * Math.cos(5 * angle) + 0.016 * Math.cos(10 * angle));
    return `${(100 + Math.cos(angle) * radius).toFixed(1)} ${(100 + Math.sin(angle) * radius).toFixed(1)}`;
  });
  return `M ${points.join(' L ')} Z`;
}

function DrawnStar({ mood = 4, anxiety = 2, energy = 4, className = '' }: { mood?: number; anxiety?: number; energy?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const tone = mood > 3 ? '#bdebdc' : mood < 3 ? '#c7c9ed' : '#bfe0ef';
  const rings = useMemo(() => Array.from({ length: 8 }, (_, index) => starPath(anxiety, energy, index)), [anxiety, energy]);
  return <svg viewBox="0 0 200 200" className={`lp-drawn-star ${className}`} aria-hidden="true">
    <defs>
      <radialGradient id={`lp-glow-${id}`}><stop stopColor={tone} stopOpacity=".68" /><stop offset=".52" stopColor={tone} stopOpacity=".2" /><stop offset="1" stopColor={tone} stopOpacity="0" /></radialGradient>
      <radialGradient id={`lp-fill-${id}`} cx="42%" cy="36%"><stop stopColor="#f8ffff" /><stop offset=".48" stopColor={tone} /><stop offset="1" stopColor="#6f9fbf" /></radialGradient>
    </defs>
    <circle cx="100" cy="100" r="96" fill={`url(#lp-glow-${id})`} />
    {rings.map((path, index) => <path key={index} d={path} fill={index === 7 ? `url(#lp-fill-${id})` : tone} fillOpacity={index === 7 ? .92 : .035 + index * .011} stroke={tone} strokeOpacity={.17 + index * .064} strokeWidth={index === 7 ? 1.6 : 1.15} />)}
    <path d="M100 89 Q102 98 111 100 Q102 102 100 111 Q98 102 89 100 Q98 98 100 89Z" fill="#fff" fillOpacity=".88" />
  </svg>;
}

function SmallStar({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 32 32" className={className} aria-hidden="true"><path d="M16 1.5c1.4 7.1 3.4 10.7 14.5 14.5C19.4 19.8 17.4 23.4 16 30.5 14.6 23.4 12.6 19.8 1.5 16 12.6 12.2 14.6 8.6 16 1.5Z" fill="currentColor" /></svg>;
}

function Sky({ className = '' }: { className?: string }) {
  const dots = [[8, 23], [19, 51], [26, 15], [34, 37], [44, 17], [52, 55], [59, 27], [70, 47], [78, 12], [89, 32], [95, 72], [13, 78], [42, 82], [68, 83]];
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden="true">
    <path d="M8 23 26 15 34 37 59 27 78 12M19 51 34 37 52 55 70 47 89 32M42 82 52 55 68 83 95 72" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth=".18" />
    {dots.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index % 4 === 0 ? .52 : .29} fill="currentColor" opacity={index % 3 === 0 ? .8 : .45} />)}
  </svg>;
}

function PhoneShot({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return <div className={`lp-phone ${className}`}><img src={`/landing/screens/${src}.webp`} alt={alt} loading="eager" /></div>;
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="lp-scale"><span><b>{label}</b><small>{value}/5</small></span><input aria-label={label} type="range" min="1" max="5" value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

export default function Landing() {
  const [mood, setMood] = useState(4);
  const [anxiety, setAnxiety] = useState(2);
  const [energy, setEnergy] = useState(4);
  return <div className="landing">
    <div className="lp-night">
      <Sky className="lp-sky" />
      <header className="lp-header lp-wrap">
        <a href="#hero" className="lp-brand" aria-label="UI-PSY, наверх"><SmallStar />UI-PSY</a>
        <nav aria-label="Разделы лендинга"><a href="#features">Возможности</a><a href="#constellation">Твоя звезда</a><a href="#doctor">Для врача</a><a href="#faq">Вопросы</a></nav>
        <a className="lp-header-action" href="/app">Открыть приложение<span aria-hidden="true">↗</span></a>
      </header>
      <main>
        <section id="hero" className="lp-hero lp-wrap">
          <div className="lp-hero-copy">
            
            <h1><span>Побудь</span> <span>ближе <em>к себе</em></span></h1>
            <p className="lp-lead">Отмечай, как ты себя чувствуешь, и наблюдай за переменами, а если нужна поддержка, выбирай её в своём ритме.</p>
            <div className="lp-actions"><a className="lp-button lp-button-light" href="/app">Начать с себя<span aria-hidden="true">↗</span></a><a className="lp-text-link" href="#features">Посмотреть возможности<span aria-hidden="true">↓</span></a></div>
            <div className="lp-hero-demo">
              <DrawnStar mood={mood} anxiety={anxiety} energy={energy} className="lp-demo-star" />
              <div className="lp-demo-controls"><p>У каждой отметки своя форма</p><div className="lp-scale-row"><Scale label="Настроение" value={mood} onChange={setMood} /><Scale label="Тревога" value={anxiety} onChange={setAnxiety} /><Scale label="Энергия" value={energy} onChange={setEnergy} /></div></div>
            </div>
          </div>
          <div className="lp-hero-visual">
            <DrawnStar mood={4} anxiety={2} energy={5} className="lp-hero-star" />
            <PhoneShot src="checkin" alt="Экран отметки состояния в UI-PSY" className="lp-hero-phone" />
            
          </div>
        </section>
      </main>
    </div>

    <div className="lp-proof"><div className="lp-wrap"><span>Всё начинается с одного момента</span><ul><li>Отметка за минуту</li><li>Личный дневник</li><li>Опросники</li><li>Связь с врачом по согласию</li></ul></div></div>

    <section id="features" className="lp-story lp-section lp-wrap">
      <div className="lp-story-copy"><h2>Чтобы увидеть перемены, <em>заметь сегодняшний день</em></h2><p>Если отмечать настроение, тревогу и энергию, постепенно становится видно, как меняется состояние: дневник хранит твои слова, а график показывает только дни с отметками.</p><div className="lp-story-points"><span><SmallStar />Без оценок и гонки</span><span><SmallStar />Записи под твоим контролем</span></div></div>
      <div className="lp-story-visual"><div className="lp-story-wash" /><PhoneShot src="home" alt="Главная страница UI-PSY с отметкой состояния" className="lp-home-phone" /><PhoneShot src="diary" alt="Дневник чувств в UI-PSY" className="lp-diary-phone" /></div>
    </section>

    <section id="constellation" className="lp-constellation lp-section"><div className="lp-wrap lp-constellation-layout"><div className="lp-constellation-art"><Sky className="lp-constellation-sky" /><DrawnStar mood={5} anxiety={1} energy={5} className="lp-constellation-star" /></div><div className="lp-constellation-copy"><h2>Одно чувство — <em>уже начало истории</em></h2><p>Когда меняется твоё состояние, звезда меняет форму, а отметки сохраняются в дневнике, чтобы к ним можно было вернуться позже.</p><a href="/app" className="lp-inline-link">Отметить своё состояние <span aria-hidden="true">↗</span></a></div></div></section>

    <section className="lp-tools lp-section lp-wrap"><div className="lp-tools-heading"><div><h2>Инструменты <em>на разные моменты</em></h2></div><p>Если хочешь разобраться в состоянии, пройди опросник, а когда нужна пауза, выбери дыхательную практику или лава-лампу.</p></div>
      <div className="lp-tools-grid">
        <article className="lp-tool lp-tool-tests"><div><h3>Опросники</h3><p>Вопросы помогают взглянуть на состояние со стороны, а результаты сохраняются, чтобы к ним можно было вернуться; диагнозом они не являются.</p></div><PhoneShot src="tests" alt="Каталог тестов и шкал UI-PSY" /></article>
        <article className="lp-tool lp-tool-breath"><div><h3>Пауза для дыхания</h3><p>Практика задаёт мягкий ритм, чтобы ты мог выдохнуть без спешки и требований к себе.</p></div><PhoneShot src="breathing" alt="Дыхательная практика UI-PSY" /></article>
        <article className="lp-tool lp-tool-lava"><div><h3>Лава-лампа</h3><p>Пока свет медленно движется, можно сделать паузу и ненадолго отвлечься.</p></div><PhoneShot src="lava" alt="Лава-лампа UI-PSY" /></article>
        <article className="lp-tool lp-tool-support"><div><h3>Я рядом</h3><p>Когда хочется опереться на кого-то, здесь можно поговорить и найти подсказки.</p></div><PhoneShot src="support" alt="Экран поддержки UI-PSY" /></article>
      </div>
      <div className="lp-chart"><div><h3>Динамика без догадок</h3><p>График показывает дни, в которые ты сделал отметки, а пропущенные дни остаются пустыми.</p></div><img src="/landing/screens/chart.webp" alt="График состояния UI-PSY с одной сделанной записью" loading="eager" /></div>
    </section>

    <section id="doctor" className="lp-doctor lp-section"><div className="lp-wrap"><div className="lp-doctor-intro"><div className="lp-doctor-head"><h2>Поддержка врача, <em>когда ты к ней готов</em></h2><p>Когда врач отправляет код или QR, пациент сам решает, открывать ли доступ к записям и результатам, а затем может отозвать его в любой момент.</p><a className="lp-inline-link" href="/doctor">Открыть раздел специалиста <span aria-hidden="true">↗</span></a></div><div className="lp-doctor-visual"><div className="lp-doctor-portrait"><img className="lp-doctor-person" src="/landing/doctor-psychiatrist.webp" alt="Врач показывает телефон с примером QR-приглашения UI-PSY" loading="lazy" /><div className="lp-doctor-phone-screen" aria-hidden="true"><span>UI-PSY</span><strong>Приглашение</strong><img src="/landing/screens/doctor-qr-example.webp" alt="" /></div></div><p>Это пример экрана, а действующий QR врач создаёт в приложении.</p></div></div><div className="lp-steps"><div><SmallStar /><h3>Приглашение</h3><p>Врач создаёт код или QR, чтобы предложить пациенту подключиться.</p></div><div><SmallStar /><h3>Согласие</h3><p>Пациент сам решает, к каким данным открыть доступ.</p></div><div><SmallStar /><h3>Общая работа</h3><p>Врач видит только то, что разрешил пациент, и может назначить опросники.</p></div></div></div></section>

    <section id="faq" className="lp-faq lp-section lp-wrap"><div><h2>Спокойные ответы <em>на важное</em></h2><p>Здесь собраны ответы на вопросы, которые могут возникнуть перед началом.</p></div><div className="lp-faq-list">{faq.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

    <section className="lp-closing"><Sky className="lp-closing-sky" /><DrawnStar mood={5} anxiety={1} energy={4} className="lp-closing-star" /><h2>Один момент <em>для себя</em></h2><p>Отметь, как ты себя чувствуешь, и со временем станет видно, что меняется.</p><a className="lp-button lp-button-light" href="/app">Открыть приложение <span aria-hidden="true">↗</span></a></section>
    <footer className="lp-footer"><div className="lp-wrap"><div><a href="#hero" className="lp-brand"><SmallStar />UI-PSY</a><p>UI-PSY помогает наблюдать за своим состоянием, но не ставит диагноз и не заменяет помощь специалиста.</p></div><nav aria-label="Ссылки внизу страницы"><a href="#features">Возможности</a><a href="#doctor">Для врача</a><a href="#faq">Вопросы</a><a href="/app">Приложение</a></nav><span>© 2026 UI-PSY</span></div></footer>
  </div>;
}
