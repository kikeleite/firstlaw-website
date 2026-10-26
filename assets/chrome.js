// Esconde o "Entre em contato" da barra enquanto o formulario ou o rodape esta na tela.
// Sem JS (ou sem IntersectionObserver) o botao simplesmente fica visivel.
function ligar() {
  const cta = document.querySelector(".bar__cta");
  const alvos = document.querySelectorAll("[data-contato]");
  if (!cta || !alvos.length || typeof IntersectionObserver === "undefined") return;
  const visiveis = new Set();
  const esconder = (sim) => {
    if (sim) {
      cta.classList.add("bar__cta--oculto");
      cta.setAttribute("aria-hidden", "true");
      cta.setAttribute("tabindex", "-1");
      if (document.activeElement === cta) cta.blur();
    } else {
      cta.classList.remove("bar__cta--oculto");
      cta.removeAttribute("aria-hidden");
      cta.removeAttribute("tabindex");
    }
  };
  const io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (e.isIntersecting) visiveis.add(e.target); else visiveis.delete(e.target);
    }
    esconder(visiveis.size > 0);
  }, { rootMargin: "0px 0px -15% 0px", threshold: 0 });
  alvos.forEach((a) => io.observe(a));
}
ligar();

// Menu de Como te ajudamos (CSS abre no mouse e no foco): Esc fecha mesmo com o mouse em cima e o foco volta ao item;
// reabre quando o mouse sai e volta, ou quando o foco entra na lista.
function menu() {
  const m = document.querySelector(".bar__menu");
  if (!m) return;
  const fechar = (sim) => m.classList.toggle("bar__menu--fechado", sim);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !(m.matches(":hover") || m.contains(document.activeElement))) return;
    fechar(true);
    if (m.contains(document.activeElement)) m.querySelector("a").focus();
  });
  m.addEventListener("mouseleave", () => fechar(false));
  m.addEventListener("focusin", (e) => { if (e.target.closest(".bar__sub")) fechar(false); });
  m.addEventListener("focusout", (e) => { if (!m.contains(e.relatedTarget)) fechar(false); });
}
menu();
