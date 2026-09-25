# DLG Photos ERP

ERP da **DLG Photos** (fotografia escolar e formaturas), com **áreas totalmente segregadas por setor**:
Administração, Gerência, Operacional, Vendas, Produção, Financeiro e Cobrança.

Cada setor tem layout, menu e dashboard próprios, com metas diárias e mensais por colaborador.
Tudo o que um setor registra alimenta, em **tempo real**, a **Visão TV** do administrador.

> **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions)

---

## Sumário

1. [Como rodar](#1-como-rodar)
2. [Modos de funcionamento](#2-modos-de-funcionamento)
3. [Arquitetura](#3-arquitetura)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Setores, rotas e telas](#5-setores-rotas-e-telas)
6. [Controle de acesso](#6-controle-de-acesso)
7. [Metas e dashboards](#7-metas-e-dashboards)
8. [Fluxo entre setores](#8-fluxo-entre-setores)
9. [Banco de dados (Supabase)](#9-banco-de-dados-supabase)
10. [Segurança](#10-segurança)
11. [Árvore de desenvolvimento: status](#11-árvore-de-desenvolvimento-status)
12. [Fases do projeto](#12-fases-do-projeto)
13. [Design system](#13-design-system)
14. [Limitações conhecidas e próximos passos](#14-limitações-conhecidas-e-próximos-passos)

---

## 1. Como rodar

Pré-requisitos: **Node.js 20+** e npm.

```bash
npm install
cp .env.example .env.local   # preencha com os dados do Supabase (ou deixe como está para o modo demonstração)
npm run dev                  # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (também verifica os tipos) |
| `npm start` | Sobe o build de produção |
| `npm run lint` | ESLint |

> Variáveis `NEXT_PUBLIC_*` só são lidas na inicialização. **Depois de alterar o `.env.local`, reinicie o `npm run dev`.**

---

## 2. Modos de funcionamento

O modo é escolhido **automaticamente** por `lib/supabase/config.ts`, a partir do `.env.local`.

| `.env.local` | Modo | Dados | Uso |
|---|---|---|---|
| Valores de exemplo (`seu-projeto`) | **Demonstração** | `localStorage` do navegador, com dados fictícios gerados em `lib/erp/seed.ts` | Apresentar, testar layout e fluxos sem backend |
| URL e chave pública reais | **Supabase** | Banco Postgres, protegido por RLS | Uso real |

- **Modo demonstração**
  - Contas de acesso rápido na tela de login, todas com a senha `123456`.
  - Cada aba do navegador tem a sua própria sessão. Dá para abrir o ADM numa aba e a Vendas em outra e ver o tempo real funcionando.
- **Modo Supabase**
  - Login real com Supabase Auth.
  - O proxy protege as rotas no servidor.
  - As regras entre setores rodam em triggers no banco.
  - O Realtime atualiza as telas quando outro setor altera dados.

O passo a passo completo de montagem do Supabase está em [`docs/SUPABASE_PROMPT.md`](docs/SUPABASE_PROMPT.md).

---

## 3. Arquitetura

```
                      ┌─────────────────┐
                      │      LOGIN      │  app/login  →  store.login()
                      └────────┬────────┘
                identifica usuário → setor → perfil
                               │
            proxy.ts (servidor): sessão válida? setor permitido? (função pode() do banco)
                               │
   ┌──────────┬──────────┬─────┴─────┬──────────┬──────────┬──────────┐
   │ Gerência │Operacional│  Vendas   │ Produção │Financeiro│ Cobrança │   ← layouts isolados (SectorShell)
   └────┬─────┴────┬─────┴─────┬─────┴────┬─────┴────┬─────┴────┬─────┘
        └──────────┴───────────┼──────────┴──────────┴──────────┘
                               ▼
                 ┌───────────────────────────┐
                 │        NÚCLEO ERP         │  lib/erp/store.ts (hooks + ações)
                 │  Supabase: tabelas + RLS  │  docs/supabase/schema.sql
                 │  triggers = regras entre  │  (demo: lib/erp/fluxos.ts)
                 │  setores · Realtime       │
                 └─────────────┬─────────────┘
                               ▼
                 ┌───────────────────────────┐
                 │   ADM — VISÃO TV (total)  │  app/adm
                 └───────────────────────────┘
```

**Princípios:**

- **Esconder o menu não protege o dado.** A autorização é validada no servidor, em duas camadas:
  1. o `proxy.ts` bloqueia a rota;
  2. o **RLS** do Postgres filtra cada linha.

  Um usuário de Vendas que chamar a API de Cobrança recebe lista vazia.
- **Núcleo central, e não "envio para o ADM".** Cada setor grava no núcleo. As regras de negócio (triggers) geram os efeitos nos outros setores, e o ADM **lê** o núcleo inteiro.
- **As telas não sabem qual modo está ativo.** Elas usam apenas `useErp()`, `useUsuario()`, `usePode()` e as ações de `lib/erp/store.ts`.

---

## 4. Estrutura de pastas

```
src/
├── app/                              # Rotas (App Router)
│   ├── page.tsx                      # / → redireciona para /login
│   ├── login/                        # Login, acesso rápido (demo) e recuperação de senha
│   ├── redefinir-senha/              # Destino do link de recuperação (Supabase Auth)
│   ├── adm/                          # ── ÁREA ADMINISTRADOR (visão total)
│   │   ├── page.tsx                  #    Visão TV: números gigantes, equipe, gráfico consolidado, feed ao vivo
│   │   ├── colaboradores/            #    Cadastro da equipe, setor, foto, ativação
│   │   ├── permissoes/               #    Matriz de acesso (perfil × módulo × ação)
│   │   ├── metas/                    #    Metas diárias/mensais por colaborador
│   │   ├── cadastros/                #    Núcleo central: escolas, produtos, fornecedores, estoque, filiais
│   │   ├── relatorios/               #    PDF / Excel / CSV
│   │   ├── auditoria/                #    Logs de login, acesso, alterações e exclusões
│   │   └── configuracoes/            #    Empresa, backup, integrações
│   ├── gerencia/                     # ── GERÊNCIA: painel tático, metas, aprovações, relatórios
│   ├── operacional/                  # ── OPERACIONAL: metas, controle*, contratos*, agenda*, tarefas, histórico
│   ├── vendas/                       # ── VENDAS: dashboard das vendedoras, leads, contratos, preços, histórico
│   ├── producao/                     # ── PRODUÇÃO: dashboard, ordens, matéria-prima, qualidade, histórico
│   ├── financeiro/                   # ── FINANCEIRO: dashboard, contas a pagar, comissões, fluxo de caixa, histórico
│   ├── cobranca/                     # ── COBRANÇA: dashboard, vendas de e-books, títulos, inadimplência, acordos, histórico
│   ├── layout.tsx · globals.css      # Layout raiz, fontes, animações e scrollbar
│   └── */layout.tsx                  # Um layout isolado por setor → <SectorShell setor="...">
│
├── components/erp/
│   ├── SectorShell.tsx               # Guarda de acesso + Sidebar (menu SÓ do setor) + Header + avisos
│   ├── Header.tsx                    # Relógio, "ao vivo", notificações, foto, alterar senha, sair
│   ├── SectorDashboard.tsx           # Dashboard padrão de setor (KPIs de meta, gráficos, equipe, feed)
│   ├── TeamGoalCards.tsx             # Cartões de meta por colaborador (dashboards de setor)
│   ├── EquipeCards.tsx               # Cards da Visão TV: foto, meta do dia/mês, gráfico, metas batidas
│   ├── PainelSetores.tsx             # Grade de setores, gráfico consolidado, ranking geral
│   ├── CrudPage.tsx                  # Tabela + formulário genéricos com permissões por ação
│   ├── LancamentoModal.tsx           # "Registrar produção"
│   ├── MetasEditor.tsx · HistoricoLancamentos.tsx · RelatoriosPanel.tsx
│   ├── ui.tsx                        # Design system: Panel, StatCard, BarChart, Badge, Modal, Tabs, Avatar...
│   └── Icon.tsx                      # Ícones SVG puros
│
├── lib/
│   ├── erp/
│   │   ├── types.ts                  # Tipos (espelham as tabelas do banco)
│   │   ├── config.ts                 # Setores, indicadores, metas padrão, menus, etapas
│   │   ├── permissions.ts            # Matriz padrão e pode(usuario, modulo, acao)
│   │   ├── store.ts                  # NÚCLEO: estado, sessão, hooks e ações (demo | Supabase)
│   │   ├── supabase-sync.ts          # Carga do banco → estado (paginada)
│   │   ├── adaptador.ts              # camelCase ↔ snake_case + colunas graváveis por tabela
│   │   ├── fluxos.ts                 # Regras entre setores (modo demo; no Supabase são triggers)
│   │   ├── metrics.ts                # Somas, séries diárias, metas, projeção, metas batidas, fluxo de caixa
│   │   ├── seed.ts                   # Dados fictícios do modo demonstração
│   │   ├── imagem.ts                 # Recorte/compressão de foto de perfil
│   │   ├── export.ts                 # CSV, Excel e PDF
│   │   ├── opcoes.ts · format.ts     # Opções de selects; datas, moeda e números (pt-BR)
│   └── supabase/
│       ├── config.ts                 # Lê o .env.local e decide o modo
│       └── client.ts                 # Cliente do navegador (@supabase/ssr, sessão em cookies)
│
├── proxy.ts                          # Proteção de rotas no servidor (antigo "middleware" no Next 16)
├── supabase/functions/
│   └── admin-colaboradores/          # Edge Function: criar / alterar acesso / excluir colaborador
├── docs/
│   ├── ARQUITETURA.md                # Mapa árvore → implementação
│   ├── SUPABASE_PROMPT.md            # Guia de montagem do Supabase (passo a passo)
│   └── supabase/
│       ├── schema.sql                # Banco completo (tabelas, RLS, triggers, auditoria, views, realtime, storage)
│       ├── 002_realtime_completo.sql # Atualização: realtime em todas as tabelas
│       └── 003_fotos_perfil.sql      # Atualização: fotos de perfil (bucket avatares)
├── public/logo.png
└── .env.example                      # Modelo de variáveis (o .env.local NÃO vai para o Git)
```

> O Operacional segue o processo real de campo: veja [Processo operacional](#8b-processo-operacional-campo).

---

## 5. Setores, rotas e telas

| Setor | Rota inicial | Telas | Indicadores de meta |
|---|---|---|---|
| **Administração** | `/adm` | Visão TV, Colaboradores, Matriz de acesso, Metas, Cadastros, Relatórios, Auditoria, Configurações e atalhos para todos os setores | — (visão total) |
| **Gerência** | `/gerencia` | Painel tático, Metas das equipes, Aprovações, Relatórios e atalhos para todos os setores | Aprovações analisadas |
| **Operacional** | `/operacional/metas` | Dashboard & metas, Controle operacional (gestão diária, dashboard, rotas, vendedores PJ, fotógrafos, motoristas), Contratos de escola, Agenda fotográfica, Fechamento operacional, Tarefas avulsas, Histórico | Fichas fotografadas |
| **Vendas** | `/vendas` | Dashboard das vendedoras, Leads & prospecção, Contratos (pedidos), Tabela de preços, Histórico | Contratos fechados, Escolas visitadas |
| **Produção** | `/producao` | Dashboard, Ordens de produção, Matéria-prima, Qualidade & perdas, Histórico | Fotos editadas, E-books gerados |
| **Financeiro** | `/financeiro` | Dashboard, Contas a pagar, Pagamentos operacionais (PIX dos fechamentos), Fluxo de caixa, Histórico | Pagamentos processados |
| **Cobrança** | `/cobranca` | Dashboard, Vendas de e-books, Contas a receber, Inadimplência, Acordos, Histórico | E-books vendidos, Valor recebido |

**Login.** O sistema identifica o colaborador pelo e-mail, lê o **setor** e redireciona para a rota inicial dele.
Quem define o setor é o ADM, em `/adm/colaboradores`, e o perfil (ADM, GERENTE ou COLABORADOR) é derivado automaticamente do setor.

---

## 6. Controle de acesso

Ações por módulo: **visualizar · criar · editar · excluir · exportar**.

| Perfil | Quem é | Acesso |
|---|---|---|
| **ADM** | Setor `adm` | **Total**, não editável |
| **GERENTE** | Setor `gerencia` | Todos os setores. No ADM: Visão TV, relatórios e auditoria em leitura. Não cria colaboradores nem altera permissões. Ajustável na Matriz |
| **COLABORADOR** | Demais setores | **Somente o próprio setor** (visualizar, criar, editar, exportar). Lança produção apenas em nome próprio |

A mesma regra existe em três lugares:

| Camada | Arquivo | Papel |
|---|---|---|
| Interface | `lib/erp/permissions.ts` → `pode()` | Esconde menus e botões |
| Servidor (rota) | `proxy.ts` | Redireciona antes de renderizar |
| Banco (dado) | `schema.sql` → `public.pode()` + RLS | **Proteção real**: filtra cada linha e cada gravação |

---

## 7. Metas e dashboards

- Cada colaborador tem **meta diária** e **meta mensal** por indicador do seu setor. O padrão vem de `lib/erp/config.ts`, e o ADM ou a Gerência ajustam em **Metas**.
- **Meta do setor** = soma das metas individuais dos colaboradores ativos.
- A **produção** é registrada por **lançamentos**, que podem ser manuais ("Registrar produção") ou automáticos, gerados pelos fluxos.
- Cada dashboard de setor mostra:
  - o mês e o dia contra a meta;
  - a projeção do mês e o necessário por dia;
  - o gráfico diário;
  - cartões por colaborador;
  - o feed de lançamentos.
- A **Visão TV do ADM** reúne:
  - números gigantes: faturado, fotografado, em produção;
  - os **cards de cada colaborador**, com foto, meta do dia e do mês, gráfico diário, dias em que a meta foi batida e quanto falta;
  - o gráfico consolidado (% da meta diária de todas as áreas), a grade por setor, o ranking e o feed ao vivo;
  - o botão **Modo TV**, que coloca a tela cheia.

---

## 8. Fluxo entre setores

```
VENDEDORA fecha CONTRATO ──► meta da vendedora
                          ├─► tarefa "Agendar sessão fotográfica" (Operacional)
                          ├─► ordem de produção (Produção)
                          └─► notificação (ADM, Gerência, Operacional, Produção)

PRODUÇÃO avança a ordem ──► "E-book gerado": meta do editor
                        └─► "Concluído": avisa a Cobrança (e-books liberados)

COBRANÇA vende E-BOOK aos pais ──► meta do cobrador
                               └─► N parcelas em Contas a Receber
   (a escola não recebe % da venda: recebe a bonificação por ficha no fechamento operacional)

BAIXA de título ──► valor recebido (meta da Cobrança + faturamento do ADM + entrada no caixa)
TÍTULO atrasado ──► Negociar ──► ACORDO ──► aprovação da Gerência
CONTA ≥ R$ 5.000 ──► aprovação da Gerência ──► decisão atualiza a origem + meta da Gerência
PAGAMENTO (conta/comissão) ──► meta do Financeiro + saída no fluxo de caixa
ESTOQUE < mínimo ──► alerta para Produção e ADM
META DIÁRIA BATIDA ──► notificação para ADM, Gerência e o setor
```

Cada setor **cria** a informação, mas não ganha acesso aos dados dos outros. A vendedora não passa a ver a Cobrança porque seu contrato gerou títulos.

- **Supabase:** triggers em `docs/supabase/schema.sql` (seção 5).
- **Demonstração:** `lib/erp/fluxos.ts`.

---

## 8b. Processo operacional (campo)

```
VENDEDOR PJ fecha o contrato (papel)
   └─► CONTRATOS DE ESCOLA: importar arquivo → revisar campos → "Em conferência"
         • obrigatórios: escola, cidade, endereço, telefone, diretora, vendedor, fichas, data, bonificação/ficha
         • PIX da escola pode ser completado depois (não bloqueia)
   └─► diretora confirma → "Enviar à agenda" ─► AGENDA FOTOGRÁFICA (visita) + ordem na PRODUÇÃO
         • histórico de contatos: fichas autorizadas pelos pais
         • equipe, carro, fotógrafos e motorista (freelancers)
   └─► ENCERRAR VISITA (fichas fotografadas) ─► meta do Operacional + fotos para tratamento na Produção
   └─► FECHAMENTO OPERACIONAL
         • escola (diário):   fichas bonificadas × R$/ficha  + ajudantes (valor combinado)
         • vendedor (semanal): alunos fotografados nas escolas dele × R$ por aluno
         • freelancer (semanal): dias na agenda × (diária + R$ 80 de alimentação)
         • salvar rascunho · imprimir recibos · ENVIAR AO FINANCEIRO
   └─► FINANCEIRO › Pagamentos Operacionais: um PIX por favorecido → "PIX feito" → fechamento "Pago"
```

- **Gestão diária** (Controle Operacional) lista só as pendências acionáveis: contratos a conferir, PIX faltando, fichas a confirmar, equipes a definir, visitas a encerrar, fechamentos a enviar e vendedores sem contato. Resolvida na origem, a pendência some sozinha.
- **Cadastros PJ** (sem login): vendedores de contrato (R$ por aluno fotografado, histórico de contatos), fotógrafos (diária de R$ 150 a 200) e motoristas (diária de ~R$ 200).
- **Controle de rota**: uma rota por vendedor e estado, com as cidades na ordem de visita, o resultado de cada visita e os contratos fechados.
- **Banco**: tabelas e triggers em `docs/supabase/004_operacional.sql`. Regras no front: `lib/erp/operacional.ts` e `lib/erp/fluxos.ts`.

---

## 9. Banco de dados (Supabase)

**Ordem de instalação:** siga o guia completo em [`docs/SUPABASE_PROMPT.md`](docs/SUPABASE_PROMPT.md).

1. `docs/supabase/schema.sql`: banco completo. Em instalação nova, basta este.
2. `docs/supabase/002_realtime_completo.sql`, `003_fotos_perfil.sql` e `004_operacional.sql`: só para bancos criados com versões anteriores do schema.
3. Criar o primeiro ADM: *Authentication → Add user* e depois o `insert` em `colaboradores` (no final do schema).
4. Publicar a Edge Function `admin-colaboradores`, deixando **Verify JWT with legacy secret desligado**, porque a função valida o usuário sozinha.
5. Preencher o `.env.local` e reiniciar.

| Grupo | Tabelas |
|---|---|
| Núcleo | `empresas`, `filiais`, `colaboradores`, `permissoes`, `indicadores`, `metas`, `lancamentos` |
| Cadastros centrais | `escolas`, `produtos`, `fornecedores`, `estoque` |
| Vendas | `leads`, `contratos` |
| Operacional | `contratos_escola`, `agenda_visitas`, `agenda_historico`, `fechamentos`, `pj_vendedores`, `freelancers`, `historico_contatos`, `rotas`, `rota_cidades`, `tarefas_operacionais` |
| Produção | `ordens_producao`, `qualidade` |
| Cobrança | `vendas_ebooks`, `titulos`, `acordos` |
| Financeiro | `contas_pagar` (com PIX e origem do fechamento), `comissoes` (legado, sem uso) |
| Gerência | `aprovacoes` |
| Sistema | `notificacoes`, `notificacao_leituras`, `auditoria` |
| Views | `vw_producao_diaria`, `vw_titulos`, `vw_metas_colaborador` (`security_invoker`) |
| Storage | `avatares` (fotos de perfil), `contratos`, `ebooks` |

---

## 10. Segurança

- **RLS em todas as tabelas.** A função `pode(modulo, acao)` replica a matriz de acesso.
- **Perfil derivado do setor** por trigger. Ninguém se promove a ADM, e só o ADM cria contas do setor ADM.
- **Cadastro público desativado.** Só o ADM cria contas, pela Edge Function que usa a `service_role` no servidor.
- **Lançamentos imutáveis:** não há UPDATE, só inclusão e exclusão, e ambas ficam auditadas. Lançamentos automáticos só vêm de triggers.
- **Auditoria automática** de criação, alteração e exclusão, com usuário, data/hora, IP e os dados antes e depois. LOGIN, LOGOUT, ACESSO e LOGIN_FALHOU entram pela RPC `registrar_evento`.
- **Funções internas** (`lancar`, `notificar`, `pedir_aprovacao`) não podem ser chamadas pela API.
- **Segredos:** o `.env.local` fica fora do Git. O front usa **apenas a chave pública** (`anon` ou publishable).
- **Fuso horário** `America/Sao_Paulo` no banco: as metas diárias viram à meia-noite de Brasília.

Checklist antes de produção: [`docs/SUPABASE_PROMPT.md` → seção 5](docs/SUPABASE_PROMPT.md).

---

## 11. Árvore de desenvolvimento: status

Legenda: ✅ pronto · 🟡 parcial · ⬜ pendente

```
ERP
├── 01. AUTENTICAÇÃO / LOGIN
│   ├── ✅ Login · ✅ Logout · ✅ Recuperação de senha · ✅ Alteração de senha
│   ├── ✅ Controle de sessão (Supabase Auth em cookies · demo: 8h por aba)
│   ├── ✅ Identificação do usuário e do setor
│   └── ✅ Redirecionamento automático → ADM · Gerência · Operacional · Vendas · Produção · Financeiro · Cobrança
│
├── 02. CONTROLE DE ACESSO
│   ├── ✅ Usuários · ✅ Perfis (derivados do setor) · ✅ Áreas
│   ├── ✅ Permissões por módulo e por ação (visualizar/criar/editar/excluir/exportar)
│   └── ✅ Matriz de acesso (ADM total · Gerência configurável · Colaborador = próprio setor)
│
├── 03. ÁREA ADMINISTRADOR
│   ├── ✅ Dashboard geral (Visão TV + cards individuais com foto)
│   ├── ✅ Usuários · ✅ Perfis e permissões · ✅ Empresas/filiais
│   ├── ✅ Clientes (escolas) · ✅ Fornecedores · ✅ Produtos · ✅ Estoque
│   ├── ✅ Acesso a Vendas, Financeiro, Cobrança, Produção, Operacional e Gerência
│   ├── ✅ Relatórios · ✅ Indicadores/metas · ✅ Logs · ✅ Auditoria · ✅ Configurações
│   └── 🟡 Integrações (Supabase ✅ · WhatsApp ⬜ · e-mail transacional próprio ⬜)
│
├── 04. ÁREA GERÊNCIA
│   ├── ✅ Dashboard gerencial · ✅ Indicadores · ✅ Metas
│   ├── ✅ Acompanhamento de vendas, financeiro, produção e operacional
│   └── ✅ Relatórios gerenciais · ✅ Aprovações
│
├── 05. ÁREA OPERACIONAL
│   ├── ✅ Dashboard (metas diária, semanal e mensal) · ✅ Gestão diária (pendências acionáveis)
│   ├── ✅ Contratos de escola (importação + revisão) · ✅ Agenda fotográfica mensal · ✅ Histórico de fichas
│   ├── ✅ Fechamento: escola diário · vendedor semanal · adiantamento semanal dos freelancers · recibos
│   ├── ✅ Controle de rota · ✅ Vendedores PJ · ✅ Fotógrafos · ✅ Motoristas · ✅ Tarefas avulsas
│   └── 🟡 Leitura automática do contrato por IA (hoje: anexar + revisar manualmente)
│
├── 06. ÁREA DE VENDAS
│   ├── ✅ Dashboard (cada vendedora com gráfico de metas diárias e mensais)
│   ├── ✅ Leads · ✅ Prospecções (funil) · ✅ Clientes · ✅ Pedidos (contratos)
│   ├── ✅ Produtos / tabela de preços · ✅ Metas · ✅ Histórico
│   └── ⬜ Orçamentos · ⬜ Comissões das vendedoras
│
├── 07. ÁREA DE COBRANÇA
│   ├── ✅ Dashboard · ✅ Contas a receber · ✅ Títulos · ✅ Parcelas
│   ├── ✅ Inadimplência · ✅ Clientes em atraso · ✅ Negociação · ✅ Acordos
│   └── ✅ Recebimentos · ✅ Baixas · ✅ Histórico · ✅ Venda de e-books aos pais
│
├── 08. ÁREA DE PRODUÇÃO
│   ├── ✅ Dashboard · ✅ Ordens de produção · ✅ Etapas · ✅ Apontamentos · ✅ Controle
│   ├── ✅ Produtos · ✅ Matéria-prima · ✅ Perdas · ✅ Qualidade · ✅ Histórico
│   ├── 🟡 Planejamento (prazos e fila por etapa)
│   └── ⬜ Ficha técnica
│
├── (EXTRA) ÁREA FINANCEIRA
│   └── ✅ Dashboard · ✅ Contas a pagar · ✅ Comissões das escolas · ✅ Fluxo de caixa · ✅ Histórico
│
├── 09. NÚCLEO CENTRAL DE DADOS
│   └── ✅ Usuários · Empresas · Filiais · Clientes · Fornecedores · Produtos · Categorias · Estoque · Pedidos · Financeiro · Produção · Auditoria
│
├── 10. FLUXO DE INFORMAÇÕES
│   └── ✅ Todos os setores → núcleo → ADM (triggers + Realtime)
│
├── 11. NOTIFICAÇÕES
│   ├── ✅ Internas · ✅ Alertas · ✅ Pendências · ✅ Aprovações · ✅ Estoque baixo · ✅ Eventos importantes
│   └── 🟡 Vencimentos · 🟡 Produção atrasada (exibidos nos dashboards, sem aviso agendado)
│
├── 12. RELATÓRIOS
│   ├── ✅ Administrativos · Gerenciais · Vendas · Financeiros · Cobrança · Operacionais · Produção
│   └── ✅ Exportação PDF · Excel · CSV
│
├── 13. AUDITORIA E SEGURANÇA
│   └── ✅ Login · Logout · Alterações · Exclusões · Acessos · Histórico · IP · Data/hora · Usuário responsável
│
└── 14. INFRAESTRUTURA
    ├── ✅ Banco · ✅ API · ✅ Backend (triggers + Edge Function) · ✅ Frontend
    ├── ✅ Autenticação · ✅ Autorização (proxy + RLS) · ✅ Logs
    ├── 🟡 Armazenamento de arquivos (fotos ✅ · contratos/e-books sem tela)
    ├── 🟡 Backup (painel do Supabase)
    └── ⬜ Cache · ⬜ Filas · ⬜ Integrações externas
```

---

## 12. Fases do projeto

| Fase | Etapa | Status |
|---|---|---|
| 01 | Arquitetura | ✅ |
| 02 | Banco de dados | ✅ |
| 03 | Usuários, perfis e permissões | ✅ |
| 04 | Login, sessão e autorização | ✅ |
| 05 | Layout base do ERP | ✅ |
| 06 | Área ADM | ✅ |
| 07 | Cadastros centrais | ✅ |
| 08 | Vendas | ✅ |
| 09 | Cobrança | ✅ |
| 10 | Produção | ✅ |
| 11 | Operacional | ✅ Processo real de campo (contratos → agenda → fechamento → Financeiro) |
| 12 | Gerência | ✅ |
| 13 | Integração entre módulos | ✅ |
| 14 | Relatórios e dashboards | ✅ |
| 15 | Auditoria | ✅ |
| 16 | Testes de segurança | 🟡 Verificações básicas feitas (API recusa quem não está logado, proxy, Edge Function). Falta teste sistemático por setor |
| 17 | Deploy | ⬜ |

---

## 13. Design system

Todas as telas seguem o padrão **"Glassmorphism Premium"**, com os componentes centralizados em `components/erp/ui.tsx`:

| Elemento | Padrão |
|---|---|
| Fundos | `bg-black`, `bg-[#050505]` e `bg-[#020202]`, com luz ambiente azul (`blur-[150px]`) |
| Cards / painéis | `bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/[0.05] rounded-3xl` |
| KPIs | Faixa colorida no topo (`h-1`), número `font-black text-4xl` |
| Rótulos | `text-[10px] uppercase tracking-widest font-bold text-zinc-500` |
| Destaque | Azul (`text-blue-500`, `bg-blue-600`), com brilho `shadow-[0_0_10px_#3b82f6]` |
| Cores por setor (gráficos) | Vendas verde · Operacional azul · Produção violeta · Cobrança laranja · Financeiro ciano · Gerência amarelo |
| Gráficos | Feitos com divs do Tailwind, sem bibliotecas externas |
| Ícones | SVG puro (`components/erp/Icon.tsx`) |

---

## 14. Limitações conhecidas e próximos passos

- **Leitura automática do contrato por IA:** hoje o contrato é anexado e revisado manualmente.
- **Vendas › Contratos (Pedidos):** tela anterior ao processo real, que também cria ordem de produção. Com o fluxo pelo Operacional, é preciso decidir se ela continua.
- **Lançamento pela equipe:** o colaborador comum só lança produção em nome próprio, porque o RLS bloqueia outros casos. Para a coordenação/RMC lançar pela equipe, é preciso uma regra de supervisor.
- **Exclusão de colaboradores:** quem tem histórico não pode ser excluído, só **desativado**. É proposital, para proteger o histórico.
- **Período carregado:** os dashboards carregam os lançamentos dos **últimos 3 meses**.
- **Faltam:** Orçamentos, Comissões das vendedoras, Ficha técnica, Atendimentos, upload de contratos e e-books, lembretes de vencimento (WhatsApp/e-mail) e deploy em produção (Vercel ou similar, com domínio nas *Redirect URLs* do Supabase).

---

**DLG Photos** · Plataforma de gestão integrada para estúdios fotográficos e cobertura de eventos.
