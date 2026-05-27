"use client";

import { useMemo, useState } from "react";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function InteractiveDemo() {
  const [restaurantName, setRestaurantName] = useState("");

  const slug = useMemo(() => slugify(restaurantName), [restaurantName]);
  const previewUrl = slug ? `meucardapio.app/${slug}` : "meucardapio.app/seu-restaurante";

  return (
    <section
      id="demo"
      className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32"
      aria-labelledby="demo-heading"
    >
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Demonstração
        </p>
        <h2
          id="demo-heading"
          className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl"
        >
          Veja sua URL em segundos
        </h2>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">
          Digite o nome do restaurante e visualize como ficará o link do seu cardápio digital.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-xl">
        <label htmlFor="restaurant-name" className="sr-only">
          Nome do restaurante
        </label>
        <input
          id="restaurant-name"
          type="text"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          placeholder="Ex.: Casa do Sabor"
          className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-center text-lg text-zinc-900 shadow-sm outline-none ring-zinc-900/0 transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
        />

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Sua URL
          </p>
          <p className="mt-2 font-mono text-sm text-zinc-900 sm:text-base">
            <span className="text-zinc-400">https://</span>
            {previewUrl}
          </p>
        </div>

        {slug ? (
          <p className="mt-4 text-center text-sm text-emerald-700">
            Slug reservado na simulação:{" "}
            <span className="font-medium">{slug}</span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
