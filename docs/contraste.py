#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Contraste WCAG 2.1 AA dos pares reais do Portal do Parceiro.

    py -3 docs/contraste.py

Sai com codigo 1 se algum par ficar abaixo do minimo. Serve de portao: cor nova
que alguem acrescentar sem conferir reprova aqui, em vez de chegar na tela de
uma autorizada.

POR QUE EXISTE
    A auditoria de 10/09/2026 mediu 32 pares e reprovou 20 -- entre eles o botao
    principal do app, branco sobre ciano claro, em 2,00:1. Sem um verificador a
    auditoria seria a foto de um dia so.

COMO LER
    Contraste e propriedade de um PAR, nunca de uma cor sozinha. Cada linha de
    PARES diz onde o par aparece na tela: se um dia o par deixar de existir,
    apague a linha; se aparecer um novo, acrescente. A tabela e a documentacao.

    Fundo com alpha e COMPOSTO sobre o fundo de baixo antes do calculo. Um badge
    com rgba(...,.12) sobre card branco nao e a cor pura -- e o resultado da
    mistura, e e contra ele que o texto precisa contrastar.

MINIMOS (WCAG 2.1 AA)
    4.5  texto normal            (< 18,66px bold ou < 24px)
    3.0  texto grande            (>= 18,66px bold, >= 24px)
    3.0  componente / estado     (1.4.11 non-text contrast: borda de campo,
                                  anel de foco, grafico de progresso)

FORA DE ESCOPO, DE PROPOSITO
    Fundo decorativo e divisoria (borda de card, separador de tabela): a 1.4.11
    cobre o que identifica um CONTROLE, nao enfeite. Documento de impressao: tem
    paleta propria em hex, e papel nao e tela.
"""
from __future__ import division

import io
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(AQUI, os.pardir, "index.html")

# --------------------------------------------------------------------------
# Os pares. (rotulo, frente, fundo, minimo, onde aparece)
#   frente/fundo: 'var(--x)', '#RRGGBB', ou ('rgba', r, g, b, a, fundo_de_baixo)
# --------------------------------------------------------------------------
CARD = "var(--surface)"
TINTA = lambda r, g, b, a: ("rgba", r, g, b, a, CARD)

PARES = [
    # ---- sistema: texto -------------------------------------------------
    ("--text no card",            "var(--text)",       CARD,               4.5, "corpo de texto em .card"),
    ("--text no fundo",           "var(--text)",       "var(--bg)",        4.5, "texto fora de card"),
    ("--text no campo",           "var(--text)",       "var(--surface2)",  4.5, "input, select, textarea"),
    ("--text no botao primario",  "var(--text)",       "var(--primary)",   4.5, ".btn-primary"),
    ("--text no botao hover",     "var(--text)",       "var(--primary-h)", 4.5, ".btn-primary:hover"),
    ("--text-m no card",          "var(--text-m)",     CARD,               4.5, ".text-muted, celula de tabela, thead"),
    ("--text-m no campo",         "var(--text-m)",     "var(--surface2)",  4.5, "chip inativo, cabecalho do accordion"),
    ("--text-m no fundo",         "var(--text-m)",     "var(--bg)",        4.5, ".empty-state fora de card"),
    ("--text-muted no card",      "var(--text-muted)", CARD,               4.5, "cabecalhos de tabela escritos inline no JS"),

    # ---- sistema: componente -------------------------------------------
    ("borda de campo",            "var(--border-campo)", "var(--surface2)", 3.0, "limite visual de input/select/textarea"),
    ("borda de campo no card",    "var(--border-campo)", CARD,              3.0, "campos com estilo inline"),
    # O anel deixou de valer so para o que esta dentro de .form-group: com
    # :focus-visible ele alcanca botao, link e os campos de estilo inline, que
    # antes caiam no anel padrao do navegador (ambar #E59700, 2,4:1). Sao tres
    # superficies, e cada uma e um par.
    ("anel de foco no campo",     "var(--primary-txt)",  "var(--surface2)", 3.0, ":focus-visible sobre o fundo do campo"),
    ("anel de foco no card",      "var(--primary-txt)",  CARD,              3.0, ":focus-visible de botao em card e em modal"),
    ("anel de foco no fundo",     "var(--primary-txt)",  "var(--bg)",       3.0, ":focus-visible de botao solto na pagina"),
    ("passo ativo do wizard",     "var(--primary-txt)",  "var(--border)",   3.0, ".step-dot.active na barra de passos"),

    # ---- alerta: texto sobre branco ------------------------------------
    ("--success no card",         "var(--success)",    CARD,               4.5, ".text-success, toast de sucesso"),
    ("--warning no card",         "var(--warning)",    CARD,               4.5, ".text-warning, teto estourado"),
    ("--danger no card",          "var(--danger)",     CARD,               4.5, ".text-danger, toast de erro"),
    ("--paid no card",            "var(--paid)",       CARD,               4.5, "valor pago"),
    ("--primary-txt no card",     "var(--primary-txt)", CARD,              4.5, "link, .text-primary, codigo do servico, km do encaminhamento"),

    # ---- alerta: branco sobre cor cheia --------------------------------
    ("branco no --danger",        "#FFFFFF",           "var(--danger)",    4.5, ".nav-badge (contador), .btn-danger"),

    # ---- alerta: texto na tinta do badge -------------------------------
    ("--primary-txt no badge",    "var(--primary-txt)", TINTA(79, 195, 247, .12), 4.5, "badge Aberta, badge novo dos recebidos"),
    ("--success no badge",        "var(--success)",     TINTA(76, 175, 80, .12),  4.5, "badge Aprovada"),
    ("--warning no badge",        "var(--warning)",     TINTA(255, 167, 38, .12), 4.5, "badge Em analise"),
    ("--danger no badge",         "var(--danger)",      TINTA(239, 83, 80, .12),  4.5, "badge Cancelada, motivo sem a peca"),
    ("--paid no badge",           "var(--paid)",        TINTA(171, 71, 188, .12), 4.5, "badge Fechada, badge encaminhado"),
    ("--text-m no badge",         "var(--text-m)",      ("rgba", 0, 0, 0, .06, CARD), 4.5, "badge Rascunho"),
    ("--primary-txt no chip",     "var(--primary-txt)", TINTA(79, 195, 247, .10), 4.5, "aba ativa, chip de filtro, + Adicionar servico"),
    ("--text no card de aviso",   "var(--text)",        TINTA(79, 195, 247, .10), 4.5, "cards de explicacao (primary-bg)"),

    # ---- avisos laranja escritos a mao (nao usam token) ----------------
    ("aviso laranja: corpo",      "#7A5410",           "#FFF4E5",          4.5, "Complete seu cadastro, sem localizacao no mapa"),
    ("aviso laranja: titulo",     "#8A5A00",           "#FFF4E5",          4.5, "titulo do aviso de cadastro"),
]


# --------------------------------------------------------------------------
def tokens_do_root(caminho):
    """Le as custom properties do :root. Resolve alias (--a: var(--b))."""
    txt = io.open(caminho, encoding="utf-8").read()
    bloco = re.search(r":root\s*\{(.*?)\}", txt, re.S)
    if not bloco:
        sys.exit("nao achei o bloco :root em %s" % caminho)
    # Os comentarios do :root explicam cada escolha e citam nomes de token
    # ("...continuam em --border: aquilo e decoracao"). Sem tirar os comentarios
    # primeiro, a linha de comentario e lida como declaracao: o valor de
    # --border vira a frase, e a declaracao seguinte desaparece dentro dela.
    corpo = re.sub(r"/\*.*?\*/", "", bloco.group(1), flags=re.S)
    # Declaracao comeca a linha -- nao no meio de texto solto.
    crus = dict(re.findall(r"(?m)^\s*--([\w-]+)\s*:\s*([^;]+);", corpo))
    resolvido = {}
    for nome in crus:
        valor, voltas = crus[nome].strip(), 0
        while valor.startswith("var(") and voltas < 10:
            alvo = valor[4:].split(")")[0].strip().lstrip("-")
            if alvo not in crus:
                break
            valor, voltas = crus[alvo].strip(), voltas + 1
        resolvido[nome] = valor
    return resolvido


def rgb(cor, tk):
    if isinstance(cor, tuple):          # ('rgba', r,g,b,a, fundo)
        _, r, g, b, a, base = cor
        br, bg, bb = rgb(base, tk)
        return (r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a))
    if cor.startswith("var("):
        nome = cor[4:].split(")")[0].strip().lstrip("-")
        if nome not in tk:
            sys.exit("token --%s nao existe no :root (usado por um par)" % nome)
        cor = tk[nome]
    cor = cor.strip()
    m = re.match(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", cor)
    if m:
        return tuple(float(x) for x in m.groups())
    h = cor.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(float(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def luminancia(c):
    def canal(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2])


def razao(a, b):
    la, lb = luminancia(a), luminancia(b)
    if lb > la:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)


def hexof(c):
    return "#%02X%02X%02X" % tuple(int(round(v)) for v in c)


# --------------------------------------------------------------------------
# Uso PROIBIDO de token. A tabela PARES confere a matematica dos pares que eu
# declarei -- ela nao tem como saber que um elemento esta usando o token
# errado. Estas regras cobrem justamente isso: sao os tons que existem no
# :root para papel decorativo e que nao podem virar cor de texto.
#
# Foi assim que .sidebar-label e .modal-close passaram batido na primeira
# passada: os pares fechavam, mas as duas regras usavam --text-d como cor de
# texto, 2,67:1.
# --------------------------------------------------------------------------
PROIBIDOS = [
    (r"color\s*:\s*var\(--text-d\)",
     "--text-d (2,67:1) como cor de TEXTO. Ele existe para o decorativo: "
     "traco de svg e seta do accordion. Texto cinza usa --text-m."),
    (r"background\s*:\s*var\(--primary\)\s*;\s*color\s*:\s*#(fff|FFF|ffffff|FFFFFF)\b",
     "branco sobre o ciano da marca (2,00:1). O rotulo em cima de --primary "
     "e --text."),
]


def usos_proibidos(caminho):
    """Procura no arquivo inteiro (CSS e style inline do JS)."""
    txt = io.open(caminho, encoding="utf-8").read()
    # `stroke:` continua livre -- a proibicao e sobre `color:`.
    achados = []
    for i, linha in enumerate(txt.split("\n"), 1):
        for padrao, motivo in PROIBIDOS:
            if re.search(padrao, linha):
                achados.append((i, motivo, linha.strip()[:100]))
    return achados


def main():
    tk = tokens_do_root(HTML)
    print("Portal do Parceiro -- contraste WCAG 2.1 AA")
    print("%d tokens no :root, %d pares declarados\n" % (len(tk), len(PARES)))
    reprovados = []
    for rotulo, frente, fundo, minimo, onde in PARES:
        f, b = rgb(frente, tk), rgb(fundo, tk)
        r = razao(f, b)
        ok = r >= minimo
        if not ok:
            reprovados.append((rotulo, r, minimo, onde))
        print("%-28s %-9s sobre %-9s %6.2f:1  min %.1f  %s" % (
            rotulo, hexof(f), hexof(b), r, minimo, "ok" if ok else "REPROVA"))
    print("")
    proibidos = usos_proibidos(HTML)
    if proibidos:
        print("%d USO(S) PROIBIDO(S) DE TOKEN:" % len(proibidos))
        for linha, motivo, trecho in proibidos:
            print("  linha %-5d %s" % (linha, motivo))
            print("            %s" % trecho)
        print("")
    if reprovados:
        print("%d PAR(ES) ABAIXO DO MINIMO:" % len(reprovados))
        for rotulo, r, minimo, onde in reprovados:
            print("  %-28s %.2f:1 (precisa de %.1f) -- %s" % (rotulo, r, minimo, onde))
    if reprovados or proibidos:
        return 1
    print("todos os %d pares passam AA, e nenhum uso proibido de token." % len(PARES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
