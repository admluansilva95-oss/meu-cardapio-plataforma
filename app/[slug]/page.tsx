"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Prato {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  categoria: string;
  imagem_url?: string;
}

interface ItemCarrinho {
  prato: Prato;
  quantidade: number;
}

export default function CardapioCliente() {
  const params = useParams();
  const slug = params?.slug as string;

  const [pratos, setPratos] = useState<Prato[]>([]);
  const [loading, setLoading] = useState(true);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [isCarrinhoOpen, setIsCarrinhoOpen] = useState(false);

  useEffect(() => {
    if (slug) fetchDadosCardapio();
  }, [slug]);

  async function fetchDadosCardapio() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pratos")
        .select("*")
        .eq("disponivel", true);

      if (error) throw error;
      setPratos(data || []);
    } catch (err) {
      console.error("Erro ao carregar cardápio:", err);
    } finally {
      setLoading(false);
    }
  }

  function adicionarAoCarrinho(prato: Prato) {
    setCarrinho((prev) => {
      const existente = prev.find((item) => item.prato.id === prato.id);
      if (existente) {
        return prev.map((item) =>
          item.prato.id === prato.id ? { ...item, quantidade: item.quantidade + 1 } : item
        );
      }
      return [...prev, { prato, quantidade: 1 }];
    });
  }

  const totalItens = carrinho.reduce((acc, curr) => acc + curr.quantidade, 0);
  const valorTotal = carrinho.reduce((acc, curr) => acc + curr.prato.preco * curr.quantidade, 0);

  function enviarWhatsApp() {
    if (carrinho.length === 0) return;
    
    let mensagem = `*Novo Pedido* 🍔\n\n`;
    carrinho.forEach(item => {
      mensagem += `${item.quantidade}x ${item.prato.nome} - (${(item.prato.preco * item.quantidade).toLocaleString("pt-BR", {style: "currency", currency: "BRL"})})\n`;
    });
    mensagem += `\n*Total:* ${valorTotal.toLocaleString("pt-BR", {style: "currency", currency: "BRL"})}`;
    
    // Altere para o seu número de WhatsApp real de atendimento da plataforma
    const numeroWhats = "5511999999999"; 
    window.open(`https://wa.me/${numeroWhats}?text=${encodeURIComponent(mensagem)}`, "_blank");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center font-sans text-sm text-[#86868b]">
        Carregando vitrine gastronômica...
      </div>
    );
  }

  // Agrupar pratos por categoria
  const categorias = Array.from(new Set(pratos.map(p => p.categoria || "Geral")));

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans antialiased pb-24">
      {/* Cabeçalho Limpo */}
      <header className="bg-white border-b border-[#1d1d1f]/[0.04] py-8 px-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-capitalize">{slug?.replace("-", " ")}</h1>
        <p className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-medium">Cardápio Digital</p>
      </header>

      {/* Listagem do Cardápio */}
      <main className="max-w-2xl mx-auto px-4 mt-8 space-y-10">
        {categorias.map(categoria => (
          <div key={categoria} className="space-y-4">
            <h2 className="text-xs font-bold text-[#86868b] uppercase tracking-widest px-1">{categoria}</h2>
            
            <div className="space-y-3">
              {pratos.filter(p => (p.categoria || "Geral") === categoria).map(prato => (
                <div 
                  key={prato.id} 
                  className="bg-white rounded-2xl p-4 border border-[#1d1d1f]/[0.04] shadow-sm flex justify-between items-start gap-4 hover:scale-[1.01] transition-transform duration-200"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-base text-[#1d1d1f]">{prato.nome}</h3>
                    {prato.descricao && <p className="text-[#86868b] text-xs mt-1 leading-relaxed">{prato.descricao}</p>}
                    <span className="inline-block mt-3 font-mono text-sm font-medium text-[#1d1d1f]">
                      {prato.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                  <button 
                    onClick={() => adicionarAoCarrinho(prato)}
                    className="bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#0071e3] font-bold w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors shrink-0"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      {/* Sacola Flutuante Invisível/Discreta Estilo Apple */}
      {totalItens > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4">
          <button 
            onClick={() => setIsCarrinhoOpen(true)}
            className="w-full bg-[#1d1d1f] hover:bg-[#2d2d2f] text-white py-4 px-6 rounded-full flex items-center justify-between shadow-xl transition-all duration-300 transform active:scale-95"
          >
            <div className="flex items-center gap-2">
              <span className="bg-white/20 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {totalItens}
              </span>
              <span className="text-sm font-medium">Ver Sacola</span>
            </div>
            <span className="text-sm font-semibold font-mono">
              {valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </button>
        </div>
      )}

      {/* Drawer da Sacola de Compras */}
      {isCarrinhoOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col p-6 shadow-2xl animate-slideLeft">
            <div className="flex justify-between items-center pb-4 border-b border-[#1d1d1f]/[0.06]">
              <h2 className="text-lg font-bold tracking-tight">Sua Sacola</h2>
              <button onClick={() => setIsCarrinhoOpen(false)} className="text-[#86868b] text-sm hover:text-black">Fechar</button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {carrinho.map(item => (
                <div key={item.prato.id} className="flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium text-[#1d1d1f]">{item.quantidade}x </span>
                    <span className="text-[#86868b]">{item.prato.nome}</span>
                  </div>
                  <span className="font-mono text-xs text-[#1d1d1f]">
                    {(item.prato.preco * item.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-[#1d1d1f]/[0.06] space-y-4">
              <div className="flex justify-between items-center font-semibold text-base">
                <span>Total</span>
                <span className="font-mono">{valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
              </div>
              <button 
                onClick={enviarWhatsApp}
                className="w-full bg-[#34c759] hover:bg-[#30b651] text-white font-medium py-3.5 rounded-2xl transition-colors text-center text-sm shadow-sm"
              >
                Enviar Pedido no WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
