/**
 * Serviço isolado: impressão térmica (80/58 mm) via Web USB / Web Bluetooth.
 * Não altera pedidos nem base — só envia bytes ESC/POS ao equipamento escolhido.
 *
 * Requisitos: HTTPS (ou localhost), Chrome/Edge; permissões do browser na primeira impressão.
 */

const ESC = 0x1b;
const GS = 0x1d;

/** Nordic UART (comum em dongles BLE tipo HM-10 / algumas térmicas BLE). */
const BLE_UART_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const BLE_UART_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

export type PedidoParaTermica = {
  id: string;
  cliente: string;
  telefone: string;
  itens: string[];
  total: number;
  pagamento: string;
  observacoes?: string;
  motoboy?: string;
  criado_em: string;
  /** Cabeçalho do cupom (ex.: `restaurante.nome`). */
  nomeEstabelecimento: string;
  /** Só usado em retirada; vem do cadastro do restaurante. */
  enderecoRetiradaBalcao?: string | null;
};

let usbDevice: USBDevice | null = null;
let usbInterfaceNumber: number | null = null;
let usbEndpointOut: number | null = null;

let bleDevice: BluetoothDevice | null = null;
let bleTx: BluetoothRemoteGATTCharacteristic | null = null;

function u8(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

/** Evita incompatibilidade `Uint8Array<ArrayBufferLike>` vs `BufferSource` no TS estrito. */
function asBufferSource(u8: Uint8Array): BufferSource {
  return u8 as unknown as BufferSource;
}

/** Inicializa + tabela de caracteres Latin-1 (muitas térmicas 58/80 mm). */
function escInicializar(): Uint8Array {
  return u8(ESC, 0x40, ESC, 0x74, 0x10);
}

function escAlinhar(c: 0 | 1 | 2): Uint8Array {
  return u8(ESC, 0x61, c);
}

/** Corte parcial (amplamente suportado). */
function escCorteParcial(): Uint8Array {
  return u8(GS, 0x56, 0x42, 0x00);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Converte para bytes Latin-1 seguros (substitui fora do intervalo). */
function textoParaBytesLatin1(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      i++;
      out.push(0x3f);
      continue;
    }
    out.push(code < 256 ? code : 0x3f);
  }
  return new Uint8Array(out);
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPedidoIdTermico(id: string): string {
  if (id.length <= 12) return id;
  return `PED-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function formatarDataHoraPt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--/--/---- --:--";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} - ${hh}:${min}`;
}

function isRetiradaBalcao(p: PedidoParaTermica): boolean {
  return (p.observacoes ?? "").includes("RETIRADA NO BALCAO");
}

/** Ex.: `2x Espeto (R$ 12,00 cada)` */
function parseLinhaItem(
  linha: string,
): { qtd: number; nome: string; unitStr: string; subtotal: number } | null {
  const m = linha.match(/^(\d+)x\s+(.+?)\s+\((R\$\s*[\d.,]+)\s+cada\)\s*$/i);
  if (!m) return null;
  const qtd = Number.parseInt(m[1], 10);
  const nome = m[2].trim();
  const unitStr = m[3].replace(/\s/g, "");
  const unitNum = Number.parseFloat(unitStr.replace(/R\$/i, "").replace(/\./g, "").replace(",", "."));
  const subtotal = Number.isFinite(unitNum) && Number.isFinite(qtd) ? Math.round(unitNum * qtd * 100) / 100 : 0;
  return { qtd, nome, unitStr, subtotal };
}

const LARGURA_COL = 32;

function linhaSeparadora(): string {
  return "-".repeat(Math.min(LARGURA_COL, 42));
}

function padCol(s: string, w: number): string {
  const t = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return t.padEnd(w);
}

function montarTextoCupom(p: PedidoParaTermica): string {
  const sep = linhaSeparadora();
  const nomeEst = (p.nomeEstabelecimento || "RESTAURANTE").trim().toUpperCase();
  const retirada = isRetiradaBalcao(p);

  const linhas: string[] = [];
  linhas.push(sep);
  linhas.push(nomeEst);
  linhas.push(sep);
  linhas.push(`Pedido: #${formatPedidoIdTermico(p.id)}`);
  linhas.push(`Data/Hora: ${formatarDataHoraPt(p.criado_em)}`);
  linhas.push(`Cliente: ${p.cliente.trim() || "-"}`);
  linhas.push(`Contato: ${p.telefone.trim() || "-"}`);
  linhas.push(sep);
  linhas.push("ITENS DO PEDIDO");
  linhas.push(sep);

  let subtotalItens = 0;
  linhas.push(`${padCol("QTD", 4)}${padCol("PRODUTO", 18)}${padCol("VALOR", 10)}`);
  for (const it of p.itens) {
    const parsed = parseLinhaItem(it);
    if (parsed) {
      subtotalItens += parsed.subtotal;
      const val = formatBRL(parsed.subtotal).padStart(10);
      const q = String(parsed.qtd).padStart(2).padEnd(4);
      const nome = padCol(parsed.nome, 18);
      linhas.push(`${q}${nome}${val}`);
    } else {
      linhas.push(it.length > LARGURA_COL ? `${it.slice(0, LARGURA_COL - 1)}…` : it);
    }
  }

  linhas.push(sep);
  linhas.push(retirada ? "TIPO: RETIRADA NO BALCAO" : "TIPO: ENTREGA");

  if (retirada) {
    const end = (p.enderecoRetiradaBalcao ?? "").trim();
    linhas.push(end ? `Onde retirar:\n${end}` : "Onde retirar: (ver WhatsApp / painel)");
  } else {
    const obs = (p.observacoes ?? "").trim();
    const trecho = obs.length > 380 ? `${obs.slice(0, 377)}...` : obs;
    if (trecho) {
      linhas.push("Detalhes / endereco (resumo):");
      linhas.push(trecho);
    } else {
      linhas.push("Detalhes / endereco: (ver observacoes no painel)");
    }
    const taxa = Math.max(0, Math.round((p.total - subtotalItens) * 100) / 100);
    if (taxa > 0.001) {
      linhas.push(`Taxa entrega: ${formatBRL(taxa)}`);
    }
  }

  if ((p.motoboy ?? "").trim()) {
    linhas.push(`Motoboy: ${p.motoboy!.trim()}`);
  }

  linhas.push(sep);
  linhas.push(`TOTAL: ${formatBRL(p.total)}`);
  linhas.push(sep);
  linhas.push("Obrigado pela preferencia!");
  linhas.push("");
  linhas.push("");

  return linhas.join("\n");
}

function montarPayloadEscPos(p: PedidoParaTermica): Uint8Array {
  const texto = montarTextoCupom(p);
  const body = textoParaBytesLatin1(texto);
  return concatBytes(escInicializar(), escAlinhar(0), body, u8(0x0a, 0x0a), escCorteParcial());
}

async function enviarUsb(data: Uint8Array): Promise<void> {
  const usb = navigator.usb;
  if (!usb) {
    throw new Error("Web USB indisponivel. Use Chrome ou Edge em HTTPS (ou localhost).");
  }

  let dev = usbDevice;
  if (dev && !dev.opened) {
    usbDevice = null;
    usbInterfaceNumber = null;
    usbEndpointOut = null;
    dev = null;
  }

  if (!dev || !dev.opened) {
    dev = await usb.requestDevice({ filters: [{ classCode: 0x07 }] });
    await dev.open();
    if (dev.configuration == null) {
      if (dev.configurations?.length) {
        await dev.selectConfiguration(dev.configurations[0].configurationValue);
      }
    } else {
      await dev.selectConfiguration(dev.configuration.configurationValue);
    }

    let ifaceNum: number | null = null;
    let epOut: number | null = null;
    const conf = dev.configuration;
    if (!conf) throw new Error("Impressora USB: nenhuma configuracao.");

    for (const iface of conf.interfaces) {
      const alt = iface.alternates[0];
      if (!alt) continue;
      const ep = alt.endpoints.find(
        (e: USBEndpoint) => e.direction === "out" && e.type === "bulk",
      );
      if (ep) {
        ifaceNum = iface.interfaceNumber;
        epOut = ep.endpointNumber;
        break;
      }
    }
    if (ifaceNum == null || epOut == null) {
      try {
        await dev.close();
      } catch {
        /* ignore */
      }
      throw new Error("Nao foi encontrado endpoint USB de saida (bulk OUT). Escolha outra impressora ou use Bluetooth.");
    }

    await dev.claimInterface(ifaceNum);
    usbDevice = dev;
    usbInterfaceNumber = ifaceNum;
    usbEndpointOut = epOut;
  }

  const chunk = 2048;
  for (let i = 0; i < data.length; i += chunk) {
    const slice = data.subarray(i, Math.min(i + chunk, data.length));
    const r = await dev.transferOut(usbEndpointOut!, asBufferSource(slice));
    if (r.status !== "ok") {
      throw new Error(`USB transferOut falhou: ${r.status}`);
    }
  }
}

async function enviarBle(data: Uint8Array): Promise<void> {
  const bt = navigator.bluetooth;
  if (!bt) {
    throw new Error("Web Bluetooth indisponivel. Use Chrome em HTTPS (ou localhost).");
  }

  let server = bleDevice?.gatt?.connected ? bleDevice!.gatt! : null;
  if (!bleDevice || !server?.connected || !bleTx) {
    bleDevice = null;
    bleTx = null;
    server = null;
  }

  if (!bleDevice || !server?.connected || !bleTx) {
    const device = await bt.requestDevice({
      optionalServices: [BLE_UART_SERVICE],
      acceptAllDevices: true,
    });
    const gatt = device.gatt;
    if (!gatt) throw new Error("GATT indisponivel neste dispositivo.");
    server = await gatt.connect();
    const svc = await server.getPrimaryService(BLE_UART_SERVICE);
    const tx = await svc.getCharacteristic(BLE_UART_TX);
    bleDevice = device;
    bleTx = tx;
  }

  if (!bleTx) throw new Error("Caracteristica BLE TX nao encontrada (UART Nordic).");

  const txChar = bleTx;
  const chunk = 100;
  for (let i = 0; i < data.length; i += chunk) {
    const slice = data.subarray(i, Math.min(i + chunk, data.length));
    const buf = asBufferSource(slice);
    if (typeof txChar.writeValueWithoutResponse === "function") {
      try {
        await txChar.writeValueWithoutResponse(buf);
      } catch {
        await txChar.writeValue(buf);
      }
    } else {
      await txChar.writeValue(buf);
    }
  }
}

/**
 * Libera cache USB/BLE (proxima impressao volta a pedir o dispositivo se necessario).
 */
export function limparConexaoImpressoraTermica(): void {
  void (async () => {
    try {
      if (usbDevice?.opened && usbInterfaceNumber != null) {
        await usbDevice.releaseInterface(usbInterfaceNumber);
      }
    } catch {
      /* ignore */
    }
    try {
      if (usbDevice?.opened) await usbDevice.close();
    } catch {
      /* ignore */
    }
    usbDevice = null;
    usbInterfaceNumber = null;
    usbEndpointOut = null;

    try {
      if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
    } catch {
      /* ignore */
    }
    bleDevice = null;
    bleTx = null;
  })();
}

export type ImprimirPedidoTermicoModo = "usb" | "bluetooth" | "auto";

/**
 * Imprime cupom ESC/POS. Primeira vez: dialogo do browser para escolher impressora.
 * Em `auto`, tenta USB em cache → USB novo → BLE em cache → BLE novo.
 */
export async function imprimirPedidoTermico(
  pedido: PedidoParaTermica,
  modo: ImprimirPedidoTermicoModo = "auto",
): Promise<void> {
  const payload = montarPayloadEscPos(pedido);

  const tentarUsb = async () => {
    await enviarUsb(payload);
  };
  const tentarBle = async () => {
    await enviarBle(payload);
  };

  if (modo === "usb") {
    await tentarUsb();
    return;
  }
  if (modo === "bluetooth") {
    await tentarBle();
    return;
  }

  try {
    await tentarUsb();
    return;
  } catch (eUsb) {
    try {
      await tentarBle();
      return;
    } catch (eBle) {
      const m1 = eUsb instanceof Error ? eUsb.message : String(eUsb);
      const m2 = eBle instanceof Error ? eBle.message : String(eBle);
      throw new Error(`Impressao falhou. USB: ${m1} | Bluetooth: ${m2}`);
    }
  }
}
