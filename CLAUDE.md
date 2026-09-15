# Portal do Parceiro / Rede Autorizada (parceiro-stonni) — guia do projeto

> **Estado atual, pendências e dev-log: `docs/STATUS.md`.** Este arquivo é só o que é estável.
> Contexto do grupo e regras de banco: skill `bononi-contexto`. Rodar local: `rodar-app`.
> Publicar: `publicar-e-conferir`. Registrar o que foi feito: `registrar-status`.

## O que é

Portal do **parceiro da rede de assistência técnica autorizada Stonni**: o parceiro abre OS,
consulta material técnico, controla o próprio estoque de peças, compra peças e vê o financeiro
dele.

## Onde está

- **Clone nesta máquina (`ecommerce06`):** `C:\Aplicações da bononi\parceiro-stonni`.
- **Remote:** `leobononi2906/parceiro-stonni`, branch `main`. Push na `main` = produção.
- **Deploy:** https://parceiro-stonni.vercel.app (chave no Hub = `rede-autorizada`).
- **Supabase:** `vishxwdxqiygbxmtpfoy`, prefixo `prt_` (+ `assist_*`).
- **Local:** `preview_start { name: "rede-autorizada" }` → porta 5282 (banco de teste, faixa
  laranja).

## Stack

HTML + JS puro, `index.html` único (~237 KB), sem build. Supabase por `fetch` direto na REST.

## Armadilhas deste repo

- **Este app NÃO é legado.** É a Rede Autorizada em produção, usada pelos parceiros todo dia.
  Já foi tratado como substituído pelo app unificado e não é — correção que vale para o parceiro
  **tem de vir para cá**. O que saiu de uso foi o repo `assistencia` (kanban antigo).
- **Tela gêmea com o `stonni-assistencia`**: OS, Financeiro e Comprar Peças existem nos dois.
  Consertou aqui, abra lá. E a voz muda: **aqui quem lê é a autorizada**, não a equipe Stonni —
  mensagem de erro e aviso precisam falar com ela.
- **A tela "Meus dados" existe só aqui** (`renderPerfil`) — não foi portada para o unificado.
- **Embed do PostgREST precisa de FK real** (`select=*,assist_parceiros(nome)`): sem a chave
  estrangeira a resposta é **400**, não 200 vazio.
- **Arquivo único grande**: `grep` antes de criar função; função chamada por `onclick` precisa
  estar exposta em `window.*`, senão é `ReferenceError` mudo.
- O vínculo do parceiro é `prt_usuarios` com `perfil='parceiro'` e escopo por `parceiro_id`. Em
  produção esse vínculo é cadastro de verdade, pela Edge Function `credenciar-parceiro` — o
  trigger que vincula sozinho **só existe no banco de teste**.
