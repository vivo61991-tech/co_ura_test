/* CO_URA · app — lê o data.txt e mostra a evolução das chamadas por faixa, em barras.
 * Dois gráficos de mesma estrutura: hoje × média geral e hoje × média do dia da semana.
 * Controles: navegar pelos dias e escolher o eixo X (30 min, 1 h ou 2 h).
 *
 * Fonte: data.txt — TSV (#, referencia, coletado_em, dados_ate, versao, payload).
 * O payload é o JSON do dia; a série de 30 em 30 min fica na seção registro_dia.
 * Só o dia corrente traz a série; os dias fechados guardam apenas os totais.
 */
(function () {
  'use strict';

  var APP_VERSION = '1.3.0';
  var G = window.URAGrafico;
  var CONFERIR_MS = 60000;           // reconfere o arquivo a cada minuto

  var dias = [];                     // todos os dias do data.txt, mais novo → mais velho
  var sel = 0;                       // dia selecionado
  var passo = 1;                     // agrupamento do eixo X: 1 = 30min, 2 = 1h, 4 = 2h
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
      var secRD = (pay.secoes || []).filter(function (s) { return s.id === 'registro_dia'; })[0];
      var serie = secRD && secRD.serie ? secRD.serie : null;
      out.push({
        referencia: c[iRef], coletado_em: c[iCol], dados_ate: c[iAte],
        dia_semana: (serie && serie.dia_semana) || pay.dia_semana,
        serie: serie, cards: secRD ? (secRD.cards || []) : []
      });
    }
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
        dias = novos;
        if (sel >= dias.length) sel = dias.length - 1;
        if (sel < 0) sel = 0;
        sync('', 'Atualizado · dados até ' + (dias[0].dados_ate || '—'));
        desenhar();
      })
      .catch(function (e) {
        if (dias.length) { sync('off', 'Sem conexão — mostrando a última cópia'); }
        else {
          sync('err', 'Não foi possível carregar os dados');
          $('app').innerHTML = '<div class="aviso bad">Não consegui ler o <b>data.txt</b>. Verifique se o arquivo está publicado junto do app.</div>';
        }
      });
  }

  // série do dia selecionado, já agregada no passo escolhido
  function serieAtual() { return G.agrega(dias[sel].serie, passo); }

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
    var R = passo >= 4 ? 3.2 : passo >= 2 ? 3 : 2.6;
    return geo.barras.map(function (b) {
      if (b.yHoje >= b.y0) return '';   // zero chamadas na faixa
      if (b.acima && b.yMedia != null) {
        var base = '<rect x="' + b.x + '" y="' + b.yMedia + '" width="' + b.w + '" height="' + (b.y0 - b.yMedia).toFixed(2) + '" fill="var(--barra)"/>';
        var cap = '<path d="' + barPath(b.x, b.w, b.yHoje, b.yMedia, R) + '" fill="var(--acima)"/>';
        return base + cap;
      }
      return '<path d="' + barPath(b.x, b.w, b.yHoje, b.y0, R) + '" fill="var(--barra)"/>';
    }).join('');
  }

  var YTOP = 22, YBASE = 118, VBH = 150;

  // rótulos de valor em cima de cada coluna (na cor de alerta quando acima da média)
  function svgRotulos(geo, s) {
    return geo.barras.map(function (b) {
      if (b.val == null || b.yHoje >= b.y0) return '';
      var y = (b.yHoje - 2.5).toFixed(1);
      var cl = 'vl' + (b.acima ? ' a' : '') + (b.i === s ? ' sel' : '');
      return '<text class="' + cl + '" x="' + b.cx + '" y="' + y + '" text-anchor="start" transform="rotate(-90 ' + b.cx + ' ' + y + ')">' + esc(fmtNum(b.val)) + '</text>';
    }).join('');
  }

  function svgGrafico(geo, id, s) {
    var g = geo.grade.map(function (l) { return '<line x1="30" y1="' + l.y.toFixed(1) + '" x2="300" y2="' + l.y.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>'; }).join('');
    var ry = geo.rotulosY.map(function (l) { return '<text class="yl" x="25" y="' + (l.y + 3).toFixed(1) + '" text-anchor="end">' + esc(l.t) + '</text>'; }).join('');
    // todos os horários, na vertical (rotacionados), destacando o selecionado
    var rx = geo.rotulosX.map(function (l, i) {
      var x = l.x.toFixed(1);
      return '<text class="xl' + (i === s ? ' sel' : '') + '" x="' + x + '" y="' + (YBASE + 5).toFixed(1) + '" text-anchor="end" transform="rotate(-90 ' + x + ' ' + (YBASE + 5).toFixed(1) + ')">' + esc(l.t) + '</text>';
    }).join('');
    var xs = s != null && s >= 0 ? geo.X(s) : null;
    return '<svg class="graf" viewBox="-16 0 326 ' + VBH + '" role="img" aria-label="Evolução das chamadas por faixa, em colunas; o trecho acima da média fica em cor de alerta" data-graf="' + id + '">' +
      '<g>' + g + '</g>' + ry + rx +
      svgBarras(geo) +
      svgRotulos(geo, s) +
      (xs != null ? '<line data-cursor="1" x1="' + xs.toFixed(1) + '" y1="' + YTOP + '" x2="' + xs.toFixed(1) + '" y2="' + YBASE + '" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="2 3"/>' : '') +
      (geo.media ? '<polyline fill="none" stroke="var(--media)" stroke-width="2" stroke-dasharray="4 3" stroke-linejoin="round" points="' + geo.media + '"/>' : '') +
      (geo.pontoMedia ? '<circle cx="' + geo.pontoMedia.x.toFixed(1) + '" cy="' + geo.pontoMedia.y.toFixed(1) + '" r="3" fill="var(--card)" stroke="var(--media)" stroke-width="2"/>' : '') +
      '<rect x="30" y="0" width="270" height="' + VBH + '" fill="transparent" data-toque="' + id + '"/>' +
      '</svg>';
  }

  // rótulo da faixa agregada: "08:00" (30min) ou "08:00–09:00" (1h/2h)
  function rotuloFaixa(serie, i) {
    var start = serie.faixas[i];
    if (passo <= 1) return start;
    var fim;
    if (i + 1 < serie.faixas.length) fim = serie.faixas[i + 1];
    else {
      var hm = String(start).split(':'); var mins = (+hm[0]) * 60 + (+hm[1]) + passo * 30;
      var hh = Math.floor(mins / 60) % 24;
      fim = ('0' + hh).slice(-2) + ':' + ('0' + (mins % 60)).slice(-2);
    }
    return start + '–' + fim;
  }

  function pctTxt(p) { return (p > 0 ? '+' : '') + String(p).replace('.', ',') + '%'; }
  function numSinal(n) { return (n > 0 ? '+' : '') + fmtNum(n); }

  // painel de detalhes da faixa tocada: data, horário, volume, média e diferença (volume e %)
  function infoHTML(serie, qual, i, dataExt) {
    var media = G.mediaDe(serie, qual);
    if (i == null || i < 0) return '<div class="info-ph">Toque numa coluna para ver os detalhes do horário.</div>';
    var cab = '<div class="info-h"><b>' + esc(rotuloFaixa(serie, i)) + '</b> · ' + esc(dataExt) + '</div>';
    var h = serie.hoje[i];
    if (h == null) return cab + '<div class="info-ph">Ainda sem dado para este horário.</div>';
    var m = media && media[i] != null ? Number(media[i]) : null;
    var difV = m != null ? Math.round(h - m) : null;
    var difP = m != null && m > 0 ? Math.round((h / m - 1) * 1000) / 10 : null;
    var cls = difV == null ? '' : difV > 0 ? 'up' : difV < 0 ? 'down' : 'eq';
    function cel(lb, vl, c) { return '<div><small>' + lb + '</small><b' + (c ? ' class="' + c + '"' : '') + '>' + vl + '</b></div>'; }
    var grade = '<div class="info-g">' +
      cel('Volume', fmtNum(h), '') +
      cel('Média', m != null ? fmtNum(Math.round(m)) : '—', '') +
      cel('Diferença', difV != null ? numSinal(difV) : '—', cls) +
      cel('Percentual', difP != null ? pctTxt(difP) : '—', cls) +
      '</div>';
    var nota = '';
    if (difV != null) {
      var frase = difV > 0 ? ('Passou da média em ' + fmtNum(Math.abs(difV)) + ' chamadas')
        : difV < 0 ? ('Ficou ' + fmtNum(Math.abs(difV)) + ' chamadas abaixo da média')
        : 'Igual à média';
      nota = '<div class="info-note ' + cls + '">' + frase + (difP != null && difV !== 0 ? ' (' + pctTxt(difP) + ')' : '') + '</div>';
    }
    return cab + grade + nota;
  }

  function cardGrafico(qual) {
    var nativa = dias[sel].serie;                 // 30 min — base do cabeçalho/variação (não muda com o eixo)
    var serie = serieAtual();                     // agregada no passo — só as barras reagrupam
    var media = G.mediaDe(serie, qual);
    var mediaNat = G.mediaDe(nativa, qual);
    var nome = G.nomeDia(nativa);
    var titulo = qual === 'geral' ? 'Hoje × média geral' : ('Hoje × média das ' + (nome || 'semana'));
    if (qual === 'dia' && !mediaNat) {
      return '<div class="cg"><div class="cab"><h2>' + esc(titulo) + '</h2></div>' +
        '<p class="toque">Sem média do dia da semana para esta data.</p></div>';
    }
    var geo = G.geometria(serie, qual);
    var pct = G.variacao(nativa.hoje, mediaNat);
    var u = G.ultimoIdx(serie.hoje);
    var s = faixaSel[qual];
    if (s == null || s > u) s = u;
    var un = G.ultimoIdx(nativa.hoje);
    var totMedia = mediaNat ? mediaNat.slice(0, un + 1).reduce(function (a, v) { return a + (Number(v) || 0); }, 0) : null;
    var volHoje = nativa.hoje.slice(0, un + 1).reduce(function (a, v) { return a + (Number(v) || 0); }, 0);
    return '<div class="cg">' +
      '<div class="cab"><h2>' + esc(titulo) + '</h2>' +
        '<span class="tot">no dia até agora<br><b class="num">' + fmtNum(volHoje) + '</b>' +
        (totMedia != null ? ' <span class="num">vs ' + fmtNum(Math.round(totMedia)) + '</span>' : '') + '</span></div>' +
      chipVar(pct) + (pct != null ? ' <span class="toque" style="display:inline;margin:0;color:var(--ink2)">' + (qual === 'geral' ? 'vs média histórica' : 'vs média das ' + esc(nome)) + '</span>' : '') +
      svgGrafico(geo, qual, s) +
      '<div class="leg"><span><i class="sq h"></i>hoje</span>' +
        '<span><i class="sq a"></i>acima da média</span>' +
        (geo.media ? '<span><i class="tr"></i>' + (qual === 'geral' ? 'média geral' : 'média das ' + esc(nome)) + '</span>' : '') + '</div>' +
      '<div class="info" data-info="' + qual + '">' + infoHTML(serie, qual, s, dataPorExtenso(dias[sel].referencia, dias[sel].dia_semana)) + '</div>' +
      '</div>';
  }

  // ---------- controles ----------
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  var SEMANA = { domingo: 'domingo', segunda: 'segunda-feira', terca: 'terça-feira', 'terça': 'terça-feira', quarta: 'quarta-feira', quinta: 'quinta-feira', sexta: 'sexta-feira', sabado: 'sábado', 'sábado': 'sábado' };
  function dataPorExtenso(ref, ds) {
    var p = String(ref).split('-');
    if (p.length !== 3) return ref;
    var txt = p[2] + '/' + p[1] + '/' + p[0];
    var nome = SEMANA[String(ds || '').toLowerCase()];
    return nome ? (nome.charAt(0).toUpperCase() + nome.slice(1) + ', ' + txt) : txt;
  }

  function barraDias() {
    var d = dias[sel];
    var sub = d.serie
      ? ('evolução por faixa · dados até ' + esc(d.dados_ate || '—') + (sel === 0 ? ' · mais recente' : ''))
      : 'somente totais do dia';
    return '<div class="dias">' +
      '<button class="nav" id="diaPrev" ' + (sel >= dias.length - 1 ? 'disabled' : '') + ' aria-label="Dia anterior" title="Dia anterior">' + CHEV_L + '</button>' +
      '<div class="lbl"><b>' + esc(dataPorExtenso(d.referencia, d.dia_semana)) + '</b><small>' + sub + '</small></div>' +
      '<button class="nav" id="diaNext" ' + (sel <= 0 ? 'disabled' : '') + ' aria-label="Dia seguinte" title="Dia seguinte">' + CHEV_R + '</button>' +
      '</div>';
  }

  function controlesEixo() {
    var ops = [[1, '30 min'], [2, '1 h'], [4, '2 h']];
    return '<div class="seg" role="group" aria-label="Agrupar o eixo X">' +
      ops.map(function (o) {
        return '<button type="button" data-passo="' + o[0] + '" aria-pressed="' + (passo === o[0]) + '"' + (passo === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>';
      }).join('') + '</div>';
  }

  function painelTotais(d) {
    var tiles = (d.cards || []).map(function (c) {
      return '<div class="tile"><small>' + esc(c.titulo) + (c.legenda ? ' · ' + esc(c.legenda) : '') + '</small><b class="num">' + fmtNum(c.valor) + '</b></div>';
    }).join('');
    return '<div class="aviso warn">Este dia guarda só os totais — o detalhe de 30 em 30 min não é registrado para dias já fechados.</div>' +
      (tiles ? '<div class="tiles">' + tiles + '</div>' : '<p class="vazio">Sem totais para este dia.</p>');
  }

  function desenhar() {
    if (!dias.length) return;
    var d = dias[sel];
    var html = barraDias();
    if (d.serie) html += controlesEixo() + cardGrafico('geral') + cardGrafico('dia');
    else html += painelTotais(d);
    $('app').innerHTML = html;
    ligar();
  }

  function trocaDia(delta) {
    var novo = Math.min(dias.length - 1, Math.max(0, sel + delta));
    if (novo === sel) return;
    sel = novo; faixaSel = { geral: null, dia: null };
    desenhar(); window.scrollTo(0, 0);
  }

  function ligar() {
    if ($('diaPrev')) $('diaPrev').onclick = function () { trocaDia(1); };   // anterior = mais para trás
    if ($('diaNext')) $('diaNext').onclick = function () { trocaDia(-1); };
    document.querySelectorAll('[data-passo]').forEach(function (b) {
      b.onclick = function () {
        var np = +b.getAttribute('data-passo');
        if (np === passo) return;
        passo = np; faixaSel = { geral: null, dia: null }; desenhar();
      };
    });
    document.querySelectorAll('[data-toque]').forEach(function (alvo) {
      var qual = alvo.getAttribute('data-toque');
      var svg = alvo.closest('svg');
      function aponta(ev) {
        var p = svg.createSVGPoint();
        var e = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
        p.x = e.clientX; p.y = e.clientY;
        var x = p.matrixTransform(svg.getScreenCTM().inverse()).x;
        var serie = serieAtual(), n = serie.faixas.length, u = G.ultimoIdx(serie.hoje);
        faixaSel[qual] = Math.max(0, Math.min(u, Math.round((x - 30) / 270 * (n - 1))));
        atualizaInfo(qual);
      }
      alvo.addEventListener('click', aponta);
      alvo.addEventListener('touchmove', function (ev) { ev.preventDefault(); aponta(ev); }, { passive: false });
    });
  }

  // redesenha só a linha-guia + o texto da faixa (sem recriar tudo)
  function atualizaInfo(qual) {
    var serie = serieAtual(), geo = G.geometria(serie, qual), s = faixaSel[qual];
    var svg = document.querySelector('svg[data-graf="' + qual + '"]');
    if (svg) {
      var ln = svg.querySelector('line[data-cursor]');
      var xs = s != null && s >= 0 ? geo.X(s) : null;
      if (xs != null) {
        if (!ln) { ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'); ln.setAttribute('data-cursor', '1'); ln.setAttribute('stroke', 'var(--ink3)'); ln.setAttribute('stroke-width', '1'); ln.setAttribute('stroke-dasharray', '2 3'); svg.insertBefore(ln, svg.querySelector('polyline,circle')); }
        ln.setAttribute('x1', xs.toFixed(1)); ln.setAttribute('y1', '8'); ln.setAttribute('x2', xs.toFixed(1)); ln.setAttribute('y2', '112');
      }
    }
    var info = document.querySelector('[data-info="' + qual + '"]');
    if (info) info.innerHTML = infoHTML(serie, qual, s, dataPorExtenso(dias[sel].referencia, dias[sel].dia_semana));
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
