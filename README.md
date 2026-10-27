# URA · Evolução

PWA que mostra a **evolução das chamadas da URA a cada 30 minutos**, comparando o dia de
hoje com a média geral e com a média do mesmo dia da semana, em dois gráficos de mesma estrutura.

Identidade visual (cores, tipografia, topo e cartões) baseada no app **Problemas Sistêmicos**.

## Dados

Lê o arquivo **`data.txt`** (TSV, cabeçalho na 1ª linha: `# · referencia · coletado_em ·
dados_ate · versao · payload`). O `payload` é o JSON do dia; a série de 30 em 30 min fica na
seção `registro_dia` (`serie.hoje`, `serie.media_geral`, `serie.media_dia_semana`, `serie.faixas`).

Apenas o **dia mais recente** traz a série por faixa; os dias anteriores guardam só os totais.
Por isso o app foca no dia corrente.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | estrutura, estilos (paleta da empresa, modo escuro), CSP |
| `grafico.js` | contas do gráfico (escala, variação, geometria); roda também no Node |
| `app.js` | lê o `data.txt`, monta os dois gráficos, toque para inspecionar a faixa |
| `sw.js` | cache offline só deste app (`co-ura-v…`) |
| `manifest.webmanifest`, `icons/` | instalação no celular |

## Versão

`1.0.0` — igual em `app.js` (`APP_VERSION`), `sw.js` (`VERSION`) e nos `?v=` do `index.html`.
