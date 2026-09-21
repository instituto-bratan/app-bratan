// Service worker do APP BRATAN — PWA instalável, sem dependências.
// Estratégia:
//  - Navegações (abrir uma rota): network-first, com fallback ao index.html em cache
//    (permite abrir o app offline e sobreviver a rotas profundas / F5).
//  - Assets do mesmo domínio (JS/CSS/ícones): stale-while-revalidate (rápido e
//    atualiza em segundo plano). Os JS/CSS têm hash no nome, então nunca ficam velhos.
//  - Requisições cross-origin (Supabase, wss, etc.): NÃO são interceptadas — sempre
//    vão direto para a rede, preservando dados ao vivo e tempo real.
// Troque o número da versão para forçar uma limpeza de cache em um deploy futuro.
const CACHE = "bratan-shell-v1";
const OFFLINE_URL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Só cuidamos do próprio domínio. Supabase e qualquer host externo passam direto.
  if (url.origin !== self.location.origin) return;

  // O version.json é o sinal de "saiu versão nova" — nunca cachear, sempre rede.
  if (url.pathname === "/version.json") return;

  // Navegação (carregar uma página/rota): rede primeiro, cache como rede de segurança.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const network = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(OFFLINE_URL, network.clone());
          return network;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(OFFLINE_URL);
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Demais GET do mesmo domínio: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});


// ---- Avisos no celular (15/09/2026, Web Push) -------------------------------------
self.addEventListener("push", (event) => {
  let dados = { title: "APP BRATAN", body: "Você tem novidades na Fila do dia.", url: "/" };
  try {
    if (event.data) dados = { ...dados, ...event.data.json() };
  } catch {
    /* corpo fora do padrão: usa o texto padrão */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(dados.title, { body: dados.body, icon: "/pwa-192x192.png", badge: "/pwa-192x192.png", data: { url: dados.url || "/" }, tag: dados.tag || "fila-do-dia", renotify: true });
      try {
        if (typeof dados.badge === "number" && "setAppBadge" in navigator) await navigator.setAppBadge(dados.badge);
      } catch {
        /* sem Badging API */
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const janela of janelas) {
        if ("focus" in janela) {
          await janela.focus();
          if ("navigate" in janela) await janela.navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
