"use client";

import { useMemo } from "react";
import {
  PHONE_COUNTRIES,
  digitsOnly,
  formatPhoneValue,
  getPhoneCountryByDialCode,
  parsePhoneValue,
} from "@/lib/phone";

type PhoneInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
};

export function PhoneInput({
  id,
  value,
  onChange,
  placeholder = "DDD e número",
  className = "",
  selectClassName = "",
  inputClassName = "",
}: PhoneInputProps) {
  const { country, nationalDigits } = useMemo(() => parsePhoneValue(value), [value]);
  const displayNational = country.formatNational(nationalDigits);

  function handleCountryChange(dialCode: string) {
    const next = getPhoneCountryByDialCode(dialCode);
    const trimmed = nationalDigits.slice(0, next.maxNationalDigits);
    onChange(formatPhoneValue(next, trimmed));
  }

  function handleNationalChange(raw: string) {
    const nextDigits = digitsOnly(raw).slice(0, country.maxNationalDigits);
    onChange(formatPhoneValue(country, nextDigits));
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <select
        aria-label="Código do país (DDI)"
        value={country.dialCode}
        onChange={(e) => handleCountryChange(e.target.value)}
        className={`shrink-0 rounded-2xl border border-white/10 bg-black/30 px-2 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15 ${selectClassName}`}
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.id} value={c.dialCode} className="bg-zinc-900 text-white">
            +{c.dialCode} {c.label}
          </option>
        ))}
      </select>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={displayNational}
        onChange={(e) => handleNationalChange(e.target.value)}
        placeholder={placeholder}
        className={`min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-teal-400/35 focus:ring-4 focus:ring-teal-500/15 ${inputClassName}`}
      />
    </div>
  );
}
