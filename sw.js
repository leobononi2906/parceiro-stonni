// ============================================================
//  SERVICE WORKER — Portal Parceiro Stonni (PWA)
//  Sem isto, quem estava com o Portal aberto só via um deploy novo
//  apertando F5 na mão (mesmo problema já visto na Assistência, no
//  Hub e no Portal Stonni). Estratégia: network-first para a casca
//  do app — deploy novo sempre vence quando online — cache só como
//  fallback offline.
//
//  ⚠️ Ao subir um deploy, BUMPAR VERSAO para invalidar o cache antigo.
// ============================================================
const VERSAO = 'parceiro-stonni-v1-20260924';
const CASCA = [
  './',
  './index.html',
];

self.addEventListener('install', (ev) => {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(VERSAO).then((c) => Promise.allSettled(CASCA.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // ⚠️ fetch(req) passa pelo cache HTTP do navegador. Sem no-store na casca,
  // "network-first" virava "cache-do-navegador-first": o app continuava
  // abrindo a versão antiga depois do deploy, sem ninguém entender por quê.
  const ehCasca = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const busca = ehCasca ? fetch(url.pathname + url.search, { cache: 'no-store' }) : fetch(req);

  ev.respondWith(
    busca.then((res) => {
      const copia = res.clone();
      caches.open(VERSAO).then((c) => c.put(req, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
