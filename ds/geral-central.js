/* ============================================================
   geral-central.js — Sugestão, avisos, atualização cadastral e
   expiração de senha  |  v6 — 23/09/2026
   ============================================================
   v2: botão vira ícone com tooltip no hover (antes era pílula de texto
   fixa, cobria mais tela). Formulário de sugestão passou a diferenciar
   "não funcionou" (o que eu queria fazer / o que deveria acontecer / o
   que aconteceu) de "ideia de melhoria" (o que poderia ser diferente),
   e captura a tela (título + rota) sozinho em vez de pedir pra pessoa
   descrever onde estava — ela só confere/corrige o campo se quiser.
   Precisa da migration 0008 (colunas tipo/tela em geral_pedidos_melhoria).
   v3: emoji dos dois botões de tipo trocado por SVG inline (mesmo
   espírito do ícone do FAB) — sem depender de fonte de emoji do SO.
   v4: atualização cadastral pode ser BLOQUEANTE (geral_avisos.bloqueante).
   Sem o botão "Depois" — a pessoa preenche o nome e só então o overlay
   sai, liberando o app. Existe porque e-mail de app é reutilizado por
   mais de uma pessoa no grupo, e um "Depois" infinito nunca corrige
   quem é o operador real da conta. Nome virou campo obrigatório.
   Precisa da migration 0009.
   v5: campo de e-mail de contato no formulário de cadastro (grava
   user_metadata.email_contato — não é o e-mail de login, que é
   compartilhado). Avisos ganham agendamento (mostrar_a_partir: nulo =
   assim que publicado) e frequência (uma_vez = padrão de sempre; diario
   = mostra de novo a cada primeiro acesso do dia, até ser resolvido ou
   desativado). marcarVisto virou upsert pra suportar o diario sem
   colidir com a chave (aviso_id, usuario_email). Precisa da migration
   0010.
   v6: aviso ganha atraso configurável pro botão "Entendi" liberar
   (geral_avisos.atraso_botao_segundos — obriga esperar N segundos,
   contador visível no botão). Botão "Sugerir melhoria" ganha aba "Meus
   pedidos": lista os próprios pedidos com status e resposta, e uma
   bolinha vermelha no ícone avisa quando tem novidade (resposta_vista=
   false). Abrir "Meus pedidos" chama a RPC geral_marcar_pedidos_vistos()
   e desliga a notificação. Precisa da migration 0011.
   Módulo para colar em qualquer app do grupo, complementar ao
   geral-acesso.js (aquele é "quem tem acesso"; este é "o Painel de
   Desenvolvimento falando com quem usa o app").

   O QUE FAZ, chamado com UMA linha logo após o login (mesmo ponto onde
   o app já confere `user_metadata.modulos`):

     <script src="ds/geral-central.js?v=1"></script>
     GeralCentral.iniciar({
       appId: 'compras',              // a MESMA chave `acesso` do APPS do Hub
       url: SUPA_URL, key: SUPA_KEY, sb,
       usuario: { email: session.user.email, nome: meta.nome || '' },
     });

   ORDEM (pensada assim de propósito):
     1. Expiração de senha — BLOQUEIA (tela cheia) se vencida. Só ela
        pára o resto: é a única das quatro que é sobre segurança, não
        sobre comunicação.
     2. Avisos ativos que a pessoa ainda não viu — banner, um de cada
        vez, e SÓ SOME depois de marcado como visto (grava em
        geral_avisos_visualizacoes). É a regra da casa: notificação
        persiste até ser vista, não só até ser mostrada uma vez.
     3. Campanha de atualização cadastral (mesma tabela, tipo
        diferente) — modal com nome/telefone/foto, grava no próprio
        user_metadata via supabase-js.
     4. Botão flutuante "Sugerir melhoria" — sempre, silencioso, grava
        em geral_pedidos_melhoria.

   SILENCIOSO SE FALTAR PRÉ-REQUISITO: se a migration 0007 ainda não
   foi aplicada neste banco, ou a tabela não responde, cada função
   desiste sem quebrar o app — mesmo espírito do geral-acesso.js.

   ESTE ARQUIVO É CÓPIA VERBATIM. A original vive em bononi-hub/ds/.
   Mudou aqui? Mude lá e recopie para todos os apps que usam.
   ============================================================ */
(function () {
  'use strict';

  var VERSAO = '6';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Mensagem de aviso aceita um punhado de tags simples (negrito, itálico,
  // sublinhado, quebra de linha e link) — tudo escapado primeiro, depois só
  // essas tags específicas voltam a virar HTML de verdade. Nunca usar o texto
  // do aviso direto em innerHTML sem passar por aqui.
  function escHtmlSimples(s) {
    var t = esc(s);
    t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    t = t.replace(/&lt;(\/?)(b|strong|i|em|u)&gt;/gi, '<$1$2>');
    t = t.replace(/&lt;a href=&quot;(https?:\/\/[^&"]*)&quot;&gt;/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">');
    t = t.replace(/&lt;\/a&gt;/gi, '</a>');
    return t;
  }

  function overlay(id, htmlInterno) {
    var existente = document.getElementById(id);
    if (existente) existente.remove();
    var div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(20,22,26,.55)';
    div.innerHTML = htmlInterno;
    document.body.appendChild(div);
    return div;
  }

  function caixa() {
    return 'background:#fff;color:#14161a;border-radius:10px;max-width:420px;width:100%;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit';
  }

  async function rest(o, caminho, opcoes) {
    var headers = Object.assign({
      'apikey': o.key,
      'Authorization': 'Bearer ' + (o.token || o.key),
      'Content-Type': 'application/json',
    }, (opcoes && opcoes.headers) || {});
    try {
      var resp = await fetch(o.url + '/rest/v1/' + caminho, Object.assign({}, opcoes, { headers: headers }));
      return resp;
    } catch (e) {
      console.warn('[geral-central]', e && e.message);
      return null;
    }
  }

  async function token(o) {
    if (!o.sb) return null;
    try {
      var s = await o.sb.auth.getSession();
      return s && s.data && s.data.session ? s.data.session.access_token : null;
    } catch (e) { return null; }
  }

  // ── 1. Expiração de senha ────────────────────────────────────────
  async function verificarExpiracaoSenha(o) {
    try {
      var resp = await rest(o, 'geral_seguranca_config?id=eq.1&select=dias_expiracao_senha');
      if (!resp || !resp.ok) return false;
      var linhas = await resp.json();
      var dias = Array.isArray(linhas) && linhas[0] ? linhas[0].dias_expiracao_senha : null;
      if (!dias || dias <= 0) return false; // desligado

      var sessao = await o.sb.auth.getSession();
      var meta = (sessao.data.session && sessao.data.session.user.user_metadata) || {};
      var alteradaEm = meta.senha_alterada_em;
      // Nunca registrado ainda: não bloqueia hoje (ver docs/STATUS.md do
      // Painel de Desenvolvimento — evita travar todo mundo no dia 1).
      if (!alteradaEm) return false;

      var diasPassados = (Date.now() - new Date(alteradaEm).getTime()) / 86400000;
      if (diasPassados < dias) return false;

      return new Promise(function (resolve) {
        var el = overlay('gc-senha', '<div style="' + caixa() + '">' +
          '<h3 style="font-size:16px;margin-bottom:6px">Hora de trocar sua senha</h3>' +
          '<p style="font-size:13px;color:#6b7382;margin-bottom:16px">Já se passaram mais de ' + dias + ' dias desde a última troca. Defina uma senha nova para continuar.</p>' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Nova senha</label>' +
          '<input id="gc-nova-senha" type="password" minlength="6" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px;margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Confirmar senha</label>' +
          '<input id="gc-confirma-senha" type="password" minlength="6" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px">' +
          '<div id="gc-senha-erro" style="color:#c11f25;font-size:12px;margin-top:8px;min-height:16px"></div>' +
          '<button id="gc-senha-salvar" style="margin-top:10px;width:100%;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Salvar e continuar</button>' +
          '</div>');

        el.querySelector('#gc-senha-salvar').addEventListener('click', async function () {
          var erroEl = el.querySelector('#gc-senha-erro');
          var nova = el.querySelector('#gc-nova-senha').value;
          var conf = el.querySelector('#gc-confirma-senha').value;
          if (nova.length < 6) { erroEl.textContent = 'Mínimo de 6 caracteres.'; return; }
          if (nova !== conf) { erroEl.textContent = 'As senhas não conferem.'; return; }
          try {
            var novaMeta = Object.assign({}, meta, { senha_alterada_em: new Date().toISOString() });
            var r = await o.sb.auth.updateUser({ password: nova, data: novaMeta });
            if (r.error) { erroEl.textContent = r.error.message; return; }
            el.remove();
            resolve(true);
          } catch (e) {
            erroEl.textContent = 'Erro ao salvar: ' + e.message;
          }
        });
      });
    } catch (e) {
      console.warn('[geral-central] senha', e && e.message);
      return false;
    }
  }

  // ── 2 e 3. Avisos e campanha de atualização cadastral ────────────
  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  async function buscarAvisosPendentes(o, tipo) {
    var agora = new Date();
    var resp = await rest(o, 'geral_avisos?select=*&ativo=eq.true&order=criado_em.asc');
    if (!resp || !resp.ok) return [];
    var todos = await resp.json();
    if (!Array.isArray(todos)) return [];
    var doTipo = todos.filter(function (a) {
      return a.tipo === tipo && (!a.apps_alvo || !a.apps_alvo.length || a.apps_alvo.indexOf(o.appId) !== -1)
        && (!a.expira_em || new Date(a.expira_em) > agora)
        && (!a.mostrar_a_partir || new Date(a.mostrar_a_partir) <= agora); // agendamento: ainda não chegou a hora
    });
    if (!doTipo.length) return [];

    var respVistos = await rest(o, 'geral_avisos_visualizacoes?usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&select=aviso_id,visto_em');
    var vistos = respVistos && respVistos.ok ? await respVistos.json() : [];
    vistos = Array.isArray(vistos) ? vistos : [];

    return doTipo.filter(function (a) {
      var registro = vistos.filter(function (v) { return v.aviso_id === a.id; })[0];
      if (!registro) return true; // nunca viu
      if (a.frequencia === 'diario') return !mesmoDia(new Date(registro.visto_em), agora); // já viu, mas não hoje
      return false; // uma_vez: já viu, não mostra de novo
    });
  }

  async function marcarVisto(o, avisoId) {
    // upsert: em frequencia=diario a mesma pessoa marca visto todo dia, e a
    // chave (aviso_id, usuario_email) já existe — precisa atualizar, não inserir.
    await rest(o, 'geral_avisos_visualizacoes?on_conflict=aviso_id,usuario_email', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ aviso_id: avisoId, usuario_email: o.usuario.email, visto_em: new Date().toISOString() }),
    });
  }

  async function verificarAvisos(o) {
    try {
      var pendentes = await buscarAvisosPendentes(o, 'aviso');
      for (var i = 0; i < pendentes.length; i++) {
        await mostrarAviso(o, pendentes[i]);
      }
    } catch (e) { console.warn('[geral-central] avisos', e && e.message); }
  }

  function mostrarAviso(o, aviso) {
    return new Promise(function (resolve) {
      var el = overlay('gc-aviso-' + aviso.id, '<div style="' + caixa() + '">' +
        '<div style="font-size:11px;font-weight:700;color:#c11f25;letter-spacing:.03em;margin-bottom:6px">AVISO</div>' +
        '<h3 style="font-size:16px;margin-bottom:8px">' + esc(aviso.titulo) + '</h3>' +
        '<p style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-bottom:18px">' + escHtmlSimples(aviso.mensagem) + '</p>' +
        '<button id="gc-aviso-ok" style="width:100%;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700;opacity:.5" disabled>Entendi</button>' +
        '</div>');

      var btn = el.querySelector('#gc-aviso-ok');
      var restante = Math.max(0, parseInt(aviso.atraso_botao_segundos, 10) || 0);
      function liberar() {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = 'Entendi';
      }
      if (restante <= 0) {
        liberar();
      } else {
        btn.textContent = 'Entendi (' + restante + ')';
        var cron = setInterval(function () {
          restante -= 1;
          if (restante <= 0) { clearInterval(cron); liberar(); }
          else { btn.textContent = 'Entendi (' + restante + ')'; }
        }, 1000);
      }

      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        el.remove();
        await marcarVisto(o, aviso.id);
        resolve();
      });
    });
  }

  async function verificarAtualizacaoCadastral(o) {
    try {
      var pendentes = await buscarAvisosPendentes(o, 'atualizacao_cadastral');
      if (!pendentes.length) return;
      await mostrarFormularioCadastro(o, pendentes[0]);
    } catch (e) { console.warn('[geral-central] cadastro', e && e.message); }
  }

  function mostrarFormularioCadastro(o, aviso) {
    var travado = aviso.bloqueante === true;
    return new Promise(function (resolve) {
      var el = overlay('gc-cadastro', '<div style="' + caixa() + '">' +
        '<h3 style="font-size:16px;margin-bottom:4px">' + esc(aviso.titulo) + '</h3>' +
        '<p style="font-size:13px;color:#6b7382;margin-bottom:14px">' + escHtmlSimples(aviso.mensagem) + '</p>' +
        '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Seu nome</label>' +
        '<input id="gc-cad-nome" type="text" value="' + esc(o.usuario.nome || '') + '" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px;margin-bottom:10px">' +
        '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Seu e-mail (o seu, não o da conta)</label>' +
        '<input id="gc-cad-email" type="email" placeholder="seu@email.com" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px;margin-bottom:10px">' +
        '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Telefone</label>' +
        '<input id="gc-cad-telefone" type="tel" placeholder="(11) 99999-9999" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px">' +
        '<div id="gc-cad-erro" style="color:#c11f25;font-size:12px;margin-top:8px;min-height:16px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        (travado ? '' : '<button id="gc-cad-depois" style="flex:1;padding:10px;background:#fff;color:#14161a;border:1px solid #e2e5ea;border-radius:5px;font-weight:600">Depois</button>') +
        '<button id="gc-cad-salvar" style="flex:' + (travado ? '1' : '2') + ';padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Salvar' + (travado ? ' e continuar' : '') + '</button>' +
        '</div></div>');

      var btnDepois = el.querySelector('#gc-cad-depois');
      if (btnDepois) btnDepois.addEventListener('click', function () { el.remove(); resolve(); });
      el.querySelector('#gc-cad-salvar').addEventListener('click', async function () {
        var erroEl = el.querySelector('#gc-cad-erro');
        var nome = el.querySelector('#gc-cad-nome').value.trim();
        var emailContato = el.querySelector('#gc-cad-email').value.trim();
        var telefone = el.querySelector('#gc-cad-telefone').value.trim();
        if (!nome) { erroEl.textContent = 'Preencha o nome.'; return; }
        if (!emailContato) { erroEl.textContent = 'Preencha o e-mail.'; return; }
        try {
          var sessao = await o.sb.auth.getSession();
          var metaAtual = (sessao.data.session && sessao.data.session.user.user_metadata) || {};
          var r = await o.sb.auth.updateUser({ data: Object.assign({}, metaAtual, { nome: nome, email_contato: emailContato, telefone: telefone }) });
          if (r.error) { erroEl.textContent = r.error.message; return; }
          await marcarVisto(o, aviso.id);
          el.remove();
          resolve();
        } catch (e) {
          erroEl.textContent = 'Erro ao salvar: ' + e.message;
        }
      });
    });
  }

  // ── 4. Botão "Sugerir melhoria" ──────────────────────────────────
  // Captura a tela automaticamente (título + rota) — a pessoa não digita
  // onde estava, só confere/corrige se quiser.
  function capturarTela() {
    try {
      var titulo = (document.title || '').trim();
      var rota = location.pathname + (location.hash || '');
      return (titulo ? titulo + ' — ' : '') + rota;
    } catch (e) {
      return location.href || '';
    }
  }

  function garantirEstiloFab() {
    if (document.getElementById('gc-fab-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gc-fab-estilo';
    s.textContent =
      '.gc-oculto{display:none !important}' +
      '.gc-fab-wrap{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9997;' +
        'display:flex;align-items:center;gap:8px}' +
      '.gc-fab-tooltip{background:#14161a;color:#fff;font-size:12px;font-weight:600;padding:6px 11px;' +
        'border-radius:6px;white-space:nowrap;opacity:0;transform:translateX(6px);pointer-events:none;' +
        'transition:opacity .15s ease,transform .15s ease;box-shadow:0 2px 8px rgba(20,22,26,.18)}' +
      '.gc-fab-wrap:hover .gc-fab-tooltip,.gc-fab-wrap:focus-within .gc-fab-tooltip{opacity:1;transform:translateX(0)}' +
      '#gc-fab-sugestao{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;position:relative;' +
        'background:var(--action-primary,#14161a);color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:var(--shadow-raised,0 4px 16px rgba(20,22,26,.25));flex:none}' +
      '#gc-fab-sugestao:active{transform:translateY(1px)}' +
      '.gc-fab-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;border-radius:999px;' +
        'background:#c11f25;color:#fff;font-size:10px;font-weight:800;line-height:16px;text-align:center;' +
        'padding:0 4px;border:2px solid #fff;box-sizing:content-box}' +
      '.gc-modo-toggle{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid #e2e5ea;padding-bottom:10px}' +
      '.gc-modo-btn{flex:1;padding:7px 8px;font-size:12px;font-weight:700;border-radius:6px;border:none;' +
        'background:transparent;color:#6b7382;cursor:pointer;text-align:center;position:relative}' +
      '.gc-modo-btn.ativo{background:#f5f6f8;color:#14161a}' +
      '.gc-modo-btn .gc-fab-badge{position:absolute;top:2px;right:6px;border-color:#f5f6f8}' +
      '.gc-pedido-item{border:1px solid #e2e5ea;border-radius:6px;padding:10px;margin-bottom:8px;font-size:12px}' +
      '.gc-pedido-item .topo{display:flex;justify-content:space-between;gap:8px;color:#6b7382;font-size:11px;margin-bottom:4px}' +
      '.gc-pedido-item .msg{white-space:pre-wrap;color:#14161a;margin-bottom:6px}' +
      '.gc-pedido-item .resposta{background:#f5f6f8;border-radius:5px;padding:7px 9px;font-size:11px;color:#14161a;margin-top:6px}' +
      '.gc-tipo-toggle{display:flex;gap:6px;margin-bottom:14px}' +
      '.gc-tipo-btn{flex:1;padding:9px 8px;font-size:12px;font-weight:600;border-radius:6px;' +
        'border:1px solid #e2e5ea;background:#fff;color:#14161a;cursor:pointer;text-align:center;' +
        'display:flex;align-items:center;justify-content:center;gap:6px}' +
      '.gc-tipo-btn svg{flex:none}' +
      '.gc-tipo-btn.ativo{background:#14161a;color:#fff;border-color:#14161a}' +
      '.gc-campo label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}' +
      '.gc-campo textarea{width:100%;min-height:64px;padding:9px 10px;border:1px solid #e2e5ea;border-radius:5px;resize:vertical}' +
      '.gc-campo input[type=text]{width:100%;padding:8px 10px;border:1px solid #e2e5ea;border-radius:5px;font-size:12px;color:#6b7382}';
    document.head.appendChild(s);
  }

  // Ícone de balão de conversa com "+" — sem depender do sistema de ícones
  // de cada app (nem todos têm o mesmo hidratador de SVG).
  var ICONE_FAB = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 ' +
    '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
    '8.48 0 0 1 8 8v.5z"/><line x1="12" y1="7.5" x2="12" y2="13.5"/><line x1="9" y1="10.5" x2="15" y2="10.5"/></svg>';

  // Ícones dos dois tipos do formulário — mesmo espírito do ícone do FAB:
  // SVG inline, sem depender do hidratador de ícones de cada app.
  var ICONE_LAMPADA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 ' +
    '1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
  var ICONE_ALERTA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 ' +
    '1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  async function contarPedidosNaoVistos(o) {
    try {
      var resp = await rest(o, 'geral_pedidos_melhoria?select=id&usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&resposta_vista=eq.false', {
        headers: { Prefer: 'count=exact', Range: '0-0' },
      });
      if (!resp || !resp.ok) return 0;
      var cr = resp.headers.get('content-range');
      if (!cr) return 0;
      var total = cr.split('/')[1];
      return total === '*' ? 0 : parseInt(total, 10) || 0;
    } catch (e) { return 0; }
  }

  async function atualizarBadgeFab(o) {
    var n = await contarPedidosNaoVistos(o);
    var fab = document.getElementById('gc-fab-sugestao');
    if (!fab) return n;
    var badge = fab.querySelector('.gc-fab-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'gc-fab-badge';
        fab.appendChild(badge);
      }
      badge.textContent = n > 9 ? '9+' : String(n);
    } else if (badge) {
      badge.remove();
    }
    return n;
  }

  function montarFabSugestao(o) {
    if (document.getElementById('gc-fab-sugestao')) return;
    garantirEstiloFab();
    var wrap = document.createElement('div');
    wrap.className = 'gc-fab-wrap';
    wrap.innerHTML =
      '<span class="gc-fab-tooltip">Sugerir melhoria</span>' +
      '<button id="gc-fab-sugestao" type="button" aria-label="Sugerir melhoria">' + ICONE_FAB + '</button>';
    document.body.appendChild(wrap);
    wrap.querySelector('#gc-fab-sugestao').addEventListener('click', function () { abrirModalSugestao(o); });
    atualizarBadgeFab(o);
  }

  var ROTULO_STATUS = { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido' };

  async function carregarMeusPedidos(o, el) {
    var lista = el.querySelector('#gc-meus-lista');
    lista.innerHTML = '<div style="font-size:12px;color:#6b7382;text-align:center;padding:16px 0">Carregando…</div>';
    try {
      var resp = await rest(o, 'geral_pedidos_melhoria?select=*&usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&order=criado_em.desc', { headers: { Range: '0-49' } });
      var pedidos = resp && resp.ok ? await resp.json() : [];
      if (!Array.isArray(pedidos) || !pedidos.length) {
        lista.innerHTML = '<div style="font-size:12px;color:#6b7382;text-align:center;padding:16px 0">Você ainda não mandou nenhum pedido.</div>';
      } else {
        lista.innerHTML = pedidos.map(function (p) {
          return '<div class="gc-pedido-item">' +
            '<div class="topo"><span>' + esc(p.app_origem) + ' · ' + (p.tipo === 'bug' ? 'não funcionou' : 'melhoria') + '</span>' +
            '<span>' + (ROTULO_STATUS[p.status] || p.status) + '</span></div>' +
            '<div class="msg">' + esc(p.mensagem) + '</div>' +
            (p.resposta ? '<div class="resposta"><b>Resposta:</b> ' + esc(p.resposta) + '</div>' : '') +
            '</div>';
        }).join('');
      }
      // Abrir "Meus pedidos" é o que conta como "vi a resposta" — desliga a notificação.
      await rest(o, 'rpc/geral_marcar_pedidos_vistos', { method: 'POST', body: '{}' });
      atualizarBadgeFab(o);
      var badgeAba = el.querySelector('#gc-aba-meus .gc-fab-badge');
      if (badgeAba) badgeAba.remove();
    } catch (e) {
      lista.innerHTML = '<div style="font-size:12px;color:#c11f25;text-align:center;padding:16px 0">Erro ao carregar: ' + esc(e.message) + '</div>';
    }
  }

  async function abrirModalSugestao(o) {
    var telaCapturada = capturarTela();
    var naoVistos = await contarPedidosNaoVistos(o);
    var el = overlay('gc-sugestao', '<div style="' + caixa() + '">' +
      '<div class="gc-modo-toggle">' +
        '<button type="button" class="gc-modo-btn ativo" id="gc-aba-novo" data-modo="novo">Novo pedido</button>' +
        '<button type="button" class="gc-modo-btn" id="gc-aba-meus" data-modo="meus">Meus pedidos' +
          (naoVistos > 0 ? '<span class="gc-fab-badge">' + (naoVistos > 9 ? '9+' : naoVistos) + '</span>' : '') +
        '</button>' +
      '</div>' +
      '<div id="gc-modo-novo">' +
      '<h3 style="font-size:16px;margin-bottom:4px">Sugerir melhoria</h3>' +
      '<p style="font-size:12px;color:#6b7382;margin-bottom:12px">Isso vai direto para o desenvolvedor, no Painel de Desenvolvimento.</p>' +
      '<div class="gc-tipo-toggle">' +
        '<button type="button" class="gc-tipo-btn ativo" data-tipo="melhoria">' + ICONE_LAMPADA + ' Uma ideia de melhoria</button>' +
        '<button type="button" class="gc-tipo-btn" data-tipo="bug">' + ICONE_ALERTA + ' Algo não funcionou</button>' +
      '</div>' +
      '<div id="gc-campos-melhoria" class="gc-campo">' +
        '<label>O que essa tela faz hoje que poderia ser diferente?</label>' +
        '<textarea id="gc-m-diferente" placeholder="Ex.: essa lista podia ter um filtro por data"></textarea>' +
      '</div>' +
      '<div id="gc-campos-bug" class="gc-campo gc-oculto">' +
        '<label>O que você estava tentando fazer?</label>' +
        '<textarea id="gc-b-tentando"></textarea>' +
        '<label>O que deveria acontecer?</label>' +
        '<textarea id="gc-b-esperado"></textarea>' +
        '<label>O que aconteceu de fato?</label>' +
        '<textarea id="gc-b-aconteceu"></textarea>' +
      '</div>' +
      '<div class="gc-campo"><label>Tela</label><input id="gc-tela" type="text" value="' + esc(telaCapturada) + '"></div>' +
      '<div id="gc-sug-msg" style="font-size:12px;margin-top:6px;min-height:16px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button id="gc-sug-cancelar" style="flex:1;padding:10px;background:#fff;color:#14161a;border:1px solid #e2e5ea;border-radius:5px;font-weight:600">Cancelar</button>' +
      '<button id="gc-sug-enviar" style="flex:2;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Enviar</button>' +
      '</div>' +
      '</div>' +
      '<div id="gc-modo-meus" class="gc-oculto">' +
      '<h3 style="font-size:16px;margin-bottom:10px">Meus pedidos</h3>' +
      '<div id="gc-meus-lista" style="max-height:340px;overflow-y:auto"></div>' +
      '<button id="gc-meus-fechar" style="width:100%;margin-top:10px;padding:10px;background:#fff;color:#14161a;border:1px solid #e2e5ea;border-radius:5px;font-weight:600">Fechar</button>' +
      '</div>' +
      '</div>');

    var botoesModo = el.querySelectorAll('.gc-modo-btn');
    botoesModo.forEach(function (btn) {
      btn.addEventListener('click', function () {
        botoesModo.forEach(function (b) { b.classList.toggle('ativo', b === btn); });
        el.querySelector('#gc-modo-novo').classList.toggle('gc-oculto', btn.dataset.modo !== 'novo');
        el.querySelector('#gc-modo-meus').classList.toggle('gc-oculto', btn.dataset.modo !== 'meus');
        if (btn.dataset.modo === 'meus') carregarMeusPedidos(o, el);
      });
    });
    el.querySelector('#gc-meus-fechar').addEventListener('click', function () { el.remove(); });

    var tipoAtual = 'melhoria';
    var botoesTipo = el.querySelectorAll('.gc-tipo-btn');
    botoesTipo.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tipoAtual = btn.dataset.tipo;
        botoesTipo.forEach(function (b) { b.classList.toggle('ativo', b === btn); });
        el.querySelector('#gc-campos-melhoria').classList.toggle('gc-oculto', tipoAtual !== 'melhoria');
        el.querySelector('#gc-campos-bug').classList.toggle('gc-oculto', tipoAtual !== 'bug');
      });
    });

    el.querySelector('#gc-sug-cancelar').addEventListener('click', function () { el.remove(); });
    el.querySelector('#gc-sug-enviar').addEventListener('click', async function () {
      var msgEl = el.querySelector('#gc-sug-msg');
      var tela = el.querySelector('#gc-tela').value.trim();
      var mensagem;
      if (tipoAtual === 'bug') {
        var tentando = el.querySelector('#gc-b-tentando').value.trim();
        var esperado = el.querySelector('#gc-b-esperado').value.trim();
        var aconteceu = el.querySelector('#gc-b-aconteceu').value.trim();
        if (!tentando || !esperado || !aconteceu) {
          msgEl.style.color = '#c11f25'; msgEl.textContent = 'Preencha os três campos.'; return;
        }
        mensagem = 'O que eu queria fazer: ' + tentando +
          '\nO que deveria acontecer: ' + esperado +
          '\nO que aconteceu: ' + aconteceu;
      } else {
        var diferente = el.querySelector('#gc-m-diferente').value.trim();
        if (!diferente) { msgEl.style.color = '#c11f25'; msgEl.textContent = 'Escreva alguma coisa.'; return; }
        mensagem = diferente;
      }
      try {
        var resp = await rest(o, 'geral_pedidos_melhoria', {
          method: 'POST',
          body: JSON.stringify({
            app_origem: o.appId,
            usuario_email: o.usuario.email,
            usuario_nome: o.usuario.nome || null,
            tipo: tipoAtual,
            tela: tela || null,
            mensagem: mensagem,
          }),
        });
        if (!resp || !resp.ok) throw new Error('HTTP ' + (resp ? resp.status : '?'));
        msgEl.style.color = '#1a7f37';
        msgEl.textContent = 'Enviado — obrigado!';
        setTimeout(function () { el.remove(); }, 1200);
      } catch (e) {
        msgEl.style.color = '#c11f25';
        msgEl.textContent = 'Erro ao enviar: ' + e.message;
      }
    });
  }

  var GeralCentral = {
    versao: VERSAO,

    /**
     * @param {object} o
     * @param {string} o.appId    chave `acesso` do APPS do Hub (compras, financeiro…)
     * @param {string} o.url      SUPA_URL
     * @param {string} o.key      SUPA_KEY (anon)
     * @param {object} o.sb       client supabase-js (sessão já logada)
     * @param {object} o.usuario  { email, nome }
     */
    iniciar: async function (opts) {
      if (!opts || !opts.appId || !opts.url || !opts.key || !opts.sb || !opts.usuario) return;
      opts.token = await token(opts);
      if (!opts.token) return; // sem sessão, não faz nada

      var bloqueado = await verificarExpiracaoSenha(opts);
      if (bloqueado) {
        // sessão trocou de senha agora — o restante roda depois, já liberado.
      }
      await verificarAvisos(opts);
      await verificarAtualizacaoCadastral(opts);
      montarFabSugestao(opts);
    },
  };

  window.GeralCentral = GeralCentral;
})();
