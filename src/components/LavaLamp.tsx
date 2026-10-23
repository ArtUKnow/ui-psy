import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Music2, Pause, Play, Volume2, VolumeX } from './icons';
import { BrandMark } from './Visuals';

type Palette = 'ocean' | 'dusk' | 'warm';

const palettes: { id: Palette; label: string }[] = [
  { id: 'ocean', label: 'Океан' },
  { id: 'dusk', label: 'Сумерки' },
  { id: 'warm', label: 'Тёплый свет' },
];

class AmbientMusic {
  private context: AudioContext;
  private master: GainNode;
  private timer: number | undefined;
  private step = 0;
  private nextNote = 0;

  constructor(volume: number) {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = volume * 0.16;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1550;
    const echo = this.context.createDelay(1);
    echo.delayTime.value = 0.42;
    const echoGain = this.context.createGain();
    echoGain.gain.value = 0.17;
    this.master.connect(lowpass);
    lowpass.connect(this.context.destination);
    lowpass.connect(echo);
    echo.connect(echoGain);
    echoGain.connect(lowpass);
  }

  private note(frequency: number, start: number, duration: number, strength: number) {
    const oscillator = this.context.createOscillator();
    const overtone = this.context.createOscillator();
    const overtoneGain = this.context.createGain();
    const envelope = this.context.createGain();
    oscillator.type = 'sine';
    overtone.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    overtone.frequency.setValueAtTime(frequency * 2, start);
    overtoneGain.gain.value = 0.13;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(strength, start + Math.min(0.35, duration / 3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    overtone.connect(overtoneGain).connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    overtone.start(start);
    oscillator.stop(start + duration + 0.03);
    overtone.stop(start + duration + 0.03);
  }

  async start() {
    await this.context.resume();
    this.nextNote = this.context.currentTime + 0.08;
    // A slow C-major pentatonic phrase with low, changing chord roots.
    const melody = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392, 440, 587.33, 440, 392];
    const bass = [130.81, 110, 146.83, 98];
    const schedule = () => {
      while (this.nextNote < this.context.currentTime + 0.8) {
        const index = this.step % melody.length;
        this.note(melody[index], this.nextNote, 2.9, 0.25);
        if (index % 3 === 0) this.note(bass[Math.floor(this.step / 3) % bass.length], this.nextNote, 4.8, 0.19);
        this.nextNote += 1.45;
        this.step += 1;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 300);
  }

  setVolume(volume: number) {
    this.master.gain.setTargetAtTime(volume * 0.16, this.context.currentTime, 0.08);
  }

  async stop() {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    await this.context.close();
  }
}

export default function LavaLamp({ onBack }: { onBack: () => void }) {
  const [palette, setPalette] = useState<Palette>('ocean');
  const [moving, setMoving] = useState(true);
  const [musicOn, setMusicOn] = useState(false);
  const [volume, setVolume] = useState(55);
  const [audioError, setAudioError] = useState('');
  const music = useRef<AmbientMusic | null>(null);

  useEffect(() => () => { void music.current?.stop(); music.current = null; }, []);
  useEffect(() => { music.current?.setVolume(volume / 100); }, [volume]);

  async function toggleMusic() {
    if (music.current) {
      const active = music.current;
      music.current = null;
      setMusicOn(false);
      await active.stop();
      return;
    }
    try {
      const next = new AmbientMusic(volume / 100);
      music.current = next;
      await next.start();
      setAudioError('');
      setMusicOn(true);
    } catch {
      void music.current?.stop();
      music.current = null;
      setMusicOn(false);
      setAudioError('Звук недоступен в этом браузере. Лампа продолжит двигаться без музыки.');
    }
  }

  return <main className={`lava-page lava-${palette}${moving ? '' : ' lava-still'}`}>
    <header className="lava-topbar">
      <button className="lava-back" onClick={onBack}><ArrowLeft size={18} />В приложение</button>
      <span className="lava-brand"><BrandMark />UI-PSY</span>
      <span className="lava-topbar-space" aria-hidden="true" />
    </header>
    <section className="lava-content" aria-label="Лава-лампа для отдыха">
      <div className="lava-intro"><span className="lava-eyebrow">ПАУЗА ДЛЯ СЕБЯ</span><h1>Побудь в моменте</h1><p>Смотри, как свет медленно меняет форму.</p></div>
      <div className="lava-scene">
        <div className="lava-aura" aria-hidden="true" />
        <svg className="lava-lamp" viewBox="0 0 360 610" role="img" aria-label="Плавно движущиеся цветные капли в стеклянной лава-лампе">
          <defs>
            <linearGradient id="lavaGlass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b9e5f5" stopOpacity=".16" /><stop offset=".45" stopColor="#132937" stopOpacity=".47" /><stop offset="1" stopColor="#8cb6d2" stopOpacity=".22" /></linearGradient>
            <linearGradient id="lavaEdge" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#d5effe" stopOpacity=".7" /><stop offset=".19" stopColor="#dbf7fc" stopOpacity=".16" /><stop offset=".72" stopColor="#a8d5e9" stopOpacity=".14" /><stop offset="1" stopColor="#d5effe" stopOpacity=".64" /></linearGradient>
            <linearGradient id="lavaCap" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#506476" /><stop offset=".48" stopColor="#253643" /><stop offset="1" stopColor="#0b1a25" /></linearGradient>
            <radialGradient id="lavaWax" cx="44%" cy="48%" r="70%"><stop stopColor="var(--lava-core)" /><stop offset=".48" stopColor="var(--lava-color)" /><stop offset="1" stopColor="var(--lava-edge)" /></radialGradient>
            <filter id="lavaMetaball" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur in="SourceGraphic" stdDeviation="17" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -8" /></filter>
            <clipPath id="lavaVessel"><path d="M148 65 Q150 54 164 54 H196 Q210 54 212 65 C216 132 229 206 248 300 C265 386 278 436 284 475 Q286 493 273 494 H87 Q74 493 76 475 C82 436 95 386 112 300 C131 206 144 132 148 65Z" /></clipPath>
            <mask id="lavaWaxMask" maskUnits="userSpaceOnUse" x="68" y="52" width="224" height="448"><g filter="url(#lavaMetaball)" fill="white">
              <ellipse className="lava-blob lava-blob-1" cx="154" cy="420" rx="49" ry="65" />
              <ellipse className="lava-blob lava-blob-2" cx="211" cy="336" rx="42" ry="55" />
              <ellipse className="lava-blob lava-blob-3" cx="159" cy="267" rx="38" ry="48" />
              <ellipse className="lava-blob lava-blob-4" cx="194" cy="176" rx="28" ry="37" />
              <ellipse className="lava-blob lava-blob-5" cx="119" cy="476" rx="45" ry="28" />
              <ellipse className="lava-blob lava-blob-6" cx="241" cy="466" rx="48" ry="33" />
            </g></mask>
          </defs>
          <path d="M148 65 Q150 54 164 54 H196 Q210 54 212 65 C216 132 229 206 248 300 C265 386 278 436 284 475 Q286 493 273 494 H87 Q74 493 76 475 C82 436 95 386 112 300 C131 206 144 132 148 65Z" fill="url(#lavaGlass)" />
          <g clipPath="url(#lavaVessel)">
            <rect x="68" y="52" width="224" height="448" fill="var(--lava-liquid)" />
            <rect x="68" y="52" width="224" height="448" fill="url(#lavaWax)" mask="url(#lavaWaxMask)" />
            <path d="M153 66 C143 191 128 319 90 479" fill="none" stroke="#e5f8ff" strokeOpacity=".19" strokeWidth="4" />
            <path d="M203 70 C216 192 239 344 273 478" fill="none" stroke="#effbff" strokeOpacity=".14" strokeWidth="8" />
          </g>
          <path d="M148 65 Q150 54 164 54 H196 Q210 54 212 65 C216 132 229 206 248 300 C265 386 278 436 284 475 Q286 493 273 494 H87 Q74 493 76 475 C82 436 95 386 112 300 C131 206 144 132 148 65Z" fill="none" stroke="url(#lavaEdge)" strokeWidth="3" />
          <path d="M151 35 Q153 24 165 24 H195 Q207 24 209 35 L212 65 H148Z" fill="url(#lavaCap)" stroke="#95b5c554" strokeWidth="2" />
          <path d="M77 493 H283 L311 558 Q315 572 301 574 H59 Q45 572 49 558Z" fill="url(#lavaCap)" stroke="#a7c9d456" strokeWidth="2" />
          <path d="M70 558 H290" stroke="#bfd9e2" strokeOpacity=".18" strokeWidth="2" />
        </svg>
        <div className="lava-ground" aria-hidden="true" />
      </div>
      <div className="lava-controls">
        <div className="lava-palette" role="group" aria-label="Цвет лампы">{palettes.map(option => <button key={option.id} className={palette === option.id ? 'active' : ''} aria-pressed={palette === option.id} onClick={() => setPalette(option.id)}>{option.label}</button>)}</div>
        <div className="lava-actions"><button className="lava-control-button" onClick={() => setMoving(value => !value)} aria-pressed={!moving}>{moving ? <Pause size={17} /> : <Play size={17} />}{moving ? 'Остановить' : 'Продолжить'}</button><button className="lava-control-button lava-music-button" onClick={() => void toggleMusic()} aria-pressed={musicOn}>{musicOn ? <Volume2 size={17} /> : <Music2 size={17} />}{musicOn ? 'Музыка играет' : 'Включить музыку'}</button></div>
        {musicOn && <label className="lava-volume"><VolumeX size={15} /><input aria-label="Громкость музыки" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} /><Volume2 size={15} /></label>}
        {audioError && <p className="lava-audio-error" role="status">{audioError}</p>}
        <p className="lava-note">Можно просто смотреть. Спешить некуда.</p>
      </div>
    </section>
  </main>;
}
