'use client';

import { useState, useEffect } from 'react';

// ============================================================================
// ⚙️ PAINEL DE CONFIGURAÇÃO GERAL DO SISTEMA
// ============================================================================

// ----------------------------------------------------------------------------
// 🛠️ 1. CONFIGURAÇÕES DO DESENVOLVEDOR (SEUS DADOS)
// ----------------------------------------------------------------------------
const DESENVOLVEDOR_NOME = 'Seu Cardpaio Digital';
const DESENVOLVEDOR_LINK = 'https://seucardapiodigital.com.br'; // Seu portfólio, Instagram ou link do seu WhatsApp

// ----------------------------------------------------------------------------
// 📲 2. INTEGRAÇÃO DE ENVIOS DO SISTEMA (AONDE VÃO OS PEDIDOS)
// ----------------------------------------------------------------------------
// ⚠️ Coloque o código do país + DDD + Número completo. Ex: 55 + 11 + 999999999
const WHATSAPP_RECEBE_PEDIDOS = '5593984250765'; 
const LINK_DO_SITE_EXIBICAO = 'pedidos.saborlocal'; // Domínio do site para o relatório do pedido

// ----------------------------------------------------------------------------
// 🏪 3. DADOS DA LOJA DO CLIENTE (DADOS DO ESTABELECIMENTO)
// ----------------------------------------------------------------------------
const NOME_RESTAURANTE = 'SABOR LOCAL';
const SLOGAN_RESTAURANTE = 'O MELHOR DA CIDADE... PEÇA JÁ O SEU!!!!!!!';
const TELEFONE_EXIBICAO = '(93) 98425-0765';
const ENDERECO_EXIBICAO = 'Rua das Flores, 123 - Centro';

// 📸 IMAGENS DE IDENTIDADE VISUAL DO CLIENTE
const URL_IMAGEM_CAPA = 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80';
const URL_IMAGEM_LOGO = 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=150&q=80';

// 🛵 TAXAS DE ENTREGA DO CLIENTE (BAIRROS ATENDIDOS)
const TAXAS_POR_BAIRRO = [
  { nome: 'Centro', taxa: 5.00 },
  { nome: 'Jardim América', taxa: 7.00 },
  { nome: 'Vila Nova', taxa: 8.50 },
  { nome: 'Parque Industrial', taxa: 10.00 },
  { nome: 'Jardim Primavera', taxa: 11.00 },
  { nome: 'Santa Marta', taxa: 12.50 },
  { nome: 'Residencial Alvorada', taxa: 14.00 },
  { nome: 'Distrito Industrial', taxa: 16.00 },
  { nome: 'Zona Rural / Chácaras', taxa: 18.00 },
];

// ⏰ HORÁRIOS DE FUNCIONAMENTO DO CLIENTE
const HORARIOS_FUNCIONAMENTO = {
  0: { aberto: true, abre: '15:00', fecha: '23:59' },  // Domingo
  1: { aberto: false, abre: '00:00', fecha: '00:00' }, // Segunda (Fechado)
  2: { aberto: true, abre: '15:00', fecha: '23:30' },  // Terça
  3: { aberto: true, abre: '15:00', fecha: '23:30' },  // Quarta
  4: { aberto: true, abre: '15:00', fecha: '23:30' },  // Quinta
  5: { aberto: true, abre: '15:00', fecha: '02:00' },  // Sexta
  6: { aberto: true, abre: '15:00', fecha: '02:00' },  // Sábado
};

// 📂 CATEGORIAS DO CARDÁPIO
type NomesCategorias = 'Promoções' | 'Hambúrgueres' | 'Bebidas' | 'Sobremesas';
const CATEGORIAS_CARDAPIO: NomesCategorias[] = ['Promoções', 'Hambúrgueres', 'Bebidas', 'Sobremesas'];

interface Produto {
  id: number;
  nome: string;
  descricao: string;
  preco: number;
  categoria: NomesCategorias;
  imagem: string;
}

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
}

// 🍔 ITENS DO CARDÁPIO DO CLIENTE
const PRODUTOS_CARDAPIO: Produto[] = [
  { id: 1, nome: 'Combo Promocional', descricao: '2 Burgers + Fritas + Refri 1L. Ideal para dividir.', preco: 75.00, categoria: 'Promoções', imagem: 'https://images.unsplash.com/photo-1594212202875-442220fc84e9?auto=format&fit=crop&w=300&q=80' },
  { id: 2, nome: 'Classic Burger', descricao: 'Carne Angus 180g, Queijo Cheddar, Alface, Tomate e Pão.', preco: 38.90, categoria: 'Hambúrgueres', imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80' },
  { id: 3, nome: 'Monster Bacon', descricao: 'Dois hambúrgueres 150g, muito bacon crocante e queijo.', preco: 45.00, categoria: 'Hambúrgueres', imagem: 'https://images.unsplash.com/photo-1594212202875-442220fc84e9?auto=format&fit=crop&w=300&q=80' },
  { id: 4, nome: 'Coca-Cola Lata', descricao: 'Lata de 350ml trincando de gelada.', preco: 6.00, categoria: 'Bebidas', imagem: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=300&q=80' },
  { id: 5, nome: 'Pudim Artesanal', descricao: 'Fatia generosa de pudim cremoso com calda.', preco: 12.00, categoria: 'Sobremesas', imagem: 'https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?auto=format&fit=crop&w=300&q=80' }
];

// ============================================================================
// ⚙️ LÓGICA E VISUAL DO SISTEMA (AUTO-GERENCIADO - NÃO PRECISA ALTERAR ABAIXO)
// ============================================================================

function formatarMoeda(valor: number): string {
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

function formatarDataHoraPedido(data: Date): string {
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gerarCodigoPedido(): string {
  return Date.now().toString().slice(-6);
}

interface DadosReciboPedido {
  carrinho: ItemCarrinho[];
  nomeCliente: string;
  metodoEntrega: 'entrega' | 'retirada';
  bairroSelecionado: string;
  enderecoCliente: string;
  formaPagamento: string;
  valorDinheiroLimpo: number;
  trocoCalculado: number;
  subtotal: number;
  valorEntrega: number;
  valorTotal: number;
  codigoPedido: string;
}

function montarReciboPedido(dados: DadosReciboPedido): string {
  const qtdItens = dados.carrinho.reduce((acc, item) => acc + item.quantidade, 0);
  const linhas: string[] = [
    `*${NOME_RESTAURANTE}*`,
    `Pedido #${dados.codigoPedido} · ${formatarDataHoraPedido(new Date())}`,
    '',
    '*Cliente*',
    dados.nomeCliente.trim(),
    '',
  ];

  if (dados.metodoEntrega === 'entrega') {
    linhas.push('*Entrega*', `Bairro: ${dados.bairroSelecionado}`, `Endereço: ${dados.enderecoCliente.trim()}`, '');
  } else {
    linhas.push('*Retirada no local*', '');
  }

  linhas.push('*Pagamento*');
  if (dados.formaPagamento === 'Dinheiro') {
    linhas.push('Dinheiro');
    if (!isNaN(dados.valorDinheiroLimpo) && dados.valorDinheiroLimpo > 0) {
      linhas.push(`Paga com: ${formatarMoeda(dados.valorDinheiroLimpo)}`);
      if (dados.trocoCalculado > 0) {
        linhas.push(`Troco: ${formatarMoeda(dados.trocoCalculado)}`);
      }
    }
  } else {
    linhas.push(dados.formaPagamento);
  }

  linhas.push('', `*Itens (${qtdItens})*`);
  dados.carrinho.forEach((item) => {
    const totalItem = item.produto.preco * item.quantidade;
    linhas.push(`${item.quantidade}x ${item.produto.nome} — ${formatarMoeda(totalItem)}`);
  });

  linhas.push('', '*Valores*', `Subtotal: ${formatarMoeda(dados.subtotal)}`);
  if (dados.metodoEntrega === 'entrega' && dados.valorEntrega > 0) {
    linhas.push(`Taxa (${dados.bairroSelecionado}): ${formatarMoeda(dados.valorEntrega)}`);
  }
  linhas.push(`*Total: ${formatarMoeda(dados.valorTotal)}*`, '', `Pedido via ${LINK_DO_SITE_EXIBICAO}`);

  return linhas.join('\n');
}

export default function Cardapio() {
  const [lojaAberta, setLojaAberta] = useState(false);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [metodoEntrega, setMetodoEntrega] = useState<'entrega' | 'retirada'>('entrega');
  const [categoriaAtiva, setCategoriaAtiva] = useState(CATEGORIAS_CARDAPIO[0]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);

  // DADOS DO CLIENTE QUE ESTÁ COMPRANDO
  const [nomeCliente, setNomeCliente] = useState('');
  const [enderecoCliente, setEnderecoCliente] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('Pix');
  const [quantoVaiPagar, setQuantoVaiPagar] = useState('');
  const [bairroSelecionado, setBairroSelecionado] = useState('');
  const [codigoPedidoAtual, setCodigoPedidoAtual] = useState(() => gerarCodigoPedido());
  const [mostrarPreviaRecibo, setMostrarPreviaRecibo] = useState(false);

  useEffect(() => {
    const carrinhoSalvo = localStorage.getItem('carrinho_sabor_local');
    if (carrinhoSalvo) {
      try { setCarrinho(JSON.parse(carrinhoSalvo)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('carrinho_sabor_local', JSON.stringify(carrinho));
  }, [carrinho]);

  useEffect(() => {
    const verificarHorario = () => {
      const agora = new Date();
      const diaSemana = agora.getDay() as keyof typeof HORARIOS_FUNCIONAMENTO;
      const hora = agora.getHours();
      const minuto = agora.getMinutes();
      const configHoje = HORARIOS_FUNCIONAMENTO[diaSemana];

      if (!configHoje || !configHoje.aberto) { setLojaAberta(false); return; }

      const tempoAtual = hora * 60 + minuto;
      const [horaAbre, minAbre] = configHoje.abre.split(':').map(Number);
      const [horaFecha, minFecha] = configHoje.fecha.split(':').map(Number);
      const tempoAbre = horaAbre * 60 + minAbre;
      const tempoFecha = horaFecha * 60 + minFecha;

      if (tempoAbre <= tempoFecha) {
        setLojaAberta(tempoAtual >= tempoAbre && tempoAtual <= tempoFecha);
      } else {
        setLojaAberta(tempoAtual >= tempoAbre || tempoAtual <= tempoFecha);
      }
    };
    verificarHorario();
    const intervalo = setInterval(verificarHorario, 60000);
    return () => clearInterval(intervalo);
  }, []);

  const adicionarAoCarrinho = (produto: Produto) => {
    setCarrinho((atual) => {
      const existe = atual.find(item => item.produto.id === produto.id);
      if (existe) return atual.map(item => item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item);
      return [...atual, { produto, quantidade: 1 }];
    });
  };

  const removerDoCarrinho = (produtoId: number) => {
    setCarrinho((atual) => {
      const item = atual.find(i => i.produto.id === produtoId);
      if (item && item.quantidade > 1) return atual.map(i => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade - 1 } : i);
      return atual.filter(i => i.produto.id !== produtoId);
    });
  };

  const obtenerTaxaEntregaAtual = () => {
    if (metodoEntrega === 'retirada') return 0;
    const buscaBairro = TAXAS_POR_BAIRRO.find(b => b.nome === bairroSelecionado);
    return buscaBairro ? buscaBairro.taxa : 0;
  };

  const subtotal = carrinho.reduce((total, item) => total + (item.produto.preco * item.quantidade), 0);
  const valorEntrega = obtenerTaxaEntregaAtual();
  const valorTotal = subtotal + valorEntrega;
  const produtosFiltrados = PRODUTOS_CARDAPIO.filter(p => p.nome.toLowerCase().includes(termoBusca.toLowerCase()) || p.descricao.toLowerCase().includes(termoBusca.toLowerCase()));

  const valorDinheiroLimpo = parseFloat(quantoVaiPagar.replace(',', '.'));
  const trocoCalculado = !isNaN(valorDinheiroLimpo) && valorDinheiroLimpo > valorTotal ? valorDinheiroLimpo - valorTotal : 0;

  const textoReciboPedido = montarReciboPedido({
    carrinho,
    nomeCliente,
    metodoEntrega,
    bairroSelecionado,
    enderecoCliente,
    formaPagamento,
    valorDinheiroLimpo,
    trocoCalculado,
    subtotal,
    valorEntrega,
    valorTotal,
    codigoPedido: codigoPedidoAtual,
  });

  const scrollToCategoria = (cat: string) => {
    setCategoriaAtiva(cat as any);
    const element = document.getElementById(`cat-${cat}`);
    if (element) {
      const offset = 80;
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const enviarPedidoWhatsApp = () => {
    if (!nomeCliente.trim()) {
      alert('Por favor, informe o seu Nome.');
      return;
    }
    if (metodoEntrega === 'entrega') {
      if (!bairroSelecionado) {
        alert('Por favor, selecione o seu Bairro para calcular a entrega.');
        return;
      }
      if (!enderecoCliente.trim()) {
        alert('Por favor, informe o seu Endereço completo.');
        return;
      }
    }
    
    if (formaPagamento === 'Dinheiro') {
      if (!quantoVaiPagar.trim()) {
        alert('Por favor, informe com qual valor em dinheiro você vai pagar.');
        return;
      }
      if (isNaN(valorDinheiroLimpo) || valorDinheiroLimpo < valorTotal) {
        alert(`O valor pago em dinheiro deve ser maior ou igual ao total do pedido (R$ ${valorTotal.toFixed(2).replace('.', ',')})`);
        return;
      }
    }

    const mensagem = textoReciboPedido;

    localStorage.removeItem('carrinho_sabor_local');
    setCarrinho([]);
    setQuantoVaiPagar('');
    setBairroSelecionado('');
    setNomeCliente('');
    setEnderecoCliente('');
    setFormaPagamento('Pix');
    setMetodoEntrega('entrega');
    setCodigoPedidoAtual(gerarCodigoPedido());
    setMostrarPreviaRecibo(false);
    setCarrinhoAberto(false);

    const linkFinal = `https://api.whatsapp.com/send?phone=${WHATSAPP_RECEBE_PEDIDOS}&text=${encodeURIComponent(mensagem)}`;
    window.open(linkFinal, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-36 font-sans text-gray-800 antialiased">
      
      {/* CAPA E LOGO */}
      <div className="bg-white">
        <div className="h-40 w-full bg-cover bg-center shadow-inner" style={{ backgroundImage: `url('${URL_IMAGEM_CAPA}')` }}></div>
        <div className="relative flex justify-center mt-[-48px]">
          <img src={URL_IMAGEM_LOGO} alt="Logo" className="w-24 h-24 rounded-full border-4 border-white shadow-md object-cover" />
        </div>
        <div className="text-center px-4 mt-3 pb-4 border-b border-gray-100">
          {lojaAberta ? (
            <span className="text-green-700 border border-green-300 bg-green-50 text-[11px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider">● Aberto para pedidos</span>
          ) : (
            <span className="text-red-700 border border-red-300 bg-red-50 text-[11px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider">○ Fechado no momento</span>
          )}
          <h1 className="text-2xl font-black text-gray-950 mt-3 uppercase tracking-wide">{NOME_RESTAURANTE}</h1>
          <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1 leading-relaxed font-medium">{SLOGAN_RESTAURANTE}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto bg-white min-h-screen shadow-sm p-4 relative">
        
        {/* BUSCA */}
        <div className="relative mb-5 sticky top-0 bg-white pt-2 pb-1 z-20">
          <input type="text" placeholder="Buscar no cardápio..." value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-gray-200 transition-all text-gray-900" />
          <span className="absolute left-3.5 top-5 text-gray-400 text-base">🔍</span>
        </div>

        {/* MENU DESLIZANTE FIXO DE CATEGORIAS */}
        <div className="flex overflow-x-auto gap-6 border-b border-gray-100 pb-2 mb-6 sticky top-[60px] bg-white z-20 scrollbar-hide shadow-[0_4px_6px_-6px_rgba(0,0,0,0.05)]">
          {CATEGORIAS_CARDAPIO.map(cat => (
            <button key={cat} onClick={() => scrollToCategoria(cat)} className={`whitespace-nowrap pb-2 text-[13px] font-bold uppercase tracking-wider transition-all ${categoriaAtiva === cat ? 'text-red-600 border-b-2 border-red-600 font-extrabold' : 'text-gray-400 border-b-2 border-transparent hover:text-gray-600'}`}>{cat}</button>
          ))}
        </div>

        {/* LISTA DE PRODUTOS */}
        <div className="flex flex-col gap-8">
          {CATEGORIAS_CARDAPIO.map((categoria) => {
            const produtosDaCategoria = produtosFiltrados.filter(p => p.categoria === categoria);
            if (produtosDaCategoria.length === 0) return null;

            return (
              <div key={categoria} id={`cat-${categoria}`} className="flex flex-col gap-4 scroll-mt-24">
                <h2 className="font-black text-gray-900 text-base flex items-center gap-1.5 uppercase tracking-wide border-l-4 border-red-600 pl-2">{categoria}</h2>

                <div className="flex flex-col gap-3">
                  {produtosDaCategoria.map((produto) => {
                    const itemNoCarrinho = carrinho.find(item => item.produto.id === produto.id);

                    return (
                      <div key={produto.id} className="bg-white p-3 flex gap-3 justify-between items-center border border-gray-100 rounded-xl hover:shadow-sm transition-all bg-gradient-to-r from-white to-gray-50/30">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 text-sm leading-tight mb-1 truncate">{produto.nome}</h3>
                          <p className="text-[11px] text-gray-500 font-medium line-clamp-2 leading-snug mb-3.5 pr-1">{produto.descricao}</p>
                          <div className="flex items-center gap-4">
                            <p className="font-bold text-green-600 text-sm">R$ {produto.preco.toFixed(2).replace('.', ',')}</p>
                            {itemNoCarrinho ? (
                              <div className="flex items-center bg-gray-100 rounded-lg border border-gray-200 h-8 shadow-sm">
                                <button onClick={() => removerDoCarrinho(produto.id)} className="px-2.5 font-black text-gray-600 hover:text-red-600 text-sm transition-colors">-</button>
                                <span className="px-1.5 font-bold text-xs text-gray-900 min-w-[12px] text-center">{itemNoCarrinho.quantidade}</span>
                                <button onClick={() => adicionarAoCarrinho(produto)} className="px-2.5 font-black text-gray-600 hover:text-green-600 text-sm transition-colors">+</button>
                              </div>
                            ) : (
                              <button onClick={() => adicionarAoCarrinho(produto)} className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100/70 px-3.5 py-1.5 rounded-lg border border-red-100 transition-all active:scale-95">Adicionar</button>
                            )}
                          </div>
                        </div>
                        <img src={produto.imagem} alt={produto.nome} className="w-20 h-20 object-cover rounded-lg shadow-sm border border-gray-100 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* FOOTER DO ESTABELECIMENTO + CRÉDITOS AUTOMATIZADOS */}
        <footer className="bg-[#15181c] text-white text-center py-8 px-4 mt-12 rounded-2xl mx-[-16px] mb-[-16px] shadow-inner">
          <h4 className="font-extrabold text-sm mb-2 uppercase tracking-wider">{NOME_RESTAURANTE}</h4>
          <p className="text-xs text-gray-400 mb-1 font-medium">📍 {ENDERECO_EXIBICAO}</p>
          <p className="text-xs text-gray-400 mb-6 font-medium">📞 {TELEFONE_EXIBICAO}</p>
          
          <div className="border-t border-gray-800/60 pt-4 mt-4">
            <p className="text-[11px] text-gray-500 font-medium">
              Desenvolvido por{' '}
              <a 
                href={DESENVOLVEDOR_LINK} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-red-400 hover:text-red-300 font-bold underline transition-colors"
              >
                {DESENVOLVEDOR_NOME}
              </a>
            </p>
          </div>
        </footer>
      </div>

      {/* BARRA FIXA (CARRINHO FECHADO) */}
      {carrinho.length > 0 && !carrinhoAberto && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] flex justify-center z-40">
          <button 
            onClick={() => setCarrinhoAberto(true)}
            className="w-full max-w-md bg-[#2cb456] hover:bg-green-600 active:scale-[0.99] text-white font-bold text-sm py-4 rounded-xl transition-all flex justify-between items-center px-4 shadow-md shadow-green-200"
          >
            <span className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-black">{carrinho.reduce((acc, i) => acc + i.quantidade, 0)}</span>
            <span className="tracking-wide">Ver meu carrinho 🛒</span>
            <span>R$ {valorTotal.toFixed(2).replace('.', ',')}</span>
          </button>
        </div>
      )}

      {/* 🛒 MODAL COMPLETO DO CARRINHO */}
      {carrinhoAberto && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-end z-50 p-0 sm:p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-t-3xl max-h-[90vh] overflow-y-auto p-4 flex flex-col shadow-2xl">
            
            <div className="flex justify-between items-center border-b border-gray-100 pb-3.5 mb-4">
              <h2 className="font-black text-gray-900 text-base uppercase tracking-wide flex items-center gap-2">🛍️ Meu Pedido</h2>
              <button onClick={() => setCarrinhoAberto(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold bg-gray-50 h-8 w-8 flex items-center justify-center rounded-full transition-colors">✕</button>
            </div>

            {/* ITENS SELECIONADOS */}
            <div className="flex flex-col gap-2.5 mb-5 max-h-[220px] overflow-y-auto pr-1">
              {carrinho.map(item => (
                <div key={item.produto.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="min-w-0 flex-1 pr-2">
                    <h4 className="font-bold text-xs text-gray-900 uppercase truncate">{item.produto.nome}</h4>
                    <p className="text-[11px] text-green-600 font-bold mt-0.5">R$ {(item.produto.preco * item.quantidade).toFixed(2).replace('.', ',')}</p>
                  </div>
                  <div className="flex items-center bg-white rounded-lg border border-gray-200 h-8 shadow-xs flex-shrink-0">
                    <button onClick={() => removerDoCarrinho(item.produto.id)} className="px-2.5 font-bold text-gray-500 hover:text-red-600">-</button>
                    <span className="px-1 font-bold text-xs text-gray-900 min-w-[12px] text-center">{item.quantidade}</span>
                    <button onClick={() => adicionarAoCarrinho(item.produto)} className="px-2.5 font-bold text-gray-500 hover:text-green-600">+</button>
                  </div>
                </div>
              ))}
            </div>

            {/* ENTREGA OU RETIRADA */}
            <div className="mb-4">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">Como receber</p>
              <div className="flex gap-2 text-xs font-bold">
                <button onClick={() => setMetodoEntrega('entrega')} className={`flex-1 py-3 text-center border rounded-xl transition-all ${metodoEntrega === 'entrega' ? 'bg-blue-50 text-blue-600 border-blue-300' : 'text-gray-400 border-gray-200 hover:bg-gray-50'}`}>Entrega</button>
                <button onClick={() => { setMetodoEntrega('retirada'); setBairroSelecionado(''); }} className={`flex-1 py-3 text-center border rounded-xl transition-all ${metodoEntrega === 'retirada' ? 'bg-blue-50 text-blue-600 border-blue-300' : 'text-gray-400 border-gray-200 hover:bg-gray-50'}`}>Retirada</button>
              </div>
            </div>

            {/* DADOS E PAGAMENTO */}
            <div className="bg-gray-50 border border-gray-150 rounded-xl p-3.5 mb-4">
              <p className="text-[10px] font-black uppercase text-gray-400 tracking-wider mb-3">Dados e pagamento</p>
              
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Seu Nome Completo:</label>
                  <input type="text" placeholder="Como quer ser chamado?" value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 text-gray-900 font-medium" />
                </div>

                {metodoEntrega === 'entrega' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Seu Bairro:</label>
                      <select 
                        value={bairroSelecionado} 
                        onChange={(e) => setBairroSelecionado(e.target.value)} 
                        className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 text-gray-900 font-medium"
                      >
                        <option value="">-- Escolha seu bairro --</option>
                        {TAXAS_POR_BAIRRO.map((b) => (
                          <option key={b.nome} value={b.nome}>
                            {b.nome} (+ R$ {b.taxa.toFixed(2).replace('.', ',')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Endereço (Rua, Número, Referência):</label>
                      <input type="text" placeholder="Ex: Rua das Rosas, 12 - Ap 3" value={enderecoCliente} onChange={(e) => setEnderecoCliente(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 text-gray-900 font-medium" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Forma de Pagamento:</label>
                  <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 text-gray-900 font-medium">
                    <option value="Pix">Pix (Rápido e Seguro)</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Cartão de Débito">Cartão de Débito</option>
                    <option value="Dinheiro">Dinheiro (Levar Troco)</option>
                  </select>
                </div>

                {/* CAMPO DE TROCO */}
                {formaPagamento === 'Dinheiro' && (
                  <div className="bg-amber-50/60 border border-amber-200 p-3 rounded-lg mt-0.5">
                    <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Vai pagar com qual nota?</label>
                    <input 
                      type="text" 
                      placeholder="Ex: 50, 100, 200..." 
                      value={quantoVaiPagar} 
                      onChange={(e) => setQuantoVaiPagar(e.target.value)} 
                      className="w-full border border-amber-200 rounded-md p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 text-gray-900 font-bold" 
                    />
                    
                    {trocoCalculado > 0 ? (
                      <p className="text-[11px] text-green-700 font-bold mt-2 flex justify-between bg-green-50 px-2 py-1 rounded">
                        <span>💵 Troco que vamos te enviar:</span>
                        <span>R$ {trocoCalculado.toFixed(2).replace('.', ',')}</span>
                      </p>
                    ) : (
                      <p className="text-[10px] text-amber-700 font-medium mt-1.5">O total do seu pedido deu R$ {valorTotal.toFixed(2).replace('.', ',')}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* RESUMO DE VALORES */}
            <div className="text-xs font-medium text-gray-600 mb-3 flex flex-col gap-2 border-t border-gray-100 pt-3.5">
              <div className="flex justify-between"><span>Subtotal</span><span className="text-gray-900 font-bold">{formatarMoeda(subtotal)}</span></div>
              {metodoEntrega === 'entrega' && (
                <div className="flex justify-between text-blue-600">
                  <span>Entrega{bairroSelecionado ? ` · ${bairroSelecionado}` : ''}</span>
                  <span className="font-bold">{bairroSelecionado ? formatarMoeda(valorEntrega) : '—'}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-950 font-black text-base mt-1 pt-2 border-t border-dashed border-gray-200">
                <span>Total</span><span className="text-green-600">{formatarMoeda(valorTotal)}</span>
              </div>
            </div>

            {/* PRÉVIA DO RECIBO (WHATSAPP) */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setMostrarPreviaRecibo((v) => !v)}
                className="w-full text-left text-[11px] font-bold text-gray-500 uppercase tracking-wide flex items-center justify-between py-2"
              >
                <span>Prévia do recibo no WhatsApp</span>
                <span>{mostrarPreviaRecibo ? '▲' : '▼'}</span>
              </button>
              {mostrarPreviaRecibo && (
                <pre className="text-[11px] leading-relaxed text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-3 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                  {textoReciboPedido}
                </pre>
              )}
            </div>

            {/* BOTÃO CONCLUSÃO */}
            <button 
              disabled={!lojaAberta}
              onClick={enviarPedidoWhatsApp}
              className={`w-full text-white font-extrabold text-sm py-4 rounded-xl transition-all text-center tracking-wide active:scale-[0.99] ${lojaAberta ? 'bg-[#2cb456] hover:bg-green-600 shadow-md shadow-green-100' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              {lojaAberta ? 'Confirmar e Enviar Pedido via WhatsApp 🚀' : '🔒 Estabelecimento Fechado no Momento'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
