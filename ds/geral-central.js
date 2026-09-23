/* ============================================================
   geral-central.js — Sugestão, avisos, atualização cadastral e
   expiração de senha  |  v2 — 23/09/2026
   ============================================================
   v2: botão vira ícone com tooltip no hover (antes era pílula de texto
   fixa, cobria mais tela). Formulário de sugestão passou a diferenciar
   "não funcionou" (o que eu queria fazer / o que deveria acontecer / o
   que aconteceu) de "ideia de melhoria" (o que poderia ser diferente),
   e captura a tela (título + rota) sozinho em vez de pedir pra pessoa
   descrever onde estava — ela só confere/corrige o campo se quiser.
   Precisa da migration 0008 (colunas tipo/tela em geral_pedidos_melhoria).
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

  var VERSAO = '2';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
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
  async function buscarAvisosPendentes(o, tipo) {
    var resp = await rest(o, 'geral_avisos?select=*&ativo=eq.true&order=criado_em.asc');
    if (!resp || !resp.ok) return [];
    var todos = await resp.json();
    if (!Array.isArray(todos)) return [];
    var doTipo = todos.filter(function (a) {
      return a.tipo === tipo && (!a.apps_alvo || !a.apps_alvo.length || a.apps_alvo.indexOf(o.appId) !== -1)
        && (!a.expira_em || new Date(a.expira_em) > new Date());
    });
    if (!doTipo.length) return [];

    var respVistos = await rest(o, 'geral_avisos_visualizacoes?usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&select=aviso_id');
    var vistos = respVistos && respVistos.ok ? await respVistos.json() : [];
    var idsVistos = (Array.isArray(vistos) ? vistos : []).map(function (v) { return v.aviso_id; });
    return doTipo.filter(function (a) { return idsVistos.indexOf(a.id) === -1; });
  }

  async function marcarVisto(o, avisoId) {
    await rest(o, 'geral_avisos_visualizacoes', {
      method: 'POST',
      body: JSON.stringify({ aviso_id: avisoId, usuario_email: o.usuario.email }),
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
        '<p style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-bottom:18px">' + esc(aviso.mensagem) + '</p>' +
        '<button id="gc-aviso-ok" style="width:100%;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Entendi</button>' +
        '</div>');
      el.querySelector('#gc-aviso-ok').addEventListener('click', async function () {
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
    return new Promise(function (resolve) {
      var el = overlay('gc-cadastro', '<div style="' + caixa() + '">' +
        '<h3 style="font-size:16px;margin-bottom:4px">' + esc(aviso.titulo) + '</h3>' +
        '<p style="font-size:13px;color:#6b7382;margin-bottom:14px">' + esc(aviso.mensagem) + '</p>' +
        '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Nome</label>' +
        '<input id="gc-cad-nome" type="text" value="' + esc(o.usuario.nome || '') + '" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px;margin-bottom:10px">' +
        '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Telefone</label>' +
        '<input id="gc-cad-telefone" type="tel" placeholder="(11) 99999-9999" style="width:100%;padding:9px 11px;border:1px solid #e2e5ea;border-radius:5px">' +
        '<div id="gc-cad-erro" style="color:#c11f25;font-size:12px;margin-top:8px;min-height:16px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<button id="gc-cad-depois" style="flex:1;padding:10px;background:#fff;color:#14161a;border:1px solid #e2e5ea;border-radius:5px;font-weight:600">Depois</button>' +
        '<button id="gc-cad-salvar" style="flex:2;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Salvar</button>' +
        '</div></div>');

      el.querySelector('#gc-cad-depois').addEventListener('click', function () { el.remove(); resolve(); });
      el.querySelector('#gc-cad-salvar').addEventListener('click', async function () {
        var erroEl = el.querySelector('#gc-cad-erro');
        var nome = el.querySelector('#gc-cad-nome').value.trim();
        var telefone = el.querySelector('#gc-cad-telefone').value.trim();
        try {
          var sessao = await o.sb.auth.getSession();
          var metaAtual = (sessao.data.session && sessao.data.session.user.user_metadata) || {};
          var r = await o.sb.auth.updateUser({ data: Object.assign({}, metaAtual, { nome: nome, telefone: telefone }) });
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
      '#gc-fab-sugestao{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;' +
        'background:var(--action-primary,#14161a);color:#fff;display:flex;align-items:center;justify-content:center;' +
        'box-shadow:var(--shadow-raised,0 4px 16px rgba(20,22,26,.25));flex:none}' +
      '#gc-fab-sugestao:active{transform:translateY(1px)}' +
      '.gc-tipo-toggle{display:flex;gap:6px;margin-bottom:14px}' +
      '.gc-tipo-btn{flex:1;padding:9px 8px;font-size:12px;font-weight:600;border-radius:6px;' +
        'border:1px solid #e2e5ea;background:#fff;color:#14161a;cursor:pointer;text-align:center}' +
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
  }

  function abrirModalSugestao(o) {
    var telaCapturada = capturarTela();
    var el = overlay('gc-sugestao', '<div style="' + caixa() + '">' +
      '<h3 style="font-size:16px;margin-bottom:4px">Sugerir melhoria</h3>' +
      '<p style="font-size:12px;color:#6b7382;margin-bottom:12px">Isso vai direto para o desenvolvedor, no Painel de Desenvolvimento.</p>' +
      '<div class="gc-tipo-toggle">' +
        '<button type="button" class="gc-tipo-btn ativo" data-tipo="melhoria">💡 Uma ideia de melhoria</button>' +
        '<button type="button" class="gc-tipo-btn" data-tipo="bug">⚠️ Algo não funcionou</button>' +
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
      '</div></div>');

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
