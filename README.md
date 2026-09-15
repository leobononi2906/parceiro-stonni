# parceiro-stonni

Portal da **rede de assistência técnica autorizada Stonni**. É o app que a
autorizada usa: abre OS, consulta material técnico, controla o próprio estoque de
peças, compra peças e acompanha o financeiro dela.

- **Deploy:** https://parceiro-stonni.vercel.app · push na `main` → Vercel automático.
  Chave de acesso no Hub Bononi: `rede-autorizada`.
- **Supabase:** `vishxwdxqiygbxmtpfoy`, tabelas com prefixo `prt_`.
- **Código:** `index.html` único, sem build — um bloco `<script>` com ~3.300
  linhas. As chamadas vão por `fetch` em `/rest/v1/`.

## Telas gêmeas — a regra mais importante deste repo

**OS, Financeiro e Comprar Peças existem em duplicata** aqui e no app interno
(`stonni-assistencia`). As duas contam a mesma história para leitores diferentes,
e **mudam juntas, sempre**.

Consertar de um lado só é a forma mais comum de deixar defeito para trás. Dois
casos reais:

- A abertura de OS travou em "Carregando a tabela de serviços" porque
  `_servicosCarregando` ficava presa em `true` quando a carga falhava. **Faltava
  o `finally`** — que o app interno sempre teve. O porte perdeu isso em silêncio.
- O botão **Cancelar OS** anunciava "OS cancelada." sem ter cancelado: o CHECK do
  banco não aceitava o valor **e** o retorno do `fetch` não era conferido.

> **A voz é diferente.** A mensagem daqui fala **com a autorizada**; a da
> Assistência fala **com a equipe Stonni**. Texto copiado de um lado para o outro
> costuma ficar dirigido à pessoa errada.

## Duas armadilhas que não dão erro

1. **`fetch` não levanta em 4xx.** Sem conferir `res.ok`, um PATCH recusado passa
   direto e a tela anuncia sucesso. Foi exatamente o que aconteceu no Cancelar OS.
2. **Escreve como usuário logado, não como anônimo.** Desde 11/09/2026 as
   chamadas mandam o JWT da sessão (`AUTHZ`). Este era o único dos quatro apps do
   grupo que gravava em `prt_*` com a chave anônima.

## Documentação

- [`docs/STATUS.md`](docs/STATUS.md) — o que mudou, por data e com o porquê.
- O app interno tem o doc de arquitetura do domínio inteiro:
  `stonni-assistencia/docs/HANDOFF.md` (fluxo da OS, do fechamento, das peças).
