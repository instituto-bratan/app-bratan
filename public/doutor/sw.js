// SERVICE WORKER DO APP DO DOUTOR (28/10/2026) — o da v22, com três cuidados
// para conviver com o APP BRATAN no mesmo domínio:
//  1. Escopo /doutor/: só cuida das telas do doutor (o do 360 cuida do resto).
//  2. Só apaga os PRÓPRIOS caches (prefixo "bratan-doutor-"). Os caches são do
//     domínio inteiro: apagar "tudo que não é meu", como a v22 fazia, levaria
//     junto o cache do 360 — e o do 360 levaria o do doutor.
//  3. Não intercepta outro domínio (Supabase): o envio do protocolo e a agenda
//     vão sempre direto para a rede, nunca de um cache velho.
// Abre na hora e funciona sem internet: páginas pela rede com o cache de
// reserva; arquivos do cache na hora, atualizando em segundo plano.
const PREFIXO = "bratan-doutor-";
const CACHE = `${PREFIXO}v1`;
const CORE = [
  "/doutor/",
  "/doutor/apresentacao.html",
  "/doutor/plano.css",
  "/doutor/plano.js",
  "/doutor/apresentacao.js",
  "/doutor/manifest.webmanifest",
  "/doutor/icon-180.png",
  "/doutor/icon-192.png",
  "/doutor/icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIXO) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Páginas: busca a versão nova e guarda cada página no seu próprio endereço.
async function nav(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("/doutor/")) || Response.error();
  }
}

// Arquivos do próprio site: responde do cache na hora e atualiza em segundo plano.
async function asset(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/version.json") return;
  e.respondWith(e.request.mode === "navigate" ? nav(e.request) : asset(e.request));
});
