"""Gera tests/fixtures/pacote.json com as funções do PRÓPRIO MAPI (ura_app.py), com dados inventados.

    MAPI_DIR=/caminho/do/mapi5 python tests/gerar_fixture.py

A pessoa de teste é A0001 / lago-vento-pedra (a mesma do pacote de exemplo do HUB). Os números são os de exemplo do
MAPI (ura_fonte.exemplo + ura_app.exemplo_serie): nada real.
"""
import base64
import json
import os
import sys

sys.path.insert(0, os.environ["MAPI_DIR"])
import hub  # noqa: E402
import ura_app  # noqa: E402
import ura_fonte  # noqa: E402

MAT, CHAVE = "A0001", "lago-vento-pedra"
salt = os.urandom(16)
pessoa = {"matricula": MAT, "salt": salt, "chave": hub.chave_do_codigo(CHAVE, salt), "push_secret": None}
resumo = ura_fonte.exemplo()
# números trocados por outros inventados (o exemplo do MAPI vem de um print antigo do painel): só o formato importa
for i, s in enumerate(resumo["secoes"]):
    for j, c in enumerate(s["cards"]):
        c["valor"] = round(3.3, 1) if c.get("formato") == "pct" else 100 + 37 * (i + 1) * (j + 3)
        if c.get("variacao_pct") is not None:
            c["variacao_pct"] = [-12.5, 3.2, 21.7, -7.4][(i + j) % 4]
            c["tendencia"] = "baixa" if c["variacao_pct"] < -5 else "alta" if c["variacao_pct"] > 15 else "estavel"
        if c.get("projecao") is not None:
            c["projecao"] = c["valor"] + 50
resumo["secoes"][0]["serie"] = ura_app.exemplo_serie()
conteudo = ura_app.montar_conteudo(resumo, {"ok": True, "abertas": 1, "hoje": 2, "lista": [
    {"sistema": "SISTEMA EXEMPLO A", "falha": "Lentidão", "criticidade": "ALTA", "inicio": "30/09/2026 08:12",
     "duracao": "2h 0min", "segmento": "B2C"}]})
pacote = ura_app.montar_pacote(conteudo, [pessoa])
saida = {"hub": {"matricula": MAT, "chave": CHAVE, "salt": base64.b64encode(salt).decode(), "iter": hub.ITERACOES},
         "pacote": pacote, "esperado": conteudo}
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "pacote.json")
with open(destino, "w", encoding="utf-8") as f:
    json.dump(saida, f, ensure_ascii=False, indent=1)
print("gravado:", destino)
