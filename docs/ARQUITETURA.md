# DLG Photos ERP — Mapa da arquitetura (V1, front-end com dados simulados)

## Como os dados circulam

```
Setor registra algo ──► Núcleo ERP (src/lib/erp/store.ts) ──► regras (fluxos.ts) geram efeitos nos outros setores
                                   │
                                   └──► todas as telas abertas atualizam na hora (inclusive o /adm em outra aba)
```

- **Modo demonstração** (sem `.env.local` configurado): o núcleo fica no `localStorage` e as abas se sincronizam pelo evento `storage`.
- **Modo Supabase** (URL e chave reais): o núcleo é o banco. O RLS define o que cada um vê, os triggers ligam os setores e o Realtime atualiza as telas. O proxy (`proxy.ts`) protege as rotas no servidor. Veja `docs/SUPABASE_PROMPT.md`.

## Árvore → implementação

| Item da árvore | Onde está |
|---|---|
| 01 Login / logout / sessão / redirecionamento | `/login`, `store.ts` (login, logout, sessão de 8h por aba), `permissions.ts → rotaInicial` |
| 01 Recuperação / alteração de senha | Modal "Esqueci a senha" no login e "Alterar senha" no menu do avatar |
| 02 Usuários, perfis, áreas, permissões por ação | `/adm/colaboradores`, `/adm/permissoes`, `permissions.ts → pode()` |
| 03 Área ADM | `/adm` (Visão TV), `colaboradores`, `permissoes`, `metas`, `cadastros`, `relatorios`, `auditoria`, `configuracoes`, mais atalhos para todos os setores |
| 04 Gerência | `/gerencia` (painel tático), `metas`, `aprovacoes`, `relatorios`, mais atalhos para todos os setores |
| 05 Operacional | `/operacional/metas` (dashboard), `controle`, `contratos`, `agenda`, `tarefas`, `historico` |
| 06 Vendas | `/vendas` (vendedoras com metas diárias e mensais), `leads`, `contratos`, `precos`, `historico` |
| 07 Cobrança | `/cobranca`, `vendas-ebooks`, `titulos` (contas a receber, baixas), `inadimplencia`, `acordos`, `historico` |
| 08 Produção | `/producao`, `ordens` (etapas), `materia-prima`, `qualidade` (perdas), `historico` |
| Financeiro | `/financeiro`, `contas-pagar`, `comissoes`, `fluxo-caixa`, `historico` |
| 09 Núcleo central de dados | `/adm/cadastros`: escolas, produtos, fornecedores, estoque, filiais |
| 10 Fluxo de informações | `lib/erp/fluxos.ts` (no Supabase: triggers) |
| 11 Notificações | Sino no Header: metas batidas, aprovações, estoque baixo, novos contratos, produção concluída |
| 12 Relatórios / exportação | `/adm/relatorios` e `/gerencia/relatorios`: PDF, Excel e CSV. As tabelas também exportam CSV |
| 13 Auditoria | `/adm/auditoria`: login, logout, acessos, criações, alterações, exclusões, usuário, data/hora e IP |
| 14 Infraestrutura | `docs/supabase/schema.sql` (banco, RLS, Realtime, Storage) e backup JSON em Configurações |

## Arquivos-chave

- `lib/erp/config.ts`: setores, indicadores e metas padrão, menus isolados, etapas.
- `lib/erp/types.ts`: tipos que espelham as tabelas do banco.
- `components/erp/SectorShell.tsx`: layout de cada setor, com Sidebar própria, Header e proteção de rota.
- `components/erp/SectorDashboard.tsx`: dashboard padrão de cada setor (metas, gráficos, equipe).
- `components/erp/CrudPage.tsx`: tabela e formulário genéricos, com permissões por ação.

## Acesso de demonstração

Todas as contas usam a senha `123456`. A tela de login tem botões de acesso rápido por setor.
Para ver o tempo real, abra o **ADM em uma aba** e a **Vendas em outra** (cada aba tem sua própria sessão).
Depois, registre produção ou um contrato na aba de Vendas.
