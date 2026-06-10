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
