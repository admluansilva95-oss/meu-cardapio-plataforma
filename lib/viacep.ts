import { latin1SafeFetch } from "@/lib/fetch-latin1-safe";
import { parseAppApiJsonResponse } from "@/lib/http/parse-app-api-json-response";

export type ViaCepResposta = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

export async function buscarEnderecoPorCep(cepDigits: string): Promise<ViaCepResposta | null> {
  const limpo = cepDigits.replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  const url = `https://viacep.com.br/ws/${limpo}/json/`;
  try {
    const res = await latin1SafeFetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const parsed = await parseAppApiJsonResponse<ViaCepResposta>(res);
    if (!parsed.ok) return null;
    const data = parsed.data;
    if (data.erro === true || data.erro === "true") return null;
    return data;
  } catch {
    return null;
  }
}
