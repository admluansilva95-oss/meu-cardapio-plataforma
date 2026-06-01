/** Países suportados no cadastro (DDI + formatação nacional). */
export type PhoneCountry = {
  id: string;
  label: string;
  dialCode: string;
  /** Máximo de dígitos após o DDI (sem contar o código do país). */
  maxNationalDigits: number;
  formatNational: (digits: string) => string;
};

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

function formatBrNationalClean(digits: string): string {
  const d = digits.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

function formatGenericNational(digits: string, max: number): string {
  const d = digits.slice(0, max);
  if (!d) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < d.length) {
    const chunk = d.length - i > 4 ? 3 : 4;
    parts.push(d.slice(i, i + chunk));
    i += chunk;
  }
  return parts.join(" ");
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  {
    id: "br",
    label: "Brasil",
    dialCode: "55",
    maxNationalDigits: 11,
    formatNational: formatBrNationalClean,
  },
  {
    id: "ar",
    label: "Argentina",
    dialCode: "54",
    maxNationalDigits: 10,
    formatNational: (d) => formatGenericNational(d, 10),
  },
  {
    id: "pt",
    label: "Portugal",
    dialCode: "351",
    maxNationalDigits: 9,
    formatNational: (d) => formatGenericNational(d, 9),
  },
  {
    id: "us",
    label: "EUA",
    dialCode: "1",
    maxNationalDigits: 10,
    formatNational: (d) => {
      const n = d.slice(0, 10);
      if (n.length <= 3) return n;
      if (n.length <= 6) return `${n.slice(0, 3)} ${n.slice(3)}`;
      return `${n.slice(0, 3)} ${n.slice(3, 6)}-${n.slice(6, 10)}`;
    },
  },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

export function getPhoneCountryByDialCode(dialCode: string): PhoneCountry {
  return PHONE_COUNTRIES.find((c) => c.dialCode === dialCode) ?? DEFAULT_PHONE_COUNTRY;
}

/** Valor armazenado: ex. `+55 11 91234-5678` */
export function formatPhoneValue(country: PhoneCountry, nationalDigits: string): string {
  const national = country.formatNational(nationalDigits);
  if (!national) return "";
  return `+${country.dialCode} ${national}`;
}

export function parsePhoneValue(value: string): {
  country: PhoneCountry;
  nationalDigits: string;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return { country: DEFAULT_PHONE_COUNTRY, nationalDigits: "" };
  }

  let rest = trimmed;
  if (rest.startsWith("+")) {
    rest = rest.slice(1);
  }

  const allDigits = digitsOnly(rest);
  if (!allDigits) {
    return { country: DEFAULT_PHONE_COUNTRY, nationalDigits: "" };
  }

  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    if (allDigits.startsWith(country.dialCode)) {
      return {
        country,
        nationalDigits: allDigits.slice(country.dialCode.length),
      };
    }
  }

  if (allDigits.length === 10 || allDigits.length === 11) {
    return { country: DEFAULT_PHONE_COUNTRY, nationalDigits: allDigits };
  }

  return { country: DEFAULT_PHONE_COUNTRY, nationalDigits: allDigits };
}
