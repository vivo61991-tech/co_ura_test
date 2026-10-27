# CO_URA — URA · Visão Geral

App web instalável no celular (PWA) com o resumo da URA do dia: os mesmos cards do e-mail de Comunicação → URA no MAPI,
o gráfico do Total Geral por faixa de 30 min (hoje × média geral ou do dia da semana) e as falhas massivas abertas.
Publicado pelo GitHub Pages em <https://wro1984.github.io/CO_URA/> a partir da branch `main`. **Todo push na `main` vai
para o ar em cerca de 1 minuto**, para todos os usuários.

**Topo padrão dos apps** (igual no Problemas Sistêmicos e no Nível de Serviço): botão de voltar ao HUB (ícone de grade,
`#btHub`) à esquerda, botões do app à direita. No desktop o topo e o menu de baixo ficam na coluna de 760 px do conteúdo.

Leia este arquivo inteiro antes de mudar qualquer coisa.

## Como funciona

```
painel da URA ──► agente (repo ura) ──► .54 ──► MAPI (ura_app.py) ──► dados.json CIFRADO ──► este repo ──► app no celular
(Streamlit)       cards + série          resumo   + falhas massivas     (commit automático)                login do HUB
```

- O repositório e o site são **públicos**. Os números só existem aqui **cifrados**, no `dados.json`.
- Quem gera e publica o `dados.json` é o **MAPI** (repositório `wro1984/mapi5`, `ura_app.py`, ver `URA_APP.md` de lá),
  no intervalo configurado em Comunicação → URA · App.
- **Não há chave própria**: o app abre com a credencial que o HUB dos apps (<https://wro1984.github.io/>) guardou no
  IndexedDB `co-hub-acesso` deste endereço. Quem vê o app é definido no perfil do HUB (app `ura`).

## Regras que não podem ser quebradas

1. **Nunca editar, apagar ou "consertar" o `dados.json`.** Ele é sobrescrito pelo MAPI várias vezes por hora.
2. **Nunca commitar dados abertos nem segredos** (números reais, prints, JSON decifrado, chaves, tokens). O histórico do
   git é público. Para testar, use `tests/fixtures/pacote.json` (dados inventados, gerado pelo próprio MAPI).
3. **Não mudar o formato da criptografia sozinho.** `cripto.js` precisa continuar igual ao que o MAPI gera em `ura_app.py`:
   - `dados.json`: `{app:"co-ura", v:1, gerado_em, hub:{acessos:{id_hub:{salt, iv, ct}}}, dados:{iv, ct}}`;
   - `id_hub` = SHA-256 de `"hub:" + MATRÍCULA`, `salt` = o do HUB (diferente: a chave do HUB foi trocada);
   - `ct` do acesso = a chave dos dados (AES-GCM 256) cifrada com a chave do HUB; `dados.ct` = o JSON do resumo.
   Mudança aqui tem que ser feita **junto** no MAPI.
4. **A credencial do HUB só é LIDA**: nunca apagar, copiar ou criar o banco `co-hub-acesso` (sair de todos os apps é no HUB).
5. **O service worker (`sw.js`) só mexe no que é deste app**: caches que começam com `co-ura-v` e pedidos dentro de
   `/CO_URA/`. Outros apps moram no mesmo endereço; apagar o cache deles quebra o offline de todo mundo.
6. **Não carregar nada de fora**: sem CDNs, fontes externas, analytics (o `index.html` tem CSP `default-src 'self'`).
7. Acesso perdido (sem o app no perfil, chave do HUB trocada): o app apaga a cópia cifrada do `dados.json` do cache.

## Onde mexer

| Quero mudar… | Onde |
|---|---|
| Cores, tamanhos, modo escuro | `<style>` no `index.html` (variáveis em `:root`) |
| Cards, seções, avisos, tela de falhas | `app.js` (`secao()`, `card()`, `avisos()`, `telaFalhas()`) |
| Gráfico do Total Geral | `cardGrafico()` / `svgGrafico()` em `app.js`; contas em `grafico.js` |
| Regra da seta/cor (▲ > +15%, ▼ < −5%) | `tendencia()` em `grafico.js` (igual ao painel e ao MAPI) |
| **Quais cards vêm, valores, médias** | **não é aqui**: é o agente do painel (repo `ura`) e o `ura_app.py` do MAPI |

A variação "vs média histórica" é a do próprio card do painel. A "vs média das segundas" (ou do dia) é a mesma conta com a
média do dia da semana, feita em `grafico.js` (`variacao`). No sábado e no domingo o botão não aparece (o painel não tem a média).

## Antes de cada push

1. **Versão igual** em `APP_VERSION` (`app.js`), `VERSAO` (`cripto.js`), `VERSION` (`sw.js`) e nos `?v=` do `index.html`.
   Com versões diferentes o app se recarrega até elas baterem.
2. Arquivo novo que o app usa? Inclua em `CORE` no `sw.js`.
3. `npm test` e teste no navegador em ~390 px, claro e escuro.
4. `git pull` antes do push (o MAPI faz commits no `dados.json`). Use merge, não force-push.

## Testar localmente, sem dados reais

```
# pacote de teste com as funções do MAPI (dados inventados), pessoa A0001 / lago-vento-pedra
MAPI_DIR=../mapi5 python tests/gerar_fixture.py
mkdir -p /tmp/site/CO_URA && cp -r index.html *.js manifest.webmanifest icons /tmp/site/CO_URA/
python -c "import json;json.dump(json.load(open('tests/fixtures/pacote.json'))['pacote'],open('/tmp/site/CO_URA/dados.json','w'))"
cd /tmp/site && python -m http.server 8000          # http://localhost:8000/CO_URA/
```

Sem a credencial do HUB no navegador o app mostra "Entre pelo HUB". Para testar, sirva também o HUB na raiz com um
`hub.json` de teste da mesma pessoa, ou grave a credencial no IndexedDB (veja `credDoHub()` em `tests/cripto.test.js`).
**Não commite** um `dados.json` de teste no lugar do publicado pelo MAPI.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | estrutura, estilos (paleta da empresa, modo escuro), CSP |
| `app.js` | telas: Visão Geral (seções e cards, gráfico no Total Geral) e Falhas; conferência a cada minuto |
| `grafico.js` | contas do gráfico (acumulado, variação, escala); roda também no Node |
| `cripto.js` | lê a credencial do HUB e abre o `dados.json` |
| `sw.js` | cache offline só deste app |
| `manifest.webmanifest`, `icons/` | instalação no celular |
| `tests/` | criptografia (pacote do MAPI), gráfico e versões |
| `dados.json` | **gerado pelo MAPI — não editar** |
