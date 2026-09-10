# -*- coding: utf-8 -*-
"""Confere as chamadas ico() do app: a FORMA e o DESTINO.

    py -3 docs/verifica_icones.py        (sai com codigo 1 se achar problema)

Existe porque este erro nao da erro de sintaxe, nao aparece em revisao de
codigo e, no pior caso, nao aparece nem na primeira renderizacao da tela.
Ja custou 14 defeitos reais nesta base. Sao dois erros diferentes:

1. FORMA -- ico() devolve string, entao a chamada precisa ficar em CODIGO, e a
   forma depende de onde o markup esta sendo montado:

       template literal   ->  `... ${ico('x', 14)} ...`
       aspas simples      ->  '... ' + ico('x', 14) + ' ...'
       aspas duplas       ->  "... " + ico('x', 14) + " ..."

   Usar a forma errada NAO da erro em nenhuma das duas direcoes:
     - ${ico(..)} dentro de aspas simples  -> a tela mostra  ${ico('x', 14)}
     - ' + ico(..) + ' dentro de template  -> a tela mostra  ' + ico('x', 14) + '
   A regra que cobre as duas: o texto "ico(" tem de estar em contexto de
   codigo, nunca dentro de uma string.

2. DESTINO -- a forma pode estar certa, o ico() executar, e o svg AINDA assim
   sair como texto na tela, porque foi entregue num lugar que nao renderiza
   markup: .textContent, .innerText, esc(), ou valor de atributo de texto
   (title, alt, placeholder). Foi assim que 12 botoes mostraram o <svg>
   inteiro escrito: o markup inicial usava innerHTML e funcionava, e o defeito
   so aparecia DEPOIS do clique, quando o rotulo era restaurado.

O analisador de contexto abaixo trata expressao regular literal, e isso nao e
detalhe: todo modulo tem um esc() com /[&<>"']/g, e ler aquelas aspas como
abertura de string desincroniza o analisador do arquivo inteiro.
"""
from __future__ import division

import io
import os
import re
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.abspath(os.path.join(AQUI, os.pardir))

CODE, SQ, DQ, TPL, LINHA, BLOCO, INTERP, REGEX = (
    "codigo", "aspa-simples", "aspa-dupla", "template",
    "comentario", "comentario-bloco", "interpolacao", "regex")

_ANTES_DE_REGEX = set("(,=:[!&|?{};+-*%~^<>\n\t ")
_PALAVRAS = ("return", "typeof", "case", "in", "of", "new", "delete", "void")


def _abre_regex(src, i):
    j = i - 1
    while j >= 0 and src[j] in " \t":
        j -= 1
    if j < 0:
        return True
    if src[j] in _ANTES_DE_REGEX:
        return True
    k = j
    while k >= 0 and (src[k].isalpha() or src[k] == "_"):
        k -= 1
    return src[k + 1:j + 1] in _PALAVRAS


def mapa_de_contexto(src):
    """Para cada posicao de src, dentro de que string (ou nao) ela esta."""
    ctx = [CODE] * len(src)
    pilha = [[CODE, 0]]
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        tipo = pilha[-1][0]
        ctx[i] = CODE if tipo in (CODE, INTERP) else tipo

        if tipo in (SQ, DQ, TPL):
            if c == "\\":
                if i + 1 < n:
                    ctx[i + 1] = tipo
                i += 2
                continue
            if (tipo == SQ and c == "'") or (tipo == DQ and c == '"') or (tipo == TPL and c == "`"):
                pilha.pop(); i += 1; continue
            if tipo == TPL and c == "$" and i + 1 < n and src[i + 1] == "{":
                ctx[i + 1] = tipo
                pilha.append([INTERP, 0]); i += 2; continue
            i += 1; continue

        if tipo == LINHA:
            if c == "\n":
                pilha.pop()
            i += 1; continue

        if tipo == BLOCO:
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                ctx[i + 1] = tipo
                pilha.pop(); i += 2; continue
            i += 1; continue

        if tipo == REGEX:
            if c == "\\":
                if i + 1 < n:
                    ctx[i + 1] = tipo
                i += 2; continue
            if c == "[":
                pilha[-1][1] = 1              # dentro de classe, / nao termina
            elif c == "]":
                pilha[-1][1] = 0
            elif c == "/" and pilha[-1][1] == 0:
                pilha.pop()
            elif c == "\n":
                pilha.pop()                   # regex nao atravessa linha: era divisao
            i += 1; continue

        # ---- codigo, ou dentro de ${ } ----
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            pilha.append([LINHA, 0]); i += 1; continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            pilha.append([BLOCO, 0]); i += 1; continue
        if c == "/" and _abre_regex(src, i):
            pilha.append([REGEX, 0]); i += 1; continue
        if c == "'":
            pilha.append([SQ, 0]); i += 1; continue
        if c == '"':
            pilha.append([DQ, 0]); i += 1; continue
        if c == "`":
            pilha.append([TPL, 0]); i += 1; continue
        if tipo == INTERP:
            # chave conta SO aqui: e o que fecha a interpolacao. Contar chave de
            # bloco tambem fazia a interpolacao "fechar" no lugar errado.
            if c == "{":
                pilha[-1][1] += 1
            elif c == "}":
                if pilha[-1][1] == 0:
                    pilha.pop()
                else:
                    pilha[-1][1] -= 1
        i += 1
    return ctx


CHAMADA = re.compile(r"(?<![A-Za-z0-9_$.])ico\(")
SUMIDOUROS = [
    (re.compile(r"\.(?:textContent|innerText)\s*=\s*([^;\n]*)"), "textContent/innerText imprime como texto"),
    (re.compile(r'\b(?:title|alt|placeholder)="[^"]*?(?<![A-Za-z0-9_$.])ico\('), "valor de atributo de texto"),
]


def _dentro_dos_parenteses(fonte, abre):
    """Do '(' em `abre` ate o ')' que o fecha. Regex nao serve aqui: esc()
    recebe expressoes com parenteses dentro, e um regex guloso atravessava a
    chamada e acusava qualquer ico() do resto da linha."""
    prof, i = 0, abre
    while i < len(fonte):
        if fonte[i] == "(":
            prof += 1
        elif fonte[i] == ")":
            prof -= 1
            if prof == 0:
                return fonte[abre:i + 1]
        elif fonte[i] == "\n" and prof <= 0:
            break
        i += 1
    return fonte[abre:i]


def arquivos():
    """Descobre o formato do app: um index.html so, ou core.js + modules/."""
    mods = os.path.join(RAIZ, "modules")
    if os.path.isdir(mods):
        return ["core.js"] + ["modules/" + f for f in sorted(os.listdir(mods))
                              if f.endswith(".js") and f != "icones.js"]
    return ["index.html"]


def pedacos(arq, t):
    """So o JS: num .html, o conteudo de cada <script> inline."""
    if not arq.endswith(".html"):
        return [(0, t)]
    saida = []
    for m in re.finditer(r"<script(?:\s[^>]*)?>", t):
        fim = t.find("</script>", m.end())
        if fim > 0:
            saida.append((m.end(), t[m.end():fim]))
    return saida


def main():
    problemas = 0
    chamadas = 0
    for arq in arquivos():
        p = os.path.join(RAIZ, arq)
        if not os.path.isfile(p):
            continue
        t = io.open(p, encoding="utf-8").read()
        for desloca, fonte in pedacos(arq, t):
            ctx = mapa_de_contexto(fonte)
            linha_de = lambda k: t[:desloca + k].count("\n") + 1

            # ---- 1) forma
            for m in CHAMADA.finditer(fonte):
                chamadas += 1
                c = ctx[m.start()]
                if c in (CODE, LINHA, BLOCO):
                    continue
                ini = fonte.rfind("\n", 0, m.start()) + 1
                print("  FORMA   %s:%d  esta dentro de %s\n     %s"
                      % (arq, linha_de(m.start()), c,
                         fonte[ini:fonte.find("\n", m.start())].strip()[:140]))
                problemas += 1

            # ---- 2) destino
            for rx, motivo in SUMIDOUROS:
                for m in rx.finditer(fonte):
                    if not CHAMADA.search(m.group(0)):
                        continue
                    print("  DESTINO %s:%d  %s\n     %s"
                          % (arq, linha_de(m.start()), motivo, m.group(0).strip()[:140]))
                    problemas += 1
            for m in re.finditer(r"(?<![A-Za-z0-9_$.])esc\(", fonte):
                dentro = _dentro_dos_parenteses(fonte, m.end() - 1)
                if CHAMADA.search(dentro):
                    print("  DESTINO %s:%d  esc() escaparia o svg\n     esc%s"
                          % (arq, linha_de(m.start()), dentro.strip()[:132]))
                    problemas += 1

    print()
    if problemas:
        print("%d problema(s) em %d chamadas ico()." % (problemas, chamadas))
        return 1
    print("as %d chamadas ico() estao na forma certa e vao para um destino que "
          "renderiza markup." % chamadas)
    return 0


if __name__ == "__main__":
    sys.exit(main())
