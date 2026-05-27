"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Inicialização direta do Supabase usando as variáveis de ambiente do Next.js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Prato {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  disponivel: boolean;
  imagem_url?: string;
}

export default function AdminDashboard() {
  const [pratos, setPratos] = useState<Prato[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Estados do Formulário
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [categoria, setCategoria] = useState("");
  const [imagemUrl, setImagemUrl] = useState("");

  useEffect(() => {
    fetchPratos();
  }, []);

  async function fetchPratos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pratos")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      setPratos(data || []);
    } catch (err) {
      console.error("Erro ao buscar pratos:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSalvarPrato(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !preco) return;

    const novoPrato = {
      nome,
      descricao,
      preco: parseFloat(preco),
      categoria: categoria || "Geral",
      disponivel: true,
      imagem_url: imagemUrl || null,
    };

    try {
      const { error } = await supabase.from("pratos").insert([novoPrato]);
      if (error) throw error;
      
      // Limpar formulário e atualizar lista
      setNome("");
      setDescricao("");
      setPreco("");
      setCategoria("");
      setImagemUrl("");
      setIsModalOpen(false);
      fetchPratos();
    } catch (err) {
      alert("Erro ao salvar produto no Supabase");
      console.error(err);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans antialiased selection:bg-[#0071e3]/20">
      {/* Barra de Navegação Superior - Estilo Apple Store */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#f5f5f7]/80 border-b border-[#1d1d1f]/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight text-lg">Plataforma</span>
          <span className="text-[#86868b] text-sm font-normal">/ Dashboard</span>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#0071e3] hover:bg-[#0077ed] text-white text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 shadow-sm"
        >
          Adicionar Produto
        </button>
      </header>

      {/* Conteúdo Principal */}
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[#1d1d1f]">Seu Cardápio</h1>
          <p className="text-[#86868b] mt-1 text-sm">Gerencie os produtos visíveis na vitrine do seu cliente em tempo real.</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20 text-[#86868b] text-sm font-medium">
            Carregando seus produtos do Supabase...
          </div>
        ) : pratos.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-[#1d1d1f]/[0.04] shadow-sm">
            <p className="text-[#86868b] text-base">Nenhum produto cadastrado ainda.</p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="text-[#0071e3] font-medium text-sm mt-3 hover:underline"
            >
              Criar o primeiro item agora &rarr;
            </button>
          </div>
        ) : (
          /* Tabela Limpa Estilo Clean UI */
          <div className="bg-white rounded-2xl border border-[#1d1d1f]/[0.04] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1d1d1f]/[0.06] bg-[#fbfbfd] text-[#86868b] text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Produto</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Preço</th>
                    <th className="px-6 py-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1d1d1f]/[0.04] text-sm text-[#1d1d1f]">
                  {pratos.map((prato) => (
                    <tr key={prato.id} className="hover:bg-[#fbfbfd] transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="font-medium text-[#1d1d1f]">{prato.nome}</div>
                        {prato.descricao && <div className="text-[#86868b] text-xs mt-0.5 max-w-xs truncate">{prato.descricao}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-[#f5f5f7] text-[#1d1d1f] px-2.5 py-1 rounded-md text-xs font-medium">
                          {prato.categoria}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-[#1d1d1f]">
                        {prato.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#34c759]">
                          <span className="w-2 h-2 rounded-full bg-[#34c759]"></span> Ativo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Minimalista de Cadastro */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#1d1d1f]/[0.04]">
            <h2 className="text-xl font-bold tracking-tight mb-4 text-[#1d1d1f]">Novo Item</h2>
            
            <form onSubmit={handleSalvarPrato} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1 uppercase tracking-wider">Nome do Prato *</label>
                <input 
                  type="text" required value={nome} onChange={e => setNome(e.target.value)}
                  className="w-full bg-[#f5f5f7] rounded-xl px-3 py-2.5 text-sm border border-transparent focus:border-[#0071e3] focus:bg-white transition-all outline-none"
                  placeholder="Ex: Monster Bacon"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1 uppercase tracking-wider">Categoria</label>
                <input 
                  type="text" value={categoria} onChange={e => setCategoria(e.target.value)}
                  className="w-full bg-[#f5f5f7] rounded-xl px-3 py-2.5 text-sm border border-transparent focus:border-[#0071e3] focus:bg-white transition-all outline-none"
                  placeholder="Ex: Burgers, Bebidas, Sobremesas"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1 uppercase tracking-wider">Preço (R$) *</label>
                <input 
                  type="number" step="0.01" required value={preco} onChange={e => setPreco(e.target.value)}
                  className="w-full bg-[#f5f5f7] rounded-xl px-3 py-2.5 text-sm border border-transparent focus:border-[#0071e3] focus:bg-white transition-all outline-none"
                  placeholder="0,00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#86868b] mb-1 uppercase tracking-wider">Descrição</label>
                <textarea 
                  value={descricao} onChange={e => setDescricao(e.target.value)}
                  className="w-full bg-[#f5f5f7] rounded-xl px-3 py-2.5 text-sm border border-transparent focus:border-[#0071e3] focus:bg-white transition-all outline-none resize-none h-20"
                  placeholder="Ingredientes e detalhes do prato..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#1d1d1f]/[0.06]">
                <button 
                  type="button" onClick={() => setIsModalOpen(false)}
                  className="text-sm font-medium text-[#86868b] hover:text-[#1d1d1f] px-3 py-2 rounded-xl"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                >
                  Adicionar ao Banco
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
