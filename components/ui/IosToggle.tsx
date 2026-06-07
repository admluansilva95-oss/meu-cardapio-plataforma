"use client";

export function IosToggle(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  /** "success" = verde quando ativo (ex.: dia aberto na agenda). */
  tone?: "neutral" | "success";
}) {
  const { checked, onChange, disabled, id, "aria-label": ariaLabel, tone = "neutral" } = props;
  const onClass =
    tone === "success"
      ? checked
        ? "bg-emerald-500"
        : "bg-zinc-200"
      : checked
        ? "bg-zinc-900"
        : "bg-zinc-200";
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        "relative inline-flex h-8 w-[3.25rem] shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2",
        onClass,
        disabled ? "cursor-not-allowed opacity-50" : "",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-sm ring-1 ring-black/5 transition duration-200 ease-out",
          checked ? "translate-x-[1.35rem]" : "translate-x-0.5",
        ].join(" ")}
        aria-hidden
      />
    </button>
  );
}
