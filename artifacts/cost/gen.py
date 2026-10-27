# Generates the cost comparison chart (Team LAB estimate, 13.10.2026 + UI-PSY live measurements, 27.10.2026).
rows=[('Без ИИ',132000,11000,False),('GigaChat через API',536122,16469,True),('Дообучение Qwen3-14B',1456274,78612,False),('Своя модель Qwen3.5-27B',1775471,119504,False)]
fmt=lambda v: f'{v:,.0f}'.replace(',', ' ')+' ₽'
W,H=1600,900
LABEL,BAR=290,280
def panel(x0,title,idx,maxv):
    out=[f'<text x="{x0}" y="250" class="ph">{title}</text>']
    y=290
    for name,yr,mo,hl in rows:
        v=(yr,mo)[idx]; w=max(4,BAR*v/maxv); c='#2a78d6' if hl else '#a3a29c'
        cls=' hl' if hl else ''
        out.append(f'<text x="{x0}" y="{y+24}" class="lbl{cls}">{name}</text>')
        out.append(f'<rect x="{x0+LABEL}" y="{y}" width="{w:.1f}" height="34" rx="4" fill="{c}"/>')
        out.append(f'<text x="{x0+LABEL+w+10:.1f}" y="{y+24}" class="val{cls}">{fmt(v)}</text>')
        y+=78
    out.append(f'<line x1="{x0+LABEL}" y1="280" x2="{x0+LABEL}" y2="{y-30}" class="axis"/>')
    return '\n'.join(out)
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
<style>
text{{font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;fill:#0b0b0b}}
.t{{font-size:46px;font-weight:700}} .s{{font-size:24px;fill:#52514e}} .ph{{font-size:26px;font-weight:650;fill:#52514e}}
.lbl{{font-size:21px;fill:#52514e}} .lbl.hl{{fill:#0b0b0b;font-weight:700}}
.val{{font-size:21px;fill:#52514e}} .val.hl{{fill:#0b0b0b;font-weight:700}}
.axis{{stroke:#d9d8d3;stroke-width:1}} .k{{font-size:56px;font-weight:750;fill:#2a78d6}} .kd{{font-size:22px;fill:#52514e}} .n{{font-size:17px;fill:#7a7974}}
</style>
<rect width="100%" height="100%" fill="#fcfcfb"/>
<text x="80" y="110" class="t">ИИ через GigaChat в 3,3 раза дешевле своей модели</text>
<text x="80" y="155" class="s">Расходы на 5 000 ИИ-отчётов в год: подготовка + содержание. Расчёт Team LAB от 13.10.2026</text>
{panel(80,'Первый год',0,1775471)}
{panel(840,'В месяц',1,119504)}
<line x1="80" y1="640" x2="1520" y2="640" class="axis"/>
<text x="80" y="725" class="k">в 7 раз</text><text x="80" y="760" class="kd">дешевле в месяц, чем своя модель</text>
<text x="560" y="725" class="k">240</text><text x="560" y="760" class="kd">токенов на запрос в UI-PSY (в расчёте — 10 000)</text>
<text x="1090" y="725" class="k">5 из 5</text><text x="1090" y="760" class="kd">ответов со ссылкой на ВОЗ/NHS</text>
<text x="80" y="840" class="n">Тарифы Cloud.ru/Сбер, аренда REG.Cloud. Замеры UI-PSY: живой GigaChat-2-Pro, 27.10.2026, синтетические запросы. Ссылки на источники ≠ клиническая валидация.</text>
</svg>'''
open('gigachat-vs-own-model.svg','w').write(svg)
open('index.html','w').write('<!doctype html><meta charset="utf-8"><body style="margin:0">'+svg)
