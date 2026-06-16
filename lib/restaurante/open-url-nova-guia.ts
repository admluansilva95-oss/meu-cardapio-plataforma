/**
 * Abre URL em nova aba só via `<a target="_blank">` (evita `window.open` + URLs longas em webviews).
 */
export function openUrlNovaGuia(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Abre `about:blank` na **mesma volta de evento** do clique do utilizador, *antes* de qualquer `await`.
 * Depois de trabalho assíncrono (ex.: Supabase), use `navigatePreparedTabOrOpen` com o URL final.
 * Sem isto, Chrome/Safari/Firefox bloqueiam pop-ups quando `openUrlNovaGuia` corre só após `fetch`/await.
 */
export function prepareNewTabForLaterNavigation(): Window | null {
  if (typeof window === "undefined") return null;
  try {
    return window.open("about:blank", "_blank");
  } catch {
    return null;
  }
}

/**
 * Navega o separador aberto em `prepareNewTabForLaterNavigation`; se falhar, cai no `<a target="_blank">`.
 * Importante: após um `await`, muitos browsers bloqueiam `prepared.location = url` cross-origin e o `catch`
 * corria antes — fechava o `about:blank` e o fallback já não tinha gesto do utilizador (só via “flash”).
 */
export function navigatePreparedTabOrOpen(prepared: Window | null, href: string): void {
  if (prepared != null && !prepared.closed) {
    try {
      prepared.location.href = href;
      return;
    } catch {
      /* tentar fallback antes de fechar o separador em branco */
    }
  }
  openUrlNovaGuia(href);
  if (prepared != null && !prepared.closed) {
    try {
      prepared.close();
    } catch {
      /* ignore */
    }
  }
}
