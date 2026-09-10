# STATUS — Portal Rede Autorizada (parceiro-stonni)

> Atualizado: 2026-08-11

## O que é
Portal do **parceiro da rede de assistência técnica autorizada Stonni**: o parceiro abre OS, consulta material técnico, controla o próprio estoque de peças, compra peças e vê o financeiro dele.

## Onde está
- **Clone real (git):** `C:\CLAUDE\Projetos GitHub\parceiro-stonni` (remote `leobononi2906/parceiro-stonni`, branch `main`). *(Desaninhado de `assistencia\` em 11/08/2026.)*
- **Deploy:** https://parceiro-stonni.vercel.app (chave de acesso no Hub = `rede-autorizada`) · push na `main` → Vercel automático.
- **Supabase:** `vishxwdxqiygbxmtpfoy` (prefixo `prt_`).
- **Código:** `index.html` único (~160KB, ~2550 linhas). Sem build. `vercel.json` com SPA rewrite + headers de segurança (X-Frame-Options DENY, nosniff). Chama Supabase por `fetch` em `/rest/v1/`.


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
