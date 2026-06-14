import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextCoreWebVitals,
  {
    rules: {
      /**
       * Desativado: o plugin marca padrões válidos (fetch em `useEffect`, sincronizar
       * formulário com props ao abrir modal, reset ao mudar `slug`) como erro.
       * Mantemos `react-hooks/rules-of-hooks` e `exhaustive-deps` do preset Next.
       */
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
