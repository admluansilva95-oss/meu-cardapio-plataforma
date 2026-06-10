/**
 * Abre URL em nova aba sem depender só de `window.open` (alguns webviews tratam URLs longas de forma estrita).
 */
export function openUrlNovaGuia(href: string): void {
  try {
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (w == null) {
      openUrlViaAnchor(href);
    }
  } catch {
    openUrlViaAnchor(href);
  }
}

function openUrlViaAnchor(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
