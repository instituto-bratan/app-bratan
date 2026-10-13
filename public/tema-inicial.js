// 13/10/2026 (revisão da etapa 4): decide as cores da moldura ANTES da primeira
// pintura. Instalado na tela de início, o iPhone lê a meta
// apple-mobile-web-app-status-bar-style quando o app abre; se ela nascer
// "black-translucent", as horas e a bateria saem em BRANCO sobre o papel claro.
// Este arquivo roda síncrono no <head> (a CSP só aceita script do próprio site,
// por isso não é inline) e usa a mesma escolha que src/lib/tema.ts guarda.
// Claro → "default" (letras pretas); escuro → "black-translucent".
(function () {
  try {
    var portal = window.location.pathname.indexOf("/meu") === 0;
    var aparelhoEscuro = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var tema = "sistema";
    if (!portal) {
      try {
        var guardado = window.localStorage.getItem("app-bratan:tema");
        if (guardado === "claro" || guardado === "escuro" || guardado === "sistema") tema = guardado;
      } catch (e) {
        /* sem localStorage: segue o aparelho */
      }
    }
    var escuro = tema === "escuro" || (tema === "sistema" && aparelhoEscuro);
    var barra = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (barra) barra.setAttribute("content", escuro ? "black-translucent" : "default");
    // O portal do paciente pinta a própria barra; aqui só o app da equipe. A
    // escolha manual do tema vence o aparelho: as duas metas ficam com a mesma cor.
    if (!portal && tema !== "sistema") {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", escuro ? "#0B110D" : "#FAF8F1");
    }
  } catch (e) {
    /* nunca impede o app de abrir */
  }
})();
