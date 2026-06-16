import type { Metadata } from "next";
import { LegalPageShell } from "@/components/marketing/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacidade · Meu Cardápio",
  description: "Política de privacidade e tratamento de dados do Meu Cardápio.",
};

export default function PrivacidadePage() {
  return (
    <LegalPageShell title="Política de privacidade">
      <p>
        Esta política descreve como o Meu Cardápio trata dados pessoais no contexto do
        serviço SaaS para restaurantes, em conformidade com a Lei Geral de Proteção de
        Dados (LGPD — Lei nº 13.709/2018).
      </p>

      <h2>1. Quem somos</h2>
      <p>
        O Meu Cardápio é a plataforma que você utiliza para publicar cardápio digital e
        gerenciar pedidos. O controlador dos dados tratados neste serviço é o responsável
        pela operação comercial da plataforma (dados de contato no site ou painel).
      </p>

      <h2>2. Dados que coletamos</h2>
      <p>
        <strong>Donos de restaurante:</strong> e-mail, senha (hash), dados de assinatura
        (via Stripe), configurações do estabelecimento e conteúdo do cardápio.
      </p>
      <p>
        <strong>Clientes finais (vitrine):</strong> nome, telefone e itens do pedido
        informados no checkout; eventos de navegação agregados quando analytics estiver
        ativo.
      </p>
      <p>
        <strong>Técnicos:</strong> logs de acesso, identificadores de sessão, IP e dados
        necessários à segurança e operação.
      </p>

      <h2>3. Finalidades</h2>
      <p>
        Autenticação, cobrança de assinatura, publicação do cardápio, registro de pedidos,
        suporte, melhoria do produto, prevenção a fraudes e cumprimento de obrigações
        legais.
      </p>

      <h2>4. Bases legais (LGPD)</h2>
      <p>
        Execução de contrato (prestação do SaaS), legítimo interesse (segurança e
        métricas agregadas) e consentimento quando aplicável (ex.: comunicações
        opcionais).
      </p>

      <h2>5. Compartilhamento</h2>
      <p>
        Utilizamos provedores de infraestrutura e pagamento, como Supabase (banco de
        dados e autenticação), Vercel (hospedagem) e Stripe (pagamentos). Não vendemos
        dados pessoais.
      </p>

      <h2>6. Retenção e segurança</h2>
      <p>
        Dados são mantidos enquanto a conta estiver ativa e pelo tempo necessário para
        obrigações legais. Aplicamos controles técnicos como HTTPS, isolamento por tenant
        e políticas de acesso no banco de dados.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode solicitar confirmação de tratamento, acesso, correção, exclusão,
        portabilidade e informações sobre compartilhamento, nos termos da LGPD, pelo canal
        de suporte.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Usamos cookies essenciais para sessão de login e funcionamento do painel. Não
        utilizamos cookies de publicidade de terceiros no produto principal.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Esta política pode ser atualizada. A data da versão vigente consta abaixo.
      </p>

      <p className="text-sm text-zinc-500">
        Última atualização: junho de 2026. Recomendamos revisão jurídica para adequação
        ao seu CNPJ e operação comercial.
      </p>
    </LegalPageShell>
  );
}
