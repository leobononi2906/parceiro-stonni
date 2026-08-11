# STATUS — Portal Rede Autorizada (parceiro-stonni)

> Atualizado: 2026-08-11

## O que é
Portal do **parceiro da rede de assistência técnica autorizada Stonni**: o parceiro abre OS, consulta material técnico, controla o próprio estoque de peças, compra peças e vê o financeiro dele.

## Onde está
- **Clone real (git):** `C:\CLAUDE\Projetos GitHub\parceiro-stonni` (remote `leobononi2906/parceiro-stonni`, branch `main`). *(Desaninhado de `assistencia\` em 11/08/2026.)*
- **Deploy:** https://parceiro-stonni.vercel.app (chave de acesso no Hub = `rede-autorizada`) · push na `main` → Vercel automático.
- **Supabase:** `vishxwdxqiygbxmtpfoy` (prefixo `prt_`).
- **Código:** `index.html` único (~110KB, ~1742 linhas). Sem build. `vercel.json` com SPA rewrite + headers de segurança (X-Frame-Options DENY, nosniff). Chama Supabase por `fetch` em `/rest/v1/`.

## Telas (função `navegar()`)
Início/dashboard (Últimas OS) · Nova OS · Minhas OS · Material Técnico · Meu Estoque · Comprar Peças · Financeiro · Perfil.

## Dados
- **Próprias `prt_`:** `prt_usuarios`, `prt_ordens_servico`, `prt_os_pecas`, `prt_os_servicos`, `prt_categorias_servico`, `prt_tabela_servicos`, `prt_teto_produto`, `prt_pecas_catalogo`, `prt_estoque_parceiro`, `prt_configuracoes`, `prt_reposicao_pecas`, `prt_envios_pecas`, `prt_materiais`, `prt_linhas_produto`, `prt_modelos_produto`, `prt_pagamentos`, `prt_compras_pecas`, `prt_compras_pecas_itens`, `prt_logs`.
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
