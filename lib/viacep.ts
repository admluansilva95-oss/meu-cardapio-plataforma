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
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResposta;
    if (data.erro === true || data.erro === "true") return null;
    return data;
  } catch {
    return null;
  }
}
