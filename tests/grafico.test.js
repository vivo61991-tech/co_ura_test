// Gráfico do Total Geral: acumulado, variação contra a média e escala.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../grafico.js');

const serie = { faixas: ['08:00', '08:30', '09:00', '09:30'], hoje: [10, 20, 30, null], media_geral: [20, 20, 20, 20],
  dia_semana: 'segunda', media_dia_semana: [10, 20, 30, 40] };

test('acumulado para na última faixa com dado', () => {
  assert.deepStrictEqual(G.acumulado(serie.hoje, G.ultimoIdx(serie.hoje)), [10, 30, 60, null]);
  assert.strictEqual(G.ultimoIdx([null, null]), -1);
});

test('variação compara as mesmas faixas', () => {
  assert.strictEqual(G.variacao(serie.hoje, serie.media_geral), 0);          // 60 vs 60
  assert.strictEqual(G.variacao(serie.hoje, [40, 40, 40, 40]), -50);
  assert.strictEqual(G.variacao(serie.hoje, null), null);
  assert.strictEqual(G.variacao([null], [1]), null);
});

test('regra da seta igual à do painel', () => {
  assert.strictEqual(G.tendencia(15.1), 'alta');
  assert.strictEqual(G.tendencia(15), 'estavel');
  assert.strictEqual(G.tendencia(-5), 'estavel');
  assert.strictEqual(G.tendencia(-5.1), 'baixa');
});

test('escala redonda', () => {
  assert.strictEqual(G.topo(4747), 5000);
  assert.strictEqual(G.topo(5683), 6000);
  assert.strictEqual(G.topo(8100), 10000);
  assert.strictEqual(G.topo(180), 200);
  assert.strictEqual(G.topo(0), 1);
});

test('geometria: hoje até a faixa atual, média o dia todo', () => {
  const g = G.geometria(serie, 'geral');
  assert.strictEqual(g.u, 2);
  assert.strictEqual(g.hoje.split(' ').length, 3);
  assert.strictEqual(g.media.split(' ').length, 4);
  assert.ok(g.pontoHoje.y <= 112 && g.pontoHoje.y >= 8);
  const sem = G.geometria(Object.assign({}, serie, { media_geral: null }), 'geral');
  assert.strictEqual(sem.media, '');
});

test('rótulos das horas não se encavalam', () => {
  const f = []; for (let h = 8; h <= 21; h++) { f.push(String(h).padStart(2, '0') + ':00'); if (h < 21) f.push(String(h).padStart(2, '0') + ':30'); }
  const g = G.geometria({ faixas: f, hoje: f.map(() => 1), media_geral: null }, 'geral');
  assert.deepStrictEqual(g.rotulosX.map(r => r.t), ['08h', '12h', '16h', '21h']);
});

test('botão do dia da semana só de segunda a sexta', () => {
  assert.strictEqual(G.nomeDia(serie), 'segundas');
  assert.strictEqual(G.nomeDia(Object.assign({}, serie, { dia_semana: 'Terça' })), 'terças');
  assert.strictEqual(G.nomeDia(Object.assign({}, serie, { media_dia_semana: null })), null);
});
