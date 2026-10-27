/* CO_URA · app — lê o data.txt, monta dois gráficos de evolução por faixa de 30 min
 * (hoje × média geral e hoje × média do dia da semana) e deixa navegar pelos dias.
 *
 * Fonte: data.txt — TSV com cabeçalho (#, referencia, coletado_em, dados_ate, versao, payload).
 * O payload é o JSON do dia; a série fica na seção registro_dia.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.1.0';
  var G = window.URAGrafico;
  var CONFERIR_MS = 60000;           // reconfere o arquivo a cada minuto

  // Só o dia corrente traz a série de 30 em 30 min; os dias anteriores guardam
  // apenas os totais. Por isso o app mostra o dia mais recente que tem série.
  var dia = null;                    // {referencia, coletado_em, dados_ate, dia_semana, serie, totalHoje}
  var faixaSel = { geral: null, dia: null };   // faixa destacada em cada gráfico

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtNum(n) { return n == null ? '—' : Number(n).toLocaleString('pt-BR'); }

  // ---------- leitura do data.txt ----------
  function parseTSV(txt) {
    var linhas = txt.replace(/\r/g, '').split('\n').filter(function (l) { return l.length; });
    if (!linhas.length) return [];
    var cab = linhas[0].split('\t');
    var iRef = cab.indexOf('referencia'), iCol = cab.indexOf('coletado_em'),
        iAte = cab.indexOf('dados_ate'), iPay = cab.indexOf('payload');
    var out = [];
    for (var k = 1; k < linhas.length; k++) {
      var c = linhas[k].split('\t');
      if (c.length <= iPay) continue;
      var pay;
      try { pay = JSON.parse(c[iPay]); } catch (e) { continue; }
      var secRD = (pay.secoes || []).filter(function (s) { return s.id === 'registro_dia' && s.serie; })[0];
      if (!secRD) continue;   // só dias com série de 30 em 30 min
      var serie = secRD.serie;
      out.push({
        referencia: c[iRef], coletado_em: c[iCol], dados_ate: c[iAte],
        dia_semana: serie.dia_semana || pay.dia_semana, serie: serie
      });
    }
    // mais recente primeiro
    out.sort(function (a, b) { return a.referencia < b.referencia ? 1 : a.referencia > b.referencia ? -1 : 0; });
    return out;
  }

  function sync(estado, texto) {
    var d = $('syncDot'); if (d) d.className = 'dot' + (estado ? ' ' + estado : '');
    var t = $('syncTx'); if (t) t.textContent = texto;
  }

  function carregar() {
    return fetch('data.txt?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (txt) {
        var novos = parseTSV(txt);
        if (!novos.length) throw new Error('vazio');
        dia = novos[0];
        sync('', 'Atualizado · dados até ' + (dia.dados_ate || '—'));
        desenhar();
      })
      .catch(function (e) {
        if (dia) { sync('off', 'Sem conexão — mostrando a última cópia'); }
        else {
          sync('err', 'Não foi possível carregar os dados');
          $('app').innerHTML = '<div class="aviso bad">Não consegui ler o <b>data.txt</b>. Verifique se o arquivo está publicado junto do app.</div>';
        }
      });
  }

  // ---------- SVG de um gráfico ----------
  var ARROW = {
    alta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>',
    baixa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>',
    estavel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>'
  };
  function chipVar(pct) {
    var t = G.tendencia(pct);
    if (t == null) return '';
    var txt = (pct > 0 ? '+' : '') + String(pct).replace('.', ',') + '%';
    return '<span class="chip ' + t + '">' + ARROW[t] + txt + '</span>';
  }

  // caminho de barra com cantos arredondados só no topo
  function barPath(x, w, yTop, yBot, r) {
    r = Math.max(0, Math.min(r, w / 2, yBot - yTop));
    return 'M' + x + ',' + yBot.toFixed(2) +
      ' L' + x + ',' + (yTop + r).toFixed(2) +
      ' Q' + x + ',' + yTop.toFixed(2) + ' ' + (x + r).toFixed(2) + ',' + yTop.toFixed(2) +
      ' L' + (x + w - r).toFixed(2) + ',' + yTop.toFixed(2) +
      ' Q' + (x + w).toFixed(2) + ',' + yTop.toFixed(2) + ' ' + (x + w).toFixed(2) + ',' + (yTop + r).toFixed(2) +
      ' L' + (x + w).toFixed(2) + ',' + yBot.toFixed(2) + ' Z';
  }

  function svgBarras(geo) {
    var R = 2.6;
    return geo.barras.map(function (b) {
      if (b.yHoje >= b.y0) return '';   // zero chamadas na faixa
      if (b.acima && b.yMedia != null) {
        // base (0 → média): topo reto, roxo; fatia que excede (média → hoje): topo arredondado, alerta
        var base = '<rect x="' + b.x + '" y="' + b.yMedia + '" width="' + b.w + '" height="' + (b.y0 - b.yMedia).toFixed(2) + '" fill="var(--barra)"/>';
        var cap = '<path d="' + barPath(b.x, b.w, b.yHoje, b.yMedia, R) + '" fill="var(--acima)"/>';
        return base + cap;
      }
      return '<path d="' + barPath(b.x, b.w, b.yHoje, b.y0, R) + '" fill="var(--barra)"/>';
    }).join('');
  }

  function svgGrafico(geo, id, sel) {
    var g = geo.grade.map(function (l) { return '<line x1="30" y1="' + l.y.toFixed(1) + '" x2="300" y2="' + l.y.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>'; }).join('');
    var ry = geo.rotulosY.map(function (l) { return '<text x="25" y="' + (l.y + 3).toFixed(1) + '" text-anchor="end">' + esc(l.t) + '</text>'; }).join('');
    var rx = geo.rotulosX.map(function (l) { return '<text x="' + l.x.toFixed(1) + '" y="125" text-anchor="middle">' + esc(l.t) + '</text>'; }).join('');
    var xs = sel != null && sel >= 0 ? geo.X(sel) : null;
    return '<svg class="graf" viewBox="-16 0 326 128" role="img" aria-label="Evolução das chamadas por faixa de 30 minutos, em barras; o trecho acima da média fica em cor de alerta" data-graf="' + id + '">' +
      '<g>' + g + '</g>' + ry + rx +
      svgBarras(geo) +
      (xs != null ? '<line data-cursor="1" x1="' + xs.toFixed(1) + '" y1="8" x2="' + xs.toFixed(1) + '" y2="112" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="2 3"/>' : '') +
      (geo.media ? '<polyline fill="none" stroke="var(--media)" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" points="' + geo.media + '"/>' : '') +
      (geo.pontoMedia ? '<circle cx="' + geo.pontoMedia.x.toFixed(1) + '" cy="' + geo.pontoMedia.y.toFixed(1) + '" r="3" fill="var(--card)" stroke="var(--media)" stroke-width="2"/>' : '') +
      '<rect x="30" y="0" width="270" height="128" fill="transparent" data-toque="' + id + '"/>' +
      '</svg>';
  }

  function faixaTxt(serie, qual, i) {
    var media = G.mediaDe(serie, qual);
    if (i == null || i < 0) return 'Toque no gráfico para ver uma faixa.';
    var h = serie.hoje[i], m = media ? media[i] : null;
    var dado = h == null ? 'ainda sem dado' : '<b>' + fmtNum(h) + '</b> chamadas';
    return esc(serie.faixas[i]) + ': ' + dado + (m != null ? ' · média ' + fmtNum(Math.round(m)) : '') + ' · toque para outra faixa';
  }

  function cardGrafico(d, qual) {
    var serie = d.serie;
    var media = G.mediaDe(serie, qual);
    var nome = G.nomeDia(serie);
    var titulo = qual === 'geral' ? 'Hoje × média geral' : ('Hoje × média das ' + (nome || 'semana'));
    if (qual === 'dia' && !media) {
      return '<div class="cg"><div class="cab"><h2>' + esc(titulo) + '</h2></div>' +
        '<p class="toque">Sem média do dia da semana para esta data.</p></div>';
    }
    var geo = G.geometria(serie, qual);
    var pct = G.variacao(serie.hoje, media);
    var u = G.ultimoIdx(serie.hoje);
    var s = faixaSel[qual];
    if (s == null || s > u) s = u;
    var totMedia = media ? media.slice(0, u + 1).reduce(function (a, v) { return a + (Number(v) || 0); }, 0) : null;
    var volHoje = serie.hoje.slice(0, u + 1).reduce(function (a, v) { return a + (Number(v) || 0); }, 0);
    return '<div class="cg">' +
      '<div class="cab"><h2>' + esc(titulo) + '</h2>' +
        '<span class="tot">no dia até agora<br><b class="num">' + fmtNum(volHoje) + '</b>' +
        (totMedia != null ? ' <span class="num">vs ' + fmtNum(Math.round(totMedia)) + '</span>' : '') + '</span></div>' +
      chipVar(pct) + (pct != null ? ' <span class="toque" style="display:inline;margin:0;color:var(--ink2)">' + (qual === 'geral' ? 'vs média histórica' : 'vs média das ' + esc(nome)) + '</span>' : '') +
      svgGrafico(geo, qual, s) +
      '<div class="leg"><span><i class="sq h"></i>hoje</span>' +
        '<span><i class="sq a"></i>acima da média</span>' +
        (geo.media ? '<span><i class="tr"></i>' + (qual === 'geral' ? 'média geral' : 'média das ' + esc(nome)) + '</span>' : '') + '</div>' +
      '<span class="toque" data-info="' + qual + '">' + faixaTxt(serie, qual, s) + '</span>' +
      '</div>';
  }

  var SEMANA = { domingo: 'domingo', segunda: 'segunda-feira', terca: 'terça-feira', 'terça': 'terça-feira', quarta: 'quarta-feira', quinta: 'quinta-feira', sexta: 'sexta-feira', sabado: 'sábado', 'sábado': 'sábado' };
  function dataPorExtenso(ref, ds) {
    var p = String(ref).split('-');
    if (p.length !== 3) return ref;
    var txt = p[2] + '/' + p[1] + '/' + p[0];
    var nome = SEMANA[String(ds || '').toLowerCase()];
    return nome ? (nome.charAt(0).toUpperCase() + nome.slice(1) + ', ' + txt) : txt;
  }

  function cabecalhoDia() {
    return '<div class="dias"><div class="lbl"><b>' + esc(dataPorExtenso(dia.referencia, dia.dia_semana)) + '</b>' +
      '<small>evolução de hoje · dados até ' + esc(dia.dados_ate || '—') + '</small></div></div>';
  }

  function desenhar() {
    if (!dia) return;
    $('app').innerHTML = cabecalhoDia() + cardGrafico(dia, 'geral') + cardGrafico(dia, 'dia');
    ligar();
  }

  function ligar() {
    // toque nos gráficos para destacar uma faixa
    document.querySelectorAll('[data-toque]').forEach(function (alvo) {
      var qual = alvo.getAttribute('data-toque');
      var svg = alvo.closest('svg');
      function aponta(ev) {
        var p = svg.createSVGPoint();
        var e = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
        p.x = e.clientX; p.y = e.clientY;
        var x = p.matrixTransform(svg.getScreenCTM().inverse()).x;
        var serie = dia.serie, n = serie.faixas.length, u = G.ultimoIdx(serie.hoje);
        faixaSel[qual] = Math.max(0, Math.min(u, Math.round((x - 30) / 270 * (n - 1))));
        atualizaInfo(qual);
      }
      alvo.addEventListener('click', aponta);
      alvo.addEventListener('touchmove', function (ev) { ev.preventDefault(); aponta(ev); }, { passive: false });
    });
  }

  // redesenha só a linha-guia + o texto da faixa (sem recriar tudo)
  function atualizaInfo(qual) {
    var serie = dia.serie, geo = G.geometria(serie, qual), s = faixaSel[qual];
    var svg = document.querySelector('svg[data-graf="' + qual + '"]');
    if (svg) {
      var ln = svg.querySelector('line[data-cursor]');
      var xs = s != null && s >= 0 ? geo.X(s) : null;
      if (xs != null) {
        if (!ln) { ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('data-cursor', '1'); ln.setAttribute('stroke', 'var(--ink3)'); ln.setAttribute('stroke-width', '1'); ln.setAttribute('stroke-dasharray', '2 3'); svg.insertBefore(ln, svg.querySelector('polygon,polyline,circle')); }
        ln.setAttribute('x1', xs.toFixed(1)); ln.setAttribute('y1', '8'); ln.setAttribute('x2', xs.toFixed(1)); ln.setAttribute('y2', '112');
      }
    }
    var info = document.querySelector('[data-info="' + qual + '"]');
    if (info) info.innerHTML = faixaTxt(serie, qual, s);
  }

  // ---------- início ----------
  function iniciar() {
    $('btRefresh').onclick = function () {
      var b = $('btRefresh'); b.disabled = true;
      carregar().finally(function () { b.disabled = false; });
    };
    carregar();
    setInterval(function () { if (document.visibilityState === 'visible') carregar(); }, CONFERIR_MS);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') carregar(); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  window.URAApp = { APP_VERSION: APP_VERSION, parseTSV: parseTSV };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
