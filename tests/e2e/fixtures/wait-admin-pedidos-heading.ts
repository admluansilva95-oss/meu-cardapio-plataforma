import { expect, type Page } from "@playwright/test";

const DEFAULT_MS = 55_000;

const E2E_NO_RESTAURANT_MSG =
  "E2E: nenhum restaurante com owner_id = utilizador de E2E_EMAIL (URL sem ?slug=). Corrija no Supabase " +
  "(SQL em tests/e2e/README.md). E2E_RESTAURANT_SLUG só ajuda se já existir linha com esse slug e o mesmo owner_id.";

function adminUrlHasSlug(page: Page): boolean {
  try {
    return new URL(page.url()).searchParams.has("slug");
  } catch {
    return false;
  }
}

/**
 * Depois de `goto` em `/admin?…checkout=success`:
 * - sem `slug` na URL, o cliente mostra "Localizando seu restaurante…" e depois `?slug=…`;
 * - com `slug`, pode ficar no skeleton (`data-testid="admin-dashboard-loading"`) até os dados chegarem.
 * Só então existe o `<h1>Painel de operações</h1>`.
 */
export async function waitForAdminPedidosHeading(page: Page, options?: { timeoutMs?: number }): Promise<void> {
  const timeout = options?.timeoutMs ?? DEFAULT_MS;
  const painel = page.getByRole("heading", { name: /Painel de operações/i });
  const assinaturaPendente = page.getByRole("heading", { name: /Assinatura pendente/i });
  const tentarNovamente = page.getByRole("button", { name: /^Tentar novamente$/i });
  const loadingDash = page.getByTestId("admin-dashboard-loading");
  const locating = page.getByText("Localizando seu restaurante…");

  if (!adminUrlHasSlug(page)) {
    try {
      await page.waitForURL(
        (u) => {
          try {
            return new URL(u).searchParams.has("slug");
          } catch {
            return false;
          }
        },
        { timeout },
      );
    } catch {
      if (await assinaturaPendente.isVisible().catch(() => false)) {
        throw new Error(E2E_NO_RESTAURANT_MSG);
      }
      throw new Error(
        "E2E: a URL do admin não ganhou ?slug= a tempo. Confirme que a conta tem restaurante em `restaurantes` " +
          "ou defina `E2E_RESTAURANT_SLUG` em `.env.e2e`.",
      );
    }
  }

  await expect(
    painel.or(loadingDash).or(assinaturaPendente).or(tentarNovamente).or(locating),
  ).toBeVisible({ timeout });

  if (await assinaturaPendente.isVisible()) {
    throw new Error(E2E_NO_RESTAURANT_MSG);
  }
  if (await tentarNovamente.isVisible()) {
    const snippet =
      (await page.locator("p.max-w-md").first().textContent().catch(() => ""))?.trim() ?? "";
    throw new Error(
      snippet
        ? `E2E: painel não carregou: ${snippet.slice(0, 450)}`
        : "E2E: painel não carregou (verifique slug, RLS ou rede).",
    );
  }

  await expect(painel).toBeVisible({ timeout });
}
