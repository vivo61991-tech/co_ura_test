/* CO_URA · gráfico de evolução por faixa de 30 min (SVG à mão, sem biblioteca).
 *
 * A série vem do payload de cada dia (seção registro_dia), por faixa de 30 min:
 *   { faixas:["08:00",…], hoje:[n|null,…], media_geral:[n,…]|null,
 *     dia_semana:"terca", media_dia_semana:[n,…]|null }
 *
 * Diferente do app antigo (que mostrava o ACUMULADO): aqui cada ponto é o VALOR da faixa,
 * ou seja, quantas chamadas caíram naquela meia hora. `hoje` só tem valor até a faixa atual;
 * a média é desenhada o dia inteiro, para ver se o horário está acima ou abaixo do esperado.
 *
 * Funções puras — rodam também no Node, nos testes.
 */
(function (root) {
  'use strict';

  // mesma regra de seta/cor do painel: acima de +15% sobe, abaixo de -5% cai
  var LIMIAR_ALTA = 15, LIMIAR_BAIXA = -5;
  function tendencia(pct) {
    if (pct == null) return null;
    return pct > LIMIAR_ALTA ? 'alta' : pct < LIMIAR_BAIXA ? 'baixa' : 'estavel';
  }

  // índice da última faixa com dado de hoje (-1 se nenhuma)
  function ultimoIdx(arr) {
    var u = -1;
    (arr || []).forEach(function (v, i) { if (v != null) u = i; });
    return u;
  }

  // escolhe a média certa pela comparação ('geral' | 'dia')
  function mediaDe(serie, qual) {
    return qual === 'dia' ? (serie.media_dia_semana || null) : (serie.media_geral || null);
  }

  // variação do volume de hoje contra a média, somando só as faixas já decorridas. null sem média/dado.
  function variacao(hoje, media) {
    var u = ultimoIdx(hoje);
    if (u < 0 || !media) return null;
    var h = 0, m = 0;
    for (var i = 0; i <= u; i++) { h += Number(hoje[i]) || 0; m += Number(media[i]) || 0; }
    return m > 0 ? Math.round((h / m - 1) * 1000) / 10 : null;
  }

  // topo "redondo" da escala: 1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 × 10^k
  function topo(max) {
    if (!(max > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(max)));
    var fs = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < fs.length; i++) if (fs[i] * p >= max) return fs[i] * p;
    return 10 * p;
  }

  function fmtEixo(v) {
    v = Math.round(v);
    return v >= 1000 ? (Math.round(v / 100) / 10).toString().replace('.', ',') + ' mil' : String(v);
  }

  // pico (maior valor) entre hoje (até agora) e a média (dia todo), para a escala
  function pico(serie, qual) {
    var media = mediaDe(serie, qual), u = ultimoIdx(serie.hoje), max = 0;
    for (var i = 0; i <= u; i++) max = Math.max(max, Number(serie.hoje[i]) || 0);
    if (media) for (var j = 0; j < media.length; j++) max = Math.max(max, Number(media[j]) || 0);
    return max;
  }

  // geometria do gráfico (sem DOM): pontos das linhas, grade e rótulos
  function geometria(serie, qual, opt) {
    var o = Object.assign({ x0: 30, x1: 300, y0: 112, y1: 8 }, opt || {});
    var media = mediaDe(serie, qual);
    var n = serie.faixas.length;
    var u = ultimoIdx(serie.hoje);
    var max = topo(pico(serie, qual));
    var X = function (i) { return o.x0 + (n > 1 ? (o.x1 - o.x0) * i / (n - 1) : 0); };
    var Y = function (v) { return o.y0 - (o.y0 - o.y1) * (v / max); };

    // barras de hoje (uma por faixa já decorrida). A fatia que passa da média da faixa é "acima".
    var bw = (n > 1 ? (o.x1 - o.x0) / (n - 1) : o.x1 - o.x0) * 0.66;
    var barras = [];
    for (var b = 0; b <= u; b++) {
      var hv = serie.hoje[b];
      if (hv == null) continue;
      var mv = media && media[b] != null ? Number(media[b]) : null;
      barras.push({
        i: b,
        x: +(X(b) - bw / 2).toFixed(2),
        w: +bw.toFixed(2),
        y0: +o.y0.toFixed(2),
        yHoje: +Y(hv).toFixed(2),
        yMedia: mv != null ? +Y(mv).toFixed(2) : null,
        acima: mv != null && Number(hv) > mv
      });
    }
    // pontos de "hoje": só até a última faixa com dado
    var ptsHoje = [];
    for (var i = 0; i <= u; i++) {
      var v = serie.hoje[i];
      if (v != null) ptsHoje.push(X(i).toFixed(1) + ',' + Y(v).toFixed(1));
    }
    // pontos da média: dia inteiro
    var ptsMedia = [];
    if (media) media.forEach(function (v, k) {
      if (v != null) ptsMedia.push(X(k).toFixed(1) + ',' + Y(v).toFixed(1));
    });

    var rotulosX = [];
    serie.faixas.forEach(function (f, i) {
      if (!/:00$/.test(f) || !(i === 0 || i === n - 1 || Number(f.slice(0, 2)) % 4 === 0)) return;
      var ant = rotulosX[rotulosX.length - 1];
      if (ant && X(i) - ant.x < 30) { if (i === n - 1) rotulosX.pop(); else return; }
      rotulosX.push({ x: X(i), t: f.slice(0, 2) + 'h' });
    });

    return {
      max: max, u: u, n: n, barras: barras, larguraBarra: +bw.toFixed(2),
      hoje: ptsHoje.join(' '),
      area: u >= 0 && ptsHoje.length ? X(0).toFixed(1) + ',' + o.y0 + ' ' + ptsHoje.join(' ') + ' ' + X(u).toFixed(1) + ',' + o.y0 : '',
      media: ptsMedia.join(' '),
      pontoHoje: u >= 0 && serie.hoje[u] != null ? { x: X(u), y: Y(serie.hoje[u]) } : null,
      pontoMedia: u >= 0 && media && media[u] != null ? { x: X(u), y: Y(media[u]) } : null,
      grade: [0, 0.25, 0.5, 0.75, 1].map(function (f) { return { y: Y(max * f), v: max * f }; }),
      rotulosY: [0, 0.5, 1].map(function (f) { return { y: Y(max * f), t: fmtEixo(max * f) }; }),
      rotulosX: rotulosX, X: X, Y: Y
    };
  }

  // nome do dia da semana no plural ("terças"); null se não houver média do dia
  var PLURAL = {
    domingo: 'domingos', segunda: 'segundas', terca: 'terças', 'terça': 'terças',
    quarta: 'quartas', quinta: 'quintas', sexta: 'sextas', sabado: 'sábados', 'sábado': 'sábados'
  };
  function nomeDia(serie) {
    if (!serie || !serie.media_dia_semana) return null;
    return PLURAL[String(serie.dia_semana || '').toLowerCase()] || 'dia da semana';
  }

  // agrega a série em grupos de `passo` faixas de 30 min (1 = 30min, 2 = 1h, 4 = 2h).
  // Soma hoje e as médias por grupo; hoje fica null no grupo sem nenhum dado.
  // As faixas viram o horário de INÍCIO do grupo ("08:00"), para o eixo X continuar legível.
  function agrega(serie, passo) {
    passo = passo || 1;
    if (passo <= 1) return serie;
    var n = serie.faixas.length;
    function soma(arr) {
      if (!arr) return null;
      var out = [];
      for (var g = 0; g < n; g += passo) {
        var s = 0, tem = false;
        for (var k = g; k < Math.min(g + passo, n); k++) {
          if (arr[k] != null) { s += Number(arr[k]) || 0; tem = true; }
        }
        out.push(tem ? s : null);
      }
      return out;
    }
    var faixas = [];
    for (var g = 0; g < n; g += passo) faixas.push(serie.faixas[g]);
    return {
      faixas: faixas, dia_semana: serie.dia_semana,
      hoje: soma(serie.hoje), media_geral: soma(serie.media_geral), media_dia_semana: soma(serie.media_dia_semana)
    };
  }

  var api = { tendencia: tendencia, ultimoIdx: ultimoIdx, mediaDe: mediaDe, variacao: variacao,
    topo: topo, fmtEixo: fmtEixo, pico: pico, geometria: geometria, nomeDia: nomeDia, agrega: agrega };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.URAGrafico = api;
})(typeof self !== 'undefined' ? self : globalThis);
