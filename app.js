/* URA · Visão Geral — telas.
 *
 * Fluxo: credencial do HUB neste aparelho -> baixa o dados.json (sempre da rede, cópia no cache para offline) ->
 * abre com cripto.js -> desenha. Confere de novo a cada minuto com o app aberto e ao voltar para ele.
 * Nada aberto é guardado no aparelho: só o dados.json cifrado, no cache do service worker.
 */
(function () {
  'use strict';

  const APP_VERSION = '1.1.0';
  const CONFERIR_MS = 60 * 1000;
  const FRESCO_MIN = 15;              // coleta mais velha que isso (de hoje): o ponto do topo fica cinza
  const HUB_URL = new URL('/', location.href).href;
  const PROB_URL = new URL('/CO_PROB/', location.href).href;
  const SEM_FALHAS = 'Sem Falhas Massivas em Aberto! Sistemas Operando Normalmente.';

  const G = window.URAGrafico, K = window.URACripto;
  const $ = id => document.getElementById(id);
  const esc = v => v == null ? '' : String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('pt-BR');
  const fmtNum = v => v == null ? '—' : nf.format(v);
  const fmtPct = v => v == null ? '—' : String(Math.round(Number(v) * 10) / 10).replace('.', ',') + '%';
  const fmtVar = v => (v > 0 ? '+' : v < 0 ? '−' : '') + String(Math.abs(Math.round(v * 10) / 10)).replace('.', ',') + '%';
  const SETA = { alta: '▲', baixa: '▼', estavel: '●' };
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dataBR = iso => iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';

  let resumo = null, cred = null, gerado = null, aba = 'geral', comparar = 'geral', faixaSel = null;

  // ---------- dados ----------
  async function baixar() {
    const r = await fetch('dados.json', { cache: 'no-store' });
    if (r.status === 404) { const e = new Error('Ainda não há dados publicados.'); e.code = 'sem_dados'; throw e; }
    if (!r.ok) throw new Error('Não consegui baixar os dados (HTTP ' + r.status + ').');
    return r.json();
  }

  // acesso perdido: tira do cache do aparelho a cópia (cifrada) dos dados
  async function apagarCopia() {
    if (!('caches' in window)) return;
    try {
      for (const k of await caches.keys()) {
        if (!k.startsWith('co-ura-v')) continue;
        const c = await caches.open(k);
        for (const req of await c.keys()) if (new URL(req.url).pathname.endsWith('/dados.json')) await c.delete(req);
      }
    } catch (e) { /* sem cache: nada a apagar */ }
  }

  async function carregar() {
    cred = await K.lerCredHub();
    if (!cred) { resumo = null; await apagarCopia(); return telaAviso('Entre pelo HUB',
      'Este app abre com o login do HUB dos apps. Entre no HUB com sua matrícula e chave e toque no atalho da URA.', true); }
    let pacote;
    try { pacote = await baixar(); }
    catch (e) {
      if (resumo) return marcarOffline(e.message);
      return telaAviso(e.code === 'sem_dados' ? 'Sem dados ainda' : 'Sem conexão', e.message, false);
    }
    if (pacote.gerado_em && pacote.gerado_em === gerado && resumo) { marcarOffline(null); return desenhar(); }
    try {
      resumo = await K.abrir(pacote, cred);
      gerado = pacote.gerado_em || null;
    } catch (e) {
      if (e.code === 'sem_acesso') { resumo = null; await apagarCopia(); return telaAviso('Sem acesso', e.message, true); }
      return telaAviso('Não deu para abrir', e.message, false);
    }
    marcarOffline(null);
    desenhar();
  }

  function marcarOffline(msg) {
    const n = $('offline');
    if (!n) return;
    n.hidden = !msg;
    n.textContent = msg ? 'Sem conexão: mostrando os últimos dados abertos.' : '';
  }

  // ---------- telas ----------
  function telaAviso(titulo, texto, comHub) {
    $('nav').hidden = true;
    $('sub').innerHTML = '';
    $('conteudo').innerHTML = `<div class="aviso-tela"><div class="ic" aria-hidden="true">📞</div><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      ${comHub ? `<a class="bt" href="${esc(HUB_URL)}">Abrir o HUB</a>` : '<button type="button" class="bt" id="btTentar">Tentar de novo</button>'}</div>`;
    const t = $('btTentar');
    if (t) t.onclick = () => carregar();
    $('rodape').textContent = 'v' + APP_VERSION;
  }

  function desenhar() {
    if (!resumo) return;
    const r = resumo;
    const fresco = r.referencia === hojeISO() && !r.defasado && minutosDesde(r.coletado_em) <= FRESCO_MIN;
    $('sub').innerHTML = `<span class="vivo${fresco ? '' : ' parado'}" aria-hidden="true"></span> Dados até ${esc(r.dados_ate || '—')}${r.dia_semana ? ' · ' + esc(String(r.dia_semana).toLowerCase()) : ''}`;
    const f = r.falhas || {};
    const nav = $('nav');
    nav.hidden = !f.ok;
    $('tabFalhasN').textContent = f.ok ? ` (${f.abertas || 0})` : '';
    if (!f.ok && aba === 'falhas') aba = 'geral';
    nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.aba === aba)));
    $('conteudo').innerHTML = avisos(r) + (aba === 'falhas' ? telaFalhas(f) : r.secoes.map(secao).join(''));
    ligarGrafico();
    $('rodape').textContent = `Coletado às ${esc(horaDe(r.coletado_em))} · v${APP_VERSION}` + (cred && cred.matricula ? ` · entrou pelo HUB (${cred.matricula})` : '');
  }

  const minutosDesde = iso => { const t = Date.parse(iso); return isNaN(t) ? Infinity : (Date.now() - t) / 60000; };
  const horaDe = iso => (iso || '').slice(11, 16) || '—';

  function avisos(r) {
    const out = [];
    if (r.exemplo) out.push('<div class="faixa info">Números de exemplo (a fonte ainda não está configurada no MAPI).</div>');
    if (r.referencia && r.referencia !== hojeISO()) out.push(`<div class="faixa">Dados de ${esc(dataBR(r.referencia))}: o resumo de hoje ainda não chegou (o painel coleta das 8h às 21h).</div>`);
    else if (r.defasado && r.aviso_defasagem) out.push(`<div class="faixa">${esc(r.aviso_defasagem)}</div>`);
    return out.join('');
  }

  function chipVar(pct, tend) {
    if (pct == null) return '';
    const t = tend || G.tendencia(pct);
    // ▲/▼ já dizem o sentido: o número vai sem sinal; no estável (●) o sinal fica
    const txt = t === 'estavel' ? fmtVar(pct) : fmtVar(Math.abs(pct)).replace('+', '');
    return `<span class="var ${esc(t)}">${SETA[t] || ''} ${esc(txt)}</span>`;
  }

  function card(c, destaque) {
    const valor = c.formato === 'pct' ? fmtPct(c.valor) : fmtNum(c.valor);
    const nome = c.legenda ? `${c.titulo} · ${c.legenda}` : c.titulo;
    const linha = [chipVar(c.variacao_pct, c.tendencia), c.projecao != null ? `projeção ${esc(fmtNum(c.projecao))}` : '',
      c.nota ? esc(c.nota) : '', c.pausado ? 'em manutenção no painel' : ''].filter(Boolean).join(' ');
    return `<div class="cA${destaque ? ' destaque' : ''}"><span class="n">${esc(nome)}</span><span class="v num">${esc(valor)}</span>${linha ? `<span class="l">${linha}</span>` : ''}</div>`;
  }

  function secao(s) {
    const cards = s.cards || [];
    let corpo;
    if (!cards.length) corpo = `<p class="vazio">${esc(s.aviso || 'Sem dados nesta seção agora.')}</p>`;
    else {
      const primeiro = s.serie && s.serie.faixas && s.serie.faixas.length ? cardGrafico(cards[0], s.serie) : card(cards[0], true);
      corpo = `${s.aviso ? `<p class="vazio">${esc(s.aviso)}</p>` : ''}<div class="gradeA">${primeiro}${cards.slice(1).map(c => card(c, false)).join('')}</div>`;
    }
    return `<section class="secA"><h3>${esc(s.titulo)} <span>${s.dados_ate ? 'até ' + esc(s.dados_ate) : ''}</span></h3>${corpo}</section>`;
  }

  // ---------- card do Total Geral com o gráfico ----------
  function cardGrafico(c, serie) {
    const dia = G.nomeDia(serie);
    if (comparar === 'dia' && !dia) comparar = 'geral';
    const geo = G.geometria(serie, comparar);
    // na comparação geral vale o número do painel (o do card); na do dia da semana, a conta é a mesma, com a outra média
    const pct = comparar === 'geral' ? c.variacao_pct : G.variacao(serie.hoje, serie.media_dia_semana);
    const ate = geo.u >= 0 ? serie.faixas[geo.u] : null;
    const txt = comparar === 'geral' ? 'vs média histórica' : `vs média das ${dia}`;
    const legMedia = comparar === 'geral' ? 'média histórica (todos os dias)' : `média das ${dia}`;
    const sel = faixaSel != null && faixaSel <= geo.u ? faixaSel : geo.u;
    return `<div class="cA destaque tg">
      <div class="cab"><div><span class="n">${esc(c.titulo)}</span><br><span class="v num">${esc(fmtNum(c.valor))}</span></div>
        ${dia ? `<div class="alterna" role="group" aria-label="Comparar com">
          <button type="button" data-cmp="geral" aria-pressed="${comparar === 'geral'}">geral</button>
          <button type="button" data-cmp="dia" aria-pressed="${comparar === 'dia'}">${esc(dia)}</button></div>` : ''}</div>
      <span class="l">${chipVar(pct)} ${pct != null ? esc(txt) : ''}</span>
      ${svgGrafico(geo, sel)}
      <div class="leg"><span><i style="background:var(--roxo2)"></i>hoje (acumulado)</span>${geo.media ? `<span><i class="tr"></i>${esc(legMedia)}</span>` : ''}</div>
      <span class="toque" id="faixaInfo">${faixaTxt(serie, geo, sel)}</span>
      ${c.projecao != null ? `<span class="toque">Projeção do dia: ${esc(fmtNum(c.projecao))}</span>` : ''}
    </div>`;
  }

  function svgGrafico(geo, sel) {
    const g = geo.grade.map(l => `<line x1="30" y1="${l.y.toFixed(1)}" x2="300" y2="${l.y.toFixed(1)}"/>`).join('');
    const ry = geo.rotulosY.map(l => `<text x="25" y="${(l.y + 3).toFixed(1)}" text-anchor="end">${esc(l.t)}</text>`).join('');
    const rx = geo.rotulosX.map(l => `<text x="${l.x.toFixed(1)}" y="125" text-anchor="middle">${esc(l.t)}</text>`).join('');
    const xs = sel != null && sel >= 0 ? geo.X(sel) : null;
    return `<svg viewBox="-16 0 326 128" role="img" aria-label="Total Geral acumulado de hoje contra a média" id="graf">
      <g stroke="var(--line)" stroke-width="1">${g}</g>${ry}${rx}
      ${xs != null ? `<line x1="${xs.toFixed(1)}" y1="8" x2="${xs.toFixed(1)}" y2="112" stroke="var(--ink3)" stroke-width="1" stroke-dasharray="2 3"/>` : ''}
      ${geo.media ? `<polyline fill="none" stroke="var(--ink3)" stroke-width="2" stroke-dasharray="4 3" points="${geo.media}"/>` : ''}
      ${geo.area ? `<polygon fill="var(--lil)" opacity=".8" points="${geo.area}"/>` : ''}
      ${geo.hoje ? `<polyline fill="none" stroke="var(--roxo2)" stroke-width="2.5" stroke-linejoin="round" points="${geo.hoje}"/>` : ''}
      ${geo.pontoMedia ? `<circle cx="${geo.pontoMedia.x.toFixed(1)}" cy="${geo.pontoMedia.y.toFixed(1)}" r="3" fill="var(--card)" stroke="var(--ink3)" stroke-width="2"/>` : ''}
      ${geo.pontoHoje ? `<circle cx="${geo.pontoHoje.x.toFixed(1)}" cy="${geo.pontoHoje.y.toFixed(1)}" r="4" fill="var(--roxo2)" stroke="var(--card)" stroke-width="2"/>` : ''}
      <rect x="30" y="0" width="270" height="128" fill="transparent" id="grafToque"/>
    </svg>`;
  }

  function faixaTxt(serie, geo, i) {
    if (i == null || i < 0) return 'Sem dado de hoje ainda.';
    const h = serie.hoje[i], acc = geo.accH[i], m = geo.accM ? geo.accM[i] : null;
    return `${esc(serie.faixas[i])}: ${esc(fmtNum(h))} na faixa · ${esc(fmtNum(acc))} no dia` + (m != null ? ` · média ${esc(fmtNum(Math.round(m)))}` : '') + ' · toque no gráfico para ver outra faixa';
  }

  function ligarGrafico() {
    document.querySelectorAll('[data-cmp]').forEach(b => { b.onclick = () => { comparar = b.dataset.cmp; desenhar(); }; });
    const alvo = $('grafToque'), svg = $('graf');
    if (!alvo || !svg) return;
    const serie = (resumo.secoes.find(s => s.serie) || {}).serie;
    alvo.addEventListener('click', ev => {
      const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const x = p.matrixTransform(svg.getScreenCTM().inverse()).x;
      const n = serie.faixas.length, u = G.ultimoIdx(serie.hoje);
      faixaSel = Math.max(0, Math.min(u, Math.round((x - 30) / 270 * (n - 1))));
      desenhar();
    });
  }

  // ---------- falhas massivas ----------
  function telaFalhas(f) {
    const lista = f.lista || [];
    const itens = lista.length ? lista.map(a => `<div class="falha">
        <b>${esc(a.sistema || '—')}</b>
        <span class="l">${esc(a.falha || '')}${a.criticidade ? ` <span class="crit">${esc(a.criticidade)}</span>` : ''}</span>
        <span class="l">Desde ${esc(a.inicio || '—')}${a.duracao ? ' · há ' + esc(a.duracao) : ''}</span>
        ${a.segmento && a.segmento !== '—' ? `<span class="l">Segmento: ${esc(a.segmento)}</span>` : ''}
      </div>`).join('') : `<p class="vazio">${esc(SEM_FALHAS)}</p>`;
    return `<section class="secA"><h3>Falhas massivas <span>${esc(fmtNum(f.abertas || 0))} aberta(s) · ${esc(fmtNum(f.hoje || 0))} hoje</span></h3>
      ${itens}<a class="bt sec" href="${esc(PROB_URL)}">Abrir o Problemas Sistêmicos</a></section>`;
  }

  // ---------- início ----------
  function iniciar() {
    $('btHub').href = HUB_URL;
    $('btAtualizar').onclick = () => carregar();
    $('nav').querySelectorAll('button').forEach(b => { b.onclick = () => { aba = b.dataset.aba; desenhar(); window.scrollTo(0, 0); }; });
    if (K.VERSAO !== APP_VERSION) {         // arquivos de versões diferentes no cache: atualiza antes de abrir
      telaAviso('Atualizando', 'Uma versão nova do app chegou. Recarregando…', false);
      setTimeout(() => location.reload(), 1500);
      return;
    }
    carregar();
    setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, CONFERIR_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') carregar(); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.URAApp = { APP_VERSION };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
