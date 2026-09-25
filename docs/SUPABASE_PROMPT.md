# DLG Photos ERP — Montagem do Supabase

Este guia leva o ERP do modo demonstração (dados no navegador) para o Supabase real,
com banco, login, permissões no servidor (RLS), tempo real e auditoria.

- **Script do banco:** [`docs/supabase/schema.sql`](supabase/schema.sql). Cria tabelas, segurança, fluxos entre setores, auditoria, views, Realtime e Storage.
- **Integração do front-end:** já feita. Veja a seção 4 para ativar.

---

## 1. Criar o projeto

1. Crie um projeto em https://supabase.com (região **São Paulo**).
2. Em **Project Settings → API**, copie a `Project URL` e a chave `anon public`.
3. Preencha o `src/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="SUA-CHAVE-ANON"
```

> A chave `service_role` **nunca** vai para o front-end nem para o `.env.local`. Ela só é usada na Edge Function (seção 3).

## 2. Rodar o script do banco

1. Abra **SQL Editor → New query**.
2. Cole todo o conteúdo de `docs/supabase/schema.sql` e clique em **Run**.
3. Crie o primeiro administrador:
   - **Authentication → Users → Add user**, com e-mail e senha, marcando *Auto Confirm User*.
   - Rode no SQL Editor, trocando o e-mail e o nome:

```sql
insert into public.colaboradores (id, nome, email, funcao, setor)
select id, 'Lucas W. Garcia', email, 'Diretor(a)', 'adm'
from auth.users where email = 'admin@dlgphotos.com';
```

4. Em **Authentication → Providers → Email**, desative *Allow new users to sign up*. Só o ADM cria contas.

### O que o script cria

| Área | Tabelas |
|---|---|
| Núcleo | `empresas`, `filiais`, `colaboradores`, `permissoes`, `indicadores`, `metas`, `lancamentos` |
| Cadastros centrais | `escolas`, `produtos`, `fornecedores`, `estoque` |
| Vendas | `leads`, `contratos` |
| Operacional | `tarefas_operacionais` |
| Produção | `ordens_producao`, `qualidade` |
| Cobrança | `vendas_ebooks`, `titulos`, `acordos` |
| Financeiro | `contas_pagar`, `comissoes` |
| Gerência | `aprovacoes` |
| Sistema | `notificacoes`, `notificacao_leituras`, `auditoria` |

### Segurança aplicada

- **RLS em todas as tabelas.** A função `pode(modulo, acao)` replica a regra do front-end:
  - o ADM pode tudo;
  - o GERENTE segue a tabela `permissoes`;
  - o COLABORADOR só atua no **próprio setor**.
  - Um usuário de Vendas que chamar a API de Cobrança recebe **zero linhas**.
- **Perfil derivado do setor** por trigger. Ninguém se promove a ADM, e só um ADM cadastra alguém no setor `adm`.
- **Lançamentos imutáveis.** Não há política de UPDATE. O colaborador comum só lança produção em nome próprio, e lançamentos automáticos só podem ser gerados pelos triggers.
- **Auditoria automática** de toda criação, alteração e exclusão, com usuário, data/hora, IP (`x-forwarded-for`) e os dados antes e depois. LOGIN, LOGOUT e ACESSO são gravados pela RPC `registrar_evento`.
- **Funções internas** (`lancar`, `notificar`, `pedir_aprovacao`) não podem ser chamadas pela API.
- **Storage privado**: `contratos` (Vendas e Operacional) e `ebooks` (Produção e Cobrança).
- **Fuso horário** `America/Sao_Paulo`, para as metas diárias virarem à meia-noite de Brasília.

### Fluxos entre setores (triggers)

```
CONTRATO (Vendas) ──► meta da vendedora
                  ├─► tarefa "Agendar sessão" (Operacional)
                  ├─► ordem de produção (Produção)
                  └─► notificação (ADM, Gerência, Operacional, Produção)

VENDA DE E-BOOK (Cobrança) ──► meta do cobrador
                           ├─► N parcelas em títulos (Contas a receber)
                           └─► comissão da escola (Financeiro)

BAIXA DE TÍTULO ──► valor recebido (meta da Cobrança, faturamento do ADM e entrada no caixa)
ACORDO / CONTA ≥ R$ 5.000 ──► aprovação da Gerência ──► decisão atualiza a origem + meta da Gerência
ORDEM "E-book gerado" ──► meta do editor • "Concluído" ──► avisa a Cobrança
ESTOQUE < mínimo ──► alerta para Produção e ADM
META DIÁRIA BATIDA ──► notificação para ADM, Gerência e o setor
```

## 3. Edge Function: o ADM cria, edita o acesso e exclui colaboradores

Criar ou excluir usuários no Auth exige a chave `service_role`, que nunca vai para o navegador.
Por isso essas operações ficam numa Edge Function, e ela já está no projeto:
[`supabase/functions/admin-colaboradores/index.ts`](../supabase/functions/admin-colaboradores/index.ts).

| `acao` | O que faz | Permissão exigida |
|---|---|---|
| `criar` | Cria o usuário no Auth e a linha em `colaboradores` | `usuarios / criar` (setor ADM: só o ADM) |
| `atualizar_acesso` | Troca o e-mail e/ou a senha | `usuarios / editar` |
| `excluir` | Remove do Auth (quem tem histórico deve ser **desativado**) | `usuarios / excluir` |

**Publicar pelo painel (mais simples):**
1. **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `admin-colaboradores`.
3. Cole o conteúdo do arquivo acima e clique em **Deploy**.

**Ou pelo terminal, dentro de `src/`:**

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-colaboradores
```

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem nas Edge Functions. Não é preciso configurar nada.

### 3b. Edge Function `ler-contrato`: leitura do contrato com IA grátis (Google Gemini)

Os contratos da DLG têm os dados **escritos à mão**, e o OCR do navegador não lê letra à mão direito. Esta função manda as páginas do contrato para o **Gemini, na cota gratuita do Google**. Ele devolve os campos do formulário, as turmas (período, série e quantidade), o CNPJ da escola e o local e a data da assinatura. Código: [`supabase/functions/ler-contrato/index.ts`](../supabase/functions/ler-contrato/index.ts).

- **Sem a função ou sem a chave:** o sistema usa sozinho a leitura básica do navegador.
- **Permissão exigida:** `operacional / criar`.

**Publicar:**
1. Em [aistudio.google.com](https://aistudio.google.com), entre com uma conta Google e vá em **Get API key → Create API key**. É grátis e não pede cartão.
2. No Supabase: **Edge Functions → Secrets → Add new secret**, com nome `GEMINI_API_KEY` e a chave como valor.
   - A chave fica **só aqui**, nunca no `.env.local` nem na Vercel.
   - Opcional: `GEMINI_MODEL` troca o modelo. Sem ela, a função tenta `gemini-2.5-flash` e depois `gemini-flash-latest`.
3. **Edge Functions → Deploy a new function → Via Editor**. Use o nome `ler-contrato`, cole o arquivo acima e clique em **Deploy**.
4. Nos detalhes da função, deixe **Verify JWT with legacy secret desligado**. A função confere o usuário sozinha.

> Na cota gratuita, o Google pode usar o conteúdo enviado para melhorar os serviços dele. Para evitar isso, ative o faturamento no Google AI Studio. Nesse caso cada leitura custa uma fração de centavo.

---

## 4. Integração do front-end ✅ (já feita)

O front já está integrado e escolhe o modo **automaticamente** pelo `src/.env.local`:

| `.env.local` | Modo | Onde ficam os dados |
|---|---|---|
| Valores de exemplo (`seu-projeto`) | **Demonstração** | No navegador, com os botões de acesso rápido no login |
| URL e chave reais | **Supabase** | No banco, com RLS, Realtime e auditoria no servidor |

### Para ativar

1. Rode `docs/supabase/schema.sql` (seção 2) e crie o primeiro ADM.
2. Publique a Edge Function (seção 3).
3. Preencha o `src/.env.local` com a URL e a chave `anon` (seção 1).
4. Reinicie o servidor: pare o `npm run dev` e rode de novo. Variáveis `NEXT_PUBLIC_` só são lidas na inicialização.
5. Em **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000`
   - **Redirect URLs:** `http://localhost:3000/redefinir-senha`
   - Em produção, adicione também o domínio oficial.

> **Processo operacional (contratos de escola, agenda, fechamentos):** quem rodou o `schema.sql` antes de 25/09/2026
> deve rodar também [`docs/supabase/004_operacional.sql`](supabase/004_operacional.sql). Ele pode ser rodado mais de uma vez.
>
> **Fotos de perfil:** quem rodou o `schema.sql` antes de 24/09/2026 deve rodar também
> [`docs/supabase/003_fotos_perfil.sql`](supabase/003_fotos_perfil.sql) (bucket `avatares` + função `definir_foto`).
>
> Rodou o `schema.sql` **antes** desta integração? Rode também
> [`docs/supabase/002_realtime_completo.sql`](supabase/002_realtime_completo.sql), que liga o tempo real em todas as tabelas.

### O que foi implementado

| Arquivo | Função |
|---|---|
| `lib/supabase/config.ts` | Lê o `.env.local` e decide o modo |
| `lib/supabase/client.ts` | Cliente do navegador (`@supabase/ssr`, sessão em cookies) |
| `proxy.ts` | **Proteção no servidor**: sem sessão vai para `/login`; setor sem permissão (`pode()`) vai para a área do próprio usuário |
| `lib/erp/adaptador.ts` | Conversão camelCase ↔ snake_case e colunas permitidas por tabela |
| `lib/erp/supabase-sync.ts` | Carrega o núcleo do banco (paginação de 1000 em 1000; lançamentos dos últimos 3 meses) |
| `lib/erp/store.ts` | Mesmas funções de antes, agora gravando no Supabase. Realtime recarrega os dados quando outro setor altera algo |
| `app/redefinir-senha` | Destino do link de recuperação de senha |

- **Login:** `signInWithPassword`, depois confere o cadastro em `colaboradores` e o status ATIVO, grava LOGIN ou LOGIN_FALHOU e redireciona para o setor.
- **Fluxos entre setores:** o front só grava o dado principal (baixa, pagamento, decisão, etapa, acordo). Os **triggers** geram o restante: metas, parcelas, comissões, aprovações e notificações.
- **Erros do servidor** (por exemplo, permissão negada pelo RLS) aparecem como aviso no canto da tela, e o formulário continua aberto.

### Limitações conhecidas

- O colaborador comum só registra produção **em nome próprio**, porque o RLS bloqueia outros casos. A coordenação/RMC que lança pela equipe precisa de perfil GERENTE ou de uma regra nova.
- O backup "Importar" e "Restaurar demonstração" ficam desativados no modo Supabase. Use os backups do painel.
- Upload de arquivos (buckets `contratos` e `ebooks`) está criado no banco, mas ainda não está ligado às telas.

---

## 5. Checklist de segurança antes de ir para produção

- [ ] Cadastro público desativado (seção 2, passo 4).
- [ ] `service_role` só na Edge Function.
- [ ] Testar com um usuário de cada setor que as outras áreas retornam lista vazia pela API.
- [ ] **Authentication → Policies**: senha mínima de 8 caracteres e proteção contra senhas vazadas.
- [ ] **Authentication → URL Configuration**: somente o domínio oficial nos redirects.
- [ ] MFA (TOTP) obrigatório para os perfis ADM e GERENTE.
- [ ] Backups diários, ou PITR no plano Pro.
- [ ] Rodar **Advisors → Security** no painel do Supabase e zerar os alertas.
