# STATUS — Portal Rede Autorizada (parceiro-stonni)

> Atualizado: 2026-09-10

## O que é
Portal do **parceiro da rede de assistência técnica autorizada Stonni**: o parceiro abre OS, consulta material técnico, controla o próprio estoque de peças, compra peças e vê o financeiro dele.

## Onde está
- **Clone real (git):** `C:\CLAUDE\Projetos GitHub\parceiro-stonni` (remote `leobononi2906/parceiro-stonni`, branch `main`). *(Desaninhado de `assistencia\` em 11/08/2026.)*
- **Deploy:** https://parceiro-stonni.vercel.app (chave de acesso no Hub = `rede-autorizada`) · push na `main` → Vercel automático.
- **Supabase:** `vishxwdxqiygbxmtpfoy` (prefixo `prt_`).
- **Código:** `index.html` único (~196KB). Sem build. `vercel.json` com SPA rewrite + headers de segurança (X-Frame-Options DENY, nosniff). Chama Supabase por `fetch` em `/rest/v1/`.

## 10/09/2026 — Contraste AA, ícones no lugar dos emojis, acessibilidade

A auditoria mediu **32 pares reais de cor e reprovou 20**. Não eram casos de borda: o botão
principal era branco sobre o ciano claro, **2,00:1** — o mínimo AA para texto é 4,5. Hoje
são **30 pares medidos, 30 passando**, e há script no repo para não escorregar de novo:

```
py -3 docs/contraste.py     # sai com erro se algum par cair abaixo do mínimo
```

**A decisão que salvou a identidade.** Escurecer o ciano `#4FC3F7` até dar 4,5:1 com texto
branco levaria a `#087EB3`, que não é o azul da marca. Então o ciano **não mudou**: continua
como preenchimento (botão, chip, borda selecionada), e o **rótulo do `.btn-primary` passou a
ser escuro** (`var(--text)`) sobre ele — **7,21:1**, hover 6,27. Para texto e ícone em ciano
sobre fundo claro entrou um token separado, `--primary-txt: #0E6E9C`.

| token | de | para |
|---|---|---|
| `--primary-txt` *(novo)* | — | `#0E6E9C` |
| `--success` | `#4CAF50` | `#2E7D32` |
| `--warning` | `#F57C00` | `#A85400` |
| `--danger` | `#E53935` | `#C62828` |
| `--paid` | `#AB47BC` | `#8E24AA` |
| `--border-campo` *(novo)* | — | `#7691B1` |
| `--primary` | `#4FC3F7` | **não mudou** — é preenchimento |

`--text-d` (`#8DA0B8`) **deixou de ser cor de texto**: reprovava em qualquer fundo, e estava
no `thead` de todas as tabelas. Os usos passaram a `--text-m`; ele ficou só na seta do
acordeão e no traço do SVG de estado vazio. O verificador tem uma camada de regras, não só
de pares, exatamente para pegar esse tipo de reincidência — foi ela que achou três lugares
onde `--text-d` continuava servindo de cor de texto.

**A paleta do `bononi-exped` não foi adotada** — dele vem o *idioma dos ícones*, não as
cores: o `btn-primary` do exped reprova em 3,30:1 e ele tem 103 usos de `text-slate-400`
abaixo de AA. Adotá-la seria trocar uma dívida por outra.

**Ícones.** 34 caracteres distintos, 51 ocorrências, todos de interface. Entraram como
`ico(nome, tamanho)`, que devolve **string** SVG a partir de geometria copiada do
**lucide 0.462.0** (o mesmo do exped, licença ISC) — 84 nomes. Não usei o UMD por CDN de
propósito: as telas são remontadas com `innerHTML` dezenas de vezes por sessão, e qualquer
solução que exija hidratação depois de **cada** render é armadilha garantida.

Dois lugares onde o significado estava **só** no emoji ganharam texto junto:

- `Fotos: NF ✅ / ❌` era por onde o técnico decidia se podia enviar a OS. Agora é ícone
  **mais** "NF anexada" / "NF faltando".
- O semáforo de estoque passou a mapa de estado com rótulo. O limiar "≤3 = atenção" era
  invisível: só a cor e a bolinha mudavam.

Armadilha que vale saber: **três `✕` estavam escritos na forma escapada** (`✕`, com a
barra invertida no fonte) — varredura por codepoint não os acha. A conferência tem de
procurar as duas grafias.

**Verificador das chamadas de ícone:**

```
py -3 docs/verifica_icones.py     # sai com erro se achar problema
```

Errar uma chamada de `ico()` não dá erro de sintaxe e não aparece em revisão. Confere duas
coisas: a **forma** (a chamada tem de ficar em contexto de código — `${ico(..)}` dentro de
uma string de aspa simples imprime `${ico('x', 14)}` na tela, e `' + ico(..) + '` dentro de
um template imprime `' + ico('x', 14) + '`) e o **destino** (`textContent`, `innerText`,
`esc()` e valor de atributo de texto não renderizam markup — foi assim que 12 botões do app
interno mostraram o `<svg>` escrito, e só **depois do clique**, porque a renderização
inicial usava `innerHTML`).

**Acessibilidade (níveis 1 e 2).** 13 botões só-ícone rotulados (11 não tinham nome nenhum),
19 `aria-hidden` em ícone decorativo, **24 `<label>` ligados ao campo** (nenhum era, antes),
`role="status"` no toast — por onde passa *todo* o retorno de erro do app —, os **7 modais**
viraram diálogos com `Escape` e devolução de foco, e estado que só existia em cor ganhou
equivalente programático (`aria-current`, `aria-expanded`, `aria-pressed`, nome no
`.nav-badge`).

Os sete modais são montados por concatenação e inseridos no `body`; em vez de tocar nos sete
pontos, um observador ativa qualquer `.modal-overlay.show` (`modalAtivar`). O `Escape`
**aciona o botão de fechar que já existe** — nunca remove nada por conta própria. Isso importa
no wizard da Nova OS, que tem guarda de saída: fechar por teclado passa pela mesma guarda,
senão o rascunho se perde.

**Fora desta rodada, de propósito:**
- **Teclado (WCAG 2.1.1).** São 94 `onclick` contra 52 `<button>`: o app **não se opera por
  teclado**. É falha real e merece rodada própria — mexe em quase toda tela.
- **Documento impresso e textos de WhatsApp.** Nada que chega ao cliente mudou de conteúdo.
- **Tema escuro** — não existe, e nada aqui criou um.


## 10/09/2026 — Tela "Encaminhar cliente"

Cliente em garantia que esta autorizada não vai atender — não faz o serviço, ou está sem a
peça — e precisa ser mandado para outra. A tela acha a **credenciada mais próxima que
atende** e registra a indicação.

- Menu: entre *Minhas OS* e *Material Técnico*. Render: `renderEncaminhar`.
- Dois modos: **não faço este serviço** (filtra por categoria) e **faço, mas estou sem a
  peça** (filtra por saldo em `prt_estoque_parceiro` + categoria opcional).
- Só entra na busca quem é `credenciado` e `status='ativo'`, menos a própria: garantia é
  atendimento da Rede Autorizada.
- **Regra do cadastro:** autorizada sem categoria marcada *naquela linha* em
  `prt_parceiro_categorias` presta **todas** as categorias da linha. O card diz de onde veio
  o "atende" — declaração explícita ou dedução pela linha —, porque quem vai ligar para o
  cliente precisa saber a diferença.
- Distância: haversine sobre `assist_parceiros.lat/lng` (o `select` do login passou a trazer
  `lat,lng`). Sem coordenada na própria oficina, a lista sai por nome, com aviso.
- Registra em `prt_encaminhamentos` (origem/destino desnormalizados, motivo, linha,
  categoria, peça, cliente, km) e oferece **mensagem pronta** para o cliente, com botão de
  copiar e link `wa.me` quando o telefone dele foi informado.
- Rodapé da tela: os 5 últimos encaminhamentos feitos por esta autorizada.

**Como a autorizada de destino recebe** (10/09, segunda parte — a primeira versão não
avisava ninguém do outro lado: `prt_encaminhamentos` era lida só por `origem_parceiro_id`):
- Aba **Recebidos** na mesma tela, com **contador no menu** (`badgeEnc`). Cada card traz o
  **telefone do cliente** — a ação útil é ligar antes de ele aparecer —, o que ele precisa,
  quem indicou e por quê, mais botões de WhatsApp do cliente e de quem indicou. O telefone
  de quem indicou vem de `assist_parceiros` na hora (o registro guarda só nome/cidade, e
  para ligar o certo é o contato de hoje).
- O "novo" do contador mora no **localStorage do aparelho** (`stonni_enc_visto_<parceiro>`):
  é aviso, não fonte de verdade. Abrir a aba zera. Se a Stonni precisar saber se a
  destinatária abriu, aí sim é coluna nova em `prt_encaminhamentos`.
- Ao registrar, a janela oferece **duas mensagens prontas**: uma para a autorizada de destino
  (cliente, telefone, o que precisa, motivo, obs, quem encaminhou) e uma para o cliente. Cada
  uma com Copiar e `wa.me`. **Quem aperta enviar é a pessoa** — mesmo padrão de todo WhatsApp
  destes apps, sem integração nova. Aviso automático (API/Umbler ou e-mail) ficou de fora: dá
  Edge Function, secret e consentimento de parceiro.

**Migration** `2026-09-10_encaminhamento_rede.sql` (repo `stonni-assistencia`, `docs/sql/`)
já **aplicada em produção em 10/09/2026** — `prt_parceiro_categorias` e `prt_encaminhamentos`
existem, vazias. Esta tela pode subir.

## Telas (função `navegar()`)
Início/dashboard (Últimas OS) · Nova OS · Minhas OS · **Encaminhar cliente** (abas Encaminhar / Recebidos) · Material Técnico · Meu Estoque · Comprar Peças · Financeiro · Perfil.

## Dados
- **Próprias `prt_`:** `prt_usuarios`, `prt_ordens_servico`, `prt_os_pecas`, `prt_os_servicos`, `prt_categorias_servico`, `prt_tabela_servicos`, `prt_teto_produto`, `prt_pecas_catalogo`, `prt_estoque_parceiro`, `prt_configuracoes`, `prt_reposicao_pecas`, `prt_envios_pecas`, `prt_materiais`, `prt_linhas_produto`, `prt_modelos_produto`, `prt_pagamentos`, `prt_compras_pecas`, `prt_compras_pecas_itens`, `prt_logs`, `prt_parceiro_categorias`, `prt_encaminhamentos`.
- **Compartilhadas:** `assist_parceiros`, `comp_produtos_consolidado`.

## Reúso importante
`prt_materiais` é a **base compartilhada de materiais técnicos + "Perguntar à IA"** — lida ao vivo pela Assistência (`assist-resumo-ia`/`assist-perguntar`) e reaproveitada em outros apps (CRM, vendas). É aqui (Rede Autorizada → Configurações → Materiais) que o material é cadastrado.

## Pendências / próximos passos
- [ ] Sem STATUS anterior — este é o primeiro. Backlog a levantar com o Leo.

## Dívidas e armadilhas conhecidas
- **Arquivo único gigante** (index.html ~1742 linhas) — quebra gradual ao mexer.
- README é stub (2 linhas).
- ✅ Não usa `confirm()`/`alert()` nativos (UI própria) — manter assim.

## Dev-log
- 2026-08-11 — Clone desaninhado de `assistencia\parceiro-stonni` → raiz de `Projetos GitHub`. Criado este STATUS.
- 2026-07-15 (commit `4629a6e`) — Restaura "Últimas OS" como tabela/lista no dashboard.
