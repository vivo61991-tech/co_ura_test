/* URA · Visão Geral — gráfico do Total Geral (SVG feito à mão, sem biblioteca).
 *
 * A série vem do MAPI (campo `serie` da seção registro_dia), por faixa de 30 min:
 *   {faixas:["08:00",…], hoje:[n|null,…], media_geral:[n,…]|null, dia_semana:"segunda", media_dia_semana:[n,…]|null}
 * `hoje` só tem valor até a faixa atual. O gráfico mostra o ACUMULADO do dia: a linha de hoje até agora e a média
 * (geral ou do dia da semana) o dia inteiro, para ver se o volume está acima ou abaixo do esperado para o horário.
 *
 * Funções puras (rodam também no Node, para os testes).
 */
(function (root) {
  'use strict';

  // mesma regra de seta/cor dos cards do painel: acima de +15% sobe, abaixo de -5% cai
  const LIMIAR_ALTA = 15, LIMIAR_BAIXA = -5;
  const tendencia = pct => pct == null ? null : pct > LIMIAR_ALTA ? 'alta' : pct < LIMIAR_BAIXA ? 'baixa' : 'estavel';

  const ultimoIdx = arr => { let u = -1; (arr || []).forEach((v, i) => { if (v != null) u = i; }); return u; };

  // acumulado até `ate` (inclusive); nulos contam zero. Depois de `ate`, null.
  function acumulado(arr, ate) {
    let s = 0;
    return (arr || []).map((v, i) => { if (i > ate) return null; s += Number(v) || 0; return s; });
  }

  // variação de hoje contra a média nas mesmas faixas (até a última com dado). null sem média.
  function variacao(hoje, media) {
    const u = ultimoIdx(hoje);
    if (u < 0 || !media) return null;
    let h = 0, m = 0;
    for (let i = 0; i <= u; i++) { h += Number(hoje[i]) || 0; m += Number(media[i]) || 0; }
    return m > 0 ? Math.round((h / m - 1) * 1000) / 10 : null;
  }

  // topo "redondo" da escala: 1, 1,5, 2, 2,5, 3, 4, 5, 6 ou 8 × 10^k
  function topo(max) {
    if (!(max > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * p >= max) return f * p;
    return 10 * p;
  }

  const fmtEixo = v => v >= 1000 ? (Math.round(v / 100) / 10).toString().replace('.', ',') + ' mil' : String(Math.round(v));

  // geometria do gráfico (sem DOM): pontos das linhas, grade e rótulos
  function geometria(serie, qual, opt) {
    const o = Object.assign({ x0: 30, x1: 300, y0: 112, y1: 8 }, opt || {});
    const media = qual === 'dia' ? serie.media_dia_semana : serie.media_geral;
    const n = serie.faixas.length;
    const u = ultimoIdx(serie.hoje);
    const accH = acumulado(serie.hoje, u);
    const accM = media ? acumulado(media, n - 1) : null;
    const max = topo(Math.max(accH[u] || 0, accM ? accM[n - 1] : 0));
    const X = i => o.x0 + (n > 1 ? (o.x1 - o.x0) * i / (n - 1) : 0);
    const Y = v => o.y0 - (o.y0 - o.y1) * (v / max);
    const pts = arr => arr.map((v, i) => v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean).join(' ');
    const rotulosX = [];
    serie.faixas.forEach((f, i) => {
      if (!f.endsWith(':00') || !(i === 0 || i === n - 1 || Number(f.slice(0, 2)) % 4 === 0)) return;
      const ant = rotulosX[rotulosX.length - 1];
      if (ant && X(i) - ant.x < 30) { if (i === n - 1) rotulosX.pop(); else return; }   // não encavalar (20h × 21h)
      rotulosX.push({ x: X(i), t: f.slice(0, 2) + 'h' });
    });
    return {
      max, u, n,
      hoje: u >= 0 ? pts(accH) : '',
      area: u >= 0 ? `${X(0).toFixed(1)},${o.y0} ${pts(accH)} ${X(u).toFixed(1)},${o.y0}` : '',
      media: accM ? pts(accM) : '',
      pontoHoje: u >= 0 ? { x: X(u), y: Y(accH[u]) } : null,
      pontoMedia: u >= 0 && accM ? { x: X(u), y: Y(accM[u]) } : null,
      grade: [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: Y(max * f), v: max * f })),
      rotulosY: [0, 0.5, 1].map(f => ({ y: Y(max * f), t: fmtEixo(max * f) })),
      rotulosX, X, accH, accM
    };
  }

  // nome do botão do dia da semana ("segundas"); null no fim de semana (o painel não tem a média)
  const PLURAL = { segunda: 'segundas', terca: 'terças', 'terça': 'terças', quarta: 'quartas', quinta: 'quintas', sexta: 'sextas' };
  const nomeDia = serie => serie && serie.media_dia_semana ? (PLURAL[String(serie.dia_semana || '').toLowerCase()] || 'dia da semana') : null;

  const api = { tendencia, ultimoIdx, acumulado, variacao, topo, geometria, nomeDia, fmtEixo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.URAGrafico = api;
})(typeof self !== 'undefined' ? self : globalThis);
