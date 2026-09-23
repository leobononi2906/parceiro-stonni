/* ============================================================
   geral-central.js — Sugestão, avisos, atualização cadastral e
   expiração de senha  |  v1 — 23/09/2026
   ============================================================
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

  var VERSAO = '1';

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
  function montarFabSugestao(o) {
    if (document.getElementById('gc-fab-sugestao')) return;
    var b = document.createElement('button');
    b.id = 'gc-fab-sugestao';
    b.type = 'button';
    b.textContent = 'Sugerir melhoria';
    b.style.cssText = 'position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:9997;' +
      'padding:11px 16px;border:none;border-radius:999px;background:var(--action-primary,#14161a);color:#fff;' +
      'font-size:13px;font-weight:700;box-shadow:var(--shadow-raised,0 4px 16px rgba(20,22,26,.25));cursor:pointer';
    b.addEventListener('mousedown', function () { b.style.transform = 'translateY(1px)'; });
    b.addEventListener('mouseup', function () { b.style.transform = ''; });
    b.addEventListener('click', function () { abrirModalSugestao(o); });
    document.body.appendChild(b);
  }

  function abrirModalSugestao(o) {
    var el = overlay('gc-sugestao', '<div style="' + caixa() + '">' +
      '<h3 style="font-size:16px;margin-bottom:8px">Sugerir melhoria</h3>' +
      '<p style="font-size:12px;color:#6b7382;margin-bottom:12px">Vai direto pro desenvolvedor, no Painel de Desenvolvimento.</p>' +
      '<textarea id="gc-sug-texto" placeholder="O que podia funcionar melhor aqui?" style="width:100%;min-height:90px;padding:10px;border:1px solid #e2e5ea;border-radius:5px"></textarea>' +
      '<div id="gc-sug-msg" style="font-size:12px;margin-top:8px;min-height:16px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button id="gc-sug-cancelar" style="flex:1;padding:10px;background:#fff;color:#14161a;border:1px solid #e2e5ea;border-radius:5px;font-weight:600">Cancelar</button>' +
      '<button id="gc-sug-enviar" style="flex:2;padding:10px;background:#14161a;color:#fff;border:none;border-radius:5px;font-weight:700">Enviar</button>' +
      '</div></div>');

    el.querySelector('#gc-sug-cancelar').addEventListener('click', function () { el.remove(); });
    el.querySelector('#gc-sug-enviar').addEventListener('click', async function () {
      var msgEl = el.querySelector('#gc-sug-msg');
      var texto = el.querySelector('#gc-sug-texto').value.trim();
      if (!texto) { msgEl.style.color = '#c11f25'; msgEl.textContent = 'Escreva alguma coisa.'; return; }
      try {
        var resp = await rest(o, 'geral_pedidos_melhoria', {
          method: 'POST',
          body: JSON.stringify({
            app_origem: o.appId,
            usuario_email: o.usuario.email,
            usuario_nome: o.usuario.nome || null,
            mensagem: texto,
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
