import { ArrowLeft } from './icons';
import NeuroplayDirect from './NeuroplayDirect';

export default function NeuroplayPage({ onBack }: { onBack: () => void }) {
  return <main className="neuroplay-page">
    <button className="neuroplay-back text-button" onClick={onBack}><ArrowLeft size={18} />Назад</button>
    <section className="neuroplay-hero" aria-labelledby="neuroplay-title">
      <div className="neuroplay-photo">
        <img src="/devices/neuroplay-6c.webp" alt="Нейроинтерфейс — гарнитура с сухими электродами" width={800} height={800} />
      </div>
      <div className="neuroplay-copy">
        <span className="neuroplay-eyebrow">Нейроинтерфейс</span>
        <h1 id="neuroplay-title">Подключи гарнитуру</h1>
        <p>Надень гарнитуру, включи её и нажми «Подключить» — браузер предложит выбрать устройство. Сигнал шести каналов ЭЭГ появится здесь.</p>
        <NeuroplayDirect variant="page" />
      </div>
    </section>
  </main>;
}
