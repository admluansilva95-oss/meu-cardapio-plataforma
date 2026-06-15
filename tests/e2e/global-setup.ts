import { assertE2eRestauranteForOwnerOrSlug } from "./fixtures/assert-e2e-restaurant";
import { loadLocalEnvFiles } from "./fixtures/load-env-files";

/**
 * Garante que `.env.local` / `.env.e2e` são aplicados antes dos workers (alguns setups só leem `process.env` após o config).
 */
export default async function globalSetup(): Promise<void> {
  loadLocalEnvFiles();
  await assertE2eRestauranteForOwnerOrSlug();
}
