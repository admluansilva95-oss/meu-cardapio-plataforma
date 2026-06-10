/**
 * GET JSON **somente via XMLHttpRequest** (evita o pipeline `fetch` em runtimes que disparam `ByteString`).
 */
export function xhrGetJson(
  url: string,
  signal?: AbortSignal,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);

    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      xhr.abort();
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", onAbort);
    }

    xhr.onload = () => {
      cleanup();
      let json: unknown = {};
      try {
        json = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : {};
      } catch {
        json = {};
      }
      resolve({ status: xhr.status, json });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Falha de rede."));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.send();
  });
}
