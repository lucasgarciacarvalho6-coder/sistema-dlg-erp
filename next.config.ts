import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Contas a Receber passou da Cobrança para o Financeiro (07/10/2026): o endereço antigo abre a tela nova
  async redirects() {
    return [{ source: "/cobranca/titulos", destination: "/financeiro/contas-receber", permanent: false }];
  },
};

export default nextConfig;
