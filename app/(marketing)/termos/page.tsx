import type { Metadata } from "next";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Termos de uso · Meu Cardápio",
  description: "Termos de uso do serviço Meu Cardápio.",
};

export default function TermosPage() {
  return (
    <LegalPageShell title="Termos de uso">
      <p>
        Estes termos regem o uso da plataforma Meu Cardápio (“Serviço”), oferecida como
        software na nuvem para restaurantes e estabelecimentos de alimentação.
      </p>

      <h2>1. Aceitação</h2>
      <p>
        Ao criar conta, assinar um plano ou utilizar o Serviço, você concorda com estes
        termos. Se não concordar, não utilize a plataforma.
      </p>

      <h2>2. O Serviço</h2>
      <p>
        O Meu Cardápio disponibiliza cardápio digital público, painel administrativo,
        integração com WhatsApp para pedidos e recursos descritos em cada plano contratado.
        Funcionalidades podem evoluir com melhorias e correções.
      </p>

      <h2>3. Conta e responsabilidades</h2>
      <p>
        Você é responsável pelas credenciais de acesso, pelos dados cadastrados (cardápio,
        preços, horários) e pelo atendimento aos seus clientes finais. O conteúdo publicado
        no cardápio é de sua exclusiva responsabilidade.
      </p>

      <h2>4. Assinatura e pagamento</h2>
      <p>
        Planos pagos são processados via Stripe. Valores, periodicidade e benefícios constam
        na página de planos no momento da contratação. Cancelamentos e reembolsos seguem a
        política exibida no checkout e as regras do meio de pagamento.
      </p>

      <h2>5. Uso aceitável</h2>
      <p>
        É proibido usar o Serviço para atividades ilegais, fraude, spam, tentativa de
        invasão, sobrecarga intencional da infraestrutura ou violação de direitos de
        terceiros.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        Buscamos alta disponibilidade, mas o Serviço é oferecido “como está”, sujeito a
        manutenções, atualizações e fatores externos (internet, provedores de nuvem, etc.).
      </p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>
        Na extensão permitida pela lei, o Meu Cardápio não se responsabiliza por lucros
        cessantes, perda de dados causada por uso inadequado ou indisponibilidade temporária
        do Serviço.
      </p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre estes termos podem ser enviadas pelo canal de suporte informado no
        site ou no painel administrativo.
      </p>

      <p className="text-sm text-zinc-500">
        Última atualização: junho de 2026. Este texto é um modelo operacional; ajuste com
        assessoria jurídica antes de campanhas em larga escala.
      </p>
    </LegalPageShell>
  );
}
