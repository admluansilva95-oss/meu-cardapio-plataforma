import { expect, type Locator } from "@playwright/test";

/**
 * Preenche input controlado pelo React após hidratação.
 * Se o fill ocorrer antes da hidratação, o React pode repor o valor inicial e o teste falha silenciosamente.
 */
export async function fillWhenHydrated(locator: Locator, value: string) {
  await expect(async () => {
    await locator.clear();
    await locator.fill(value);
    await expect(locator).toHaveValue(value);
  }).toPass({ timeout: 15_000 });
}
