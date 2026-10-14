# SPEC — Setor de Cobrança (DLG ERP)

> Versão 0.7 — 14/10/2026 — **rascunho para conferência**. Nada é construído antes de cada item ser aprovado.
> Base: regras confirmadas pelo usuário (07–09/10 e 14/10), **leitura completa do setor de Cobrança no sistema antigo**
> (telas + regras do código, 14/10), o Manual Oficial de Cobrança do sistema antigo e o que já existe no sistema novo
> (SQLs 039–044). Onde o sistema antigo e a decisão do usuário divergem, **vale a decisão do usuário**.
>
> **0.2 (respostas de 14/10):** 1 cobrador só, sem hierarquia (só a função "Cobrador"); o cobrador tem autonomia para valores,
> descontos e acordos; a dívida fica no CNPJ da empresa que vendeu; dívida da CA Diogo pode ser renegociada e fica na CA Diogo;
> o trabalho começa pelos papéis físicos que o Financeiro manda.
>
> **0.3 (mais respostas de 14/10):** parcela mínima de R$ 100 é regra mas **não trava** (o cobrador pode mudar); os papéis do
> Financeiro trazem todos os dados do cliente e as parcelas em atraso; Terceirizada/Advogado/Fundo perdido **só consulta**;
> a CA Diogo ainda tem venda nova, **só no cartão de crédito**.
>
> **0.4 (respostas de 14/10 + print da tabela de comissão):** venda no cartão hoje vai para a CA Diogo, mas pode ir para a
> CA Beatriz; entrada obrigatória e elegibilidade viram **só aviso**; comissão é % sobre o **valor da entrada** e só com o
> cliente em **Registro SPC**; **meta e comissão só contam as dívidas em SPC**; existem **2 contratos** (simulação e formalização).
>
> **0.5 (leitura do sistema antigo, 14/10):** os **2 documentos** levantados por inteiro (6.6); **corrigida a conta da
> renegociação**: o desconto e as parcelas valem sobre o **total da dívida** (vencidos atualizados + a vencer), não só sobre
> os vencidos (6.4); situações, ficha de contato, "Para hoje", Financeiro, SPC, meta e comissão completados com o que o
> sistema antigo faz; respondidas pelo sistema antigo 4 das 5 perguntas em aberto e criadas perguntas novas (seção 13).
> A leitura foi **só de leitura**: nada foi criado, salvo ou enviado no sistema antigo.
>
> **0.6 (respostas de 14/10 às 7 perguntas):** os boletos do acordo são gerados pelo **Financeiro no Conta Azul** (fora do
> sistema, sem integração); o cobrador, ao fechar o acordo, **imprime o papel do acordo e entrega ao Financeiro**; a simulação
> não tem "5 dias": vale o **prazo para pagar a entrada** que o cobrador coloca; a entrada pode ser **PIX, Cartão ou Dinheiro**;
> **ninguém assina**: o que efetiva o acordo é o **pagamento da entrada**, validado pelo Financeiro, que gera as parcelas novas;
> a **tabela de condições por faixa entra** (como sugestão); dias úteis = **segunda a sexta**, sem sábados, domingos e **feriados nacionais**;
> **Nível 1 vai até R$ 30.000,00**.
>
> **Regra geral (14/10):** negociação, acordos, simulação e os 2 documentos ficam **IGUAIS ao sistema antigo**, exceto as
> decisões do usuário (nada trava, prazo da entrada no lugar dos 5 dias, PIX/Cartão/Dinheiro, outra pessoa com nome + CPF,
> ficha impressa ao fechar o acordo, sem Conta Azul dentro do sistema) e 2 correções (desconto na ficha; dias de atraso do dia).
> **0.7 — CONSTRUÍDO (14/10, sem commit; SQLs 045–050 rodados em produção):**
> - 045: só "Cobrador"; toda dívida no cobrador do setor (vendedora não vira cobradora).
> - 046: registrar contato (histórico que não se apaga), situações, "Promessa não cumprida" calculada, "Para hoje".
> - 047: simulação e acordo iguais ao antigo (total da dívida, nada trava, sugestão por faixa), os 2 documentos e o WhatsApp.
> - 048: Financeiro › Acordos da Cobrança (confirmar exato, devolver, reverter, efetivar com parcelas novas, quebrado, boletos enviados).
> - 049: meta R$ = entradas SPC confirmadas (parcela não lança mais meta), comissão por faixa/nível (N1 até 30.000,00), meta SPC 12→11, painel.
> - 050: SPC (Controle SPC na Cobrança; Registro SPC no Financeiro; conferência com a planilha oficial .xlsx).
> - Limpeza: saiu o "Negociar (3x)" e a tela antiga de acordos para aprovação; Cobrança › Acordos mostra os acordos novos;
>   Configurações › Condições por faixa (ADM). Os 4 lançamentos antigos de meta ficaram como estavam (pedido do usuário).
> - Não feito: "estornar efetivação".

---

## 1. O que é o setor (escopo)

**A Cobrança só trabalha dívida EM ATRASO e só NEGOCIA.**

| Faz | Não faz (é do Financeiro) |
|---|---|
| Vê os clientes com parcela vencida | Lançar venda, gerar parcela ou boleto |
| Entra em contato e registra o contato | Dar baixa em boleto / receber |
| Agenda retorno e anota promessa de pagamento | Estornar pagamento |
| Simula e fecha a renegociação (entrada + parcelas novas) | Confirmar que a entrada foi paga |
| Encaminha a proposta ao cliente | Gerar os boletos do acordo |
| Marca "não localizado" / "ficha não encontrada" | Enviar ao SPC e retirar do SPC |
| Marca o cliente para ir ao SPC (o Financeiro é quem envia) | Mudar a categoria depois de regularizar |

**Fronteira:** dívida em dia (nada vencido) **não aparece** na Cobrança. Ela vive em Financeiro › Contas a Receber.

### 1.1 Como o setor trabalha hoje, na prática (14/10)
1. **Existe 1 cobrador só** na empresa, e é ele quem faz as negociações.
2. **O Financeiro entrega ao cobrador papéis físicos** com os clientes que podem ser cobrados. Cada papel traz **todos os dados
   do cliente e as parcelas em atraso** (por isso o cobrador consegue achar o cliente pelo CPF, não só pelo nome).
3. O cobrador **pesquisa o nome do cliente no sistema**, entra em contato e tenta fazer o acordo.
4. **Não existe hierarquia no setor:** não há atendente nem supervisor, só o **Cobrador**.
5. O cobrador tem **autonomia** para colocar os valores, dar desconto e gerar o acordo, sem pedir aprovação.

> Consequência para o sistema: a porta de entrada do trabalho é a **busca** (nome, CPF, contrato ou telefone), que precisa ser
> rápida e achar o cliente mesmo com o nome escrito de outro jeito. A lista "Para hoje" (6.3) ajuda nos retornos e nas promessas.

### 1.2 O sistema antigo hoje (lido em 14/10)
- A Cobrança fica em **Financeiro › Cobrança** ("Cobrança de Clientes Inadimplentes — controle de renegociação, juros, multa,
  metas e comissões"). Em volta dela, no Financeiro: **Conf. Entradas Reneg.**, **Registro SPC**, **Relatórios de Comissões**
  e **Retirada de Contratos**.
- Ele está **praticamente parado**: a ligação com o Conta Azul parou, a carteira mostra 1 cliente, a Terceirizada está vazia e a
  Inadimplência não tem relatório. Por isso ele serve de **modelo de regras e de telas**, não de fonte de dados (os dados já
  vieram na migração).
- O sistema antigo tinha uma "versão 2" da Cobrança **planejada e nunca ligada** (todas as chaves desligadas). As regras dela
  estão no **Manual Oficial de Cobrança** (aba "Regras de Cobrança"), que diz "vigência operacional imediata". Esta spec usa o
  manual como referência, sempre abaixo das decisões do usuário.

---

## 2. Quem usa

| Papel | O que pode |
|---|---|
| **Cobrador** (única função do setor) | Ver toda a carteira em atraso; registrar contato; simular, definir valores e desconto, salvar o acordo (sem aprovação); encaminhar a proposta; marcar o cliente para o SPC |
| **ADM (donos)** | Tudo; mudar as regras em Configurações |
| **Financeiro** | Mandar ao cobrador os clientes que podem ser cobrados (hoje em papel); ver a inadimplência (só leitura); confirmar/rejeitar entrada; efetivar renegociação; SPC |

> Não existe Gerência nem hierarquia na Cobrança. Ninguém aprova desconto (ver 6.4).
>
> No sistema antigo, o Financeiro tem um **"Responsável pela conferência"** (Conf. Entradas Reneg.) e um **"Responsável pelo
> Registro SPC"**, que aparecem no topo dessas telas. A meta da Cobrança tinha 2 responsáveis cadastrados; hoje existe 1 cobrador.
>
> **Mudança pendente (NÃO feita):** no cadastro de colaborador, o setor Cobrança mostra hoje as funções
> "Cobrador(a)", "Atendente de cobrança" e "Supervisor(a) de cobrança" (`lib/erp/config.ts`, linha 101).
> Deve ficar **só "Cobrador"**. Mudar só essa lista quando o usuário der a ordem.

---

## 3. Como a dívida entra na carteira da Cobrança

1. **Origem da dívida** (já existe): venda externa conferida, venda do Rebolo conferida, lançamento manual do Financeiro e as **9.284 cobranças migradas** do sistema antigo (contas CA Beatriz e CA Diogo).
2. **Entra na Cobrança sozinha** no dia seguinte ao vencimento da 1ª parcela não paga (parcela "Aberta" ou "Parcial" com vencimento < hoje).
3. **Sai sozinha** quando não sobra parcela vencida (o Financeiro deu baixa) → situação "Regularizada" e some da lista.
4. **Dias de atraso e valores são calculados todo dia** com a data de hoje. (No sistema antigo a lista mostrava os dias da última
   sincronização com o Conta Azul e ficava desatualizada; a ficha recalculava. No novo, lista e ficha mostram o mesmo número.)
5. **Cobrador responsável:** como existe 1 cobrador só, **toda dívida em atraso é dele** (as 9.284 migradas, que hoje estão
   sem cobrador, e as novas). Ver a seção 9.
6. **Conta (CNPJ) da dívida:** a dívida **fica na empresa que fez a venda**, CA Beatriz ou CA Diogo. Isso vale também depois
   de renegociada: o acordo continua no mesmo CNPJ (ver 6.4).
   - **A CA Diogo ainda tem venda nova, mas só no cartão de crédito** (14/10).
   - **Venda no cartão:** hoje toda venda no cartão é registrada na **CA Diogo**, mas também pode ser registrada na
     **CA Beatriz** (14/10). Ou seja: a conta precisa ser **escolhida na venda** (no cartão, o normal hoje é CA Diogo).
   - ⚠ **Achado no sistema (não corrigido):** hoje toda venda nova gera a cobrança na **CA Beatriz**, inclusive a venda no
     cartão (padrão da coluna `conta`, SQL 042), e não há onde escolher a conta na venda. A venda no cartão entra **já paga**,
     então **não vira atraso e não chega à Cobrança**; mas no Financeiro (Contas a Receber) a conta fica errada.
     Correção é do Financeiro/Vendas (fora desta spec); só fazer com a ordem do usuário.

---

## 4. Cálculo (o banco calcula com a data de hoje — já existe, SQL 041–043)

| Item | Regra |
|---|---|
| **Juros** | R$ 0,17 **fixo por dia** de atraso, **em cada parcela vencida** (editável em Configurações). Conferido no antigo: 126 dias × R$ 0,17 = R$ 21,42 naquela parcela. **Dívida migrada: sem juros.** |
| **Multa** | Valor fixo em R$ **por boleto vencido**, o que está impresso no boleto. No antigo o cobrador escolhia na ficha: **R$ 2,00**, **R$ 4,00** ou **"não identificada"** (= R$ 0). No novo: padrão R$ 4,00, editável. Migrada: a multa do documento (sem multa = R$ 0). |
| **Dias de atraso** | hoje − vencimento, em dias corridos, por parcela |
| **Valor atualizado** | em aberto + multa + juros, só das parcelas **vencidas** |
| **Total da dívida** | atualizado dos vencidos **+** parcelas a vencer pelo valor de face (é sobre ele que se renegocia — 6.4) |
| **Faixa por dias** | até 60 · 61–180 · 181–360 · acima de 360 (a mais antiga vencida) |
| **Faixa por parcelas** | 1–2 · 3–4 · 5–6 · 7–12 · 13–24 parcelas vencidas |

> A ficha do antigo mostra o cálculo assim (o novo deve mostrar igual): tabela das parcelas (vencimento, parcela "3/13",
> forma de pagamento, conta, valor, recebido, em aberto, situação "Vencido" / "A vencer" / "Quitado" / "Parcial");
> "Recebido"; "Em aberto = total a receber + total em atraso"; quadro **"Cálculo de atualização, juros e multa dos boletos"**
> (parcela, vencimento, em aberto, dias de atraso, multa, juros, atualizado, total dos vencidos) e a linha
> **"Total da dívida (atualizado dos vencidos + parcelas a vencer)"**, com a "Data do cálculo" e o "Juros diário: R$ 0,17".

---

## 5. Carteira (onde a dívida está)

| Carteira | Quando |
|---|---|
| **DLG** | Categoria normal **e** até 730 dias de atraso |
| **Terceirizada** | Categoria terceirizada **ou** DLG/SPC com mais de 730 dias (selo "Fora da categoria") |
| **Advogado** | Categoria de advogado |
| **Fundo perdido** | Categoria de fundo perdido |
| **Registro SPC** | Categoria "Registro SPC" (continua da DLG para cobrar; **não é** terceirizada) |

- A **categoria** decide, e é olhada **primeiro**: categoria terceirizada/advogado/fundo perdido vai direto para essa carteira;
  senão, até 730 dias é DLG e acima de 730 dias é Terceirizada ("Fora da categoria"). Ela tem histórico (quem mudou e quando).
- **Quem cobra ativamente é a carteira DLG** (+ Registro SPC).
- **Terceirizada, Advogado e Fundo perdido: a Cobrança SÓ CONSULTA** (confirmado em 14/10). Aparecem com o escritório
  responsável, mas sem registrar contato e sem negociar. (No antigo, a aba "Cobrança Terceirizada" mostrava total de clientes,
  valor em atraso, valores recebidos e efetividade.)
- **Categorias sem cobrança:** o antigo deixava marcar categorias que **não se cobram** (selo "⚠ Não cobrar"). Já existe espaço
  para isso em Configurações › Categorias do sistema novo.

---

## 6. O trabalho do cobrador

### 6.1 Situações da cobrança (9 oficiais + as do fluxo)

| # | Situação (nome na tela) | Quem muda | No sistema antigo |
|---|---|---|---|
| 1 | Aguardando cobrança | sistema (entrou na carteira) | igual |
| 2 | Contato realizado sem acordo | cobrador (**observação obrigatória**) | igual |
| 3 | Aguardando retorno (com data) | cobrador | eram 2: "Sem retorno (aguardando retorno SPC)" e "Aguardando retorno do cliente para envio ao SPC"; o manual juntou em 1 só, guardando o motivo |
| 4 | Pagamento de boleto agendado (com data) | cobrador | "data em que o cliente se comprometeu a pagar os boletos em aberto" |
| 5 | Promessa não cumprida | **sistema** (a data passou e não pagou) | "Boletos agendados vencidos"; **continua pendência e NÃO vira "sem acordo" sozinha** |
| 6 | Renegociação simulada (com data de retorno) | cobrador/sistema (simulação salva) | "Renegociação simulada, aguardando retorno do cliente"; exige "Data do novo retorno" |
| 7 | Renegociação feita (aguardando entrada) | sistema (acordo salvo) | igual |
| 8 | Não localizado | cobrador (**observação obrigatória**) | "Cliente não localizado": marcação manual, sem mínimo de pesquisas |
| 9 | Ficha não encontrada SPC | cobrador | "Ficha não encontrada para envio ao SPC": fila de exceção (7) |
| — | Entrada confirmada | **Financeiro** | "Reneg. entrada confirmada" |
| — | Renegociação efetivada | **Financeiro** | igual |
| — | Acordo quebrado (entrada não paga) | **Financeiro** | igual |
| — | Agendamento de boleto efetuado | sistema (o boleto prometido foi pago) | igual |
| — | Quitou | sistema (pagou tudo) | igual |

### 6.2 Registrar contato (a ficha "Registrar Cobrança")
- **Tipo:** WhatsApp · Ligação · E-mail · Outro. **Data** (padrão hoje).
- **Situação** (uma das manuais: 2, 3, 4, 6, 8, 9) + **observação**.
- **Observação obrigatória** em "Contato realizado sem acordo" e "Não localizado" (o antigo não deixa salvar sem ela).
- Situação 3 e 6 exigem **data de retorno futura** (escolhida pelo cobrador; não existe prazo automático).
  Situação 4 exige **data do pagamento agendado** (valor opcional).
- Todo contato fica no **histórico** (não se apaga). A situação da dívida passa a ser a do último contato.
  (O antigo guardava só 1 registro por situação por mês; o novo guarda **todos** os contatos.)
- Na ficha:
  - **dados do cliente:** conta de origem (CA Beatriz / CA Diogo), código da venda, nome, CPF/CNPJ, telefone, celular/WhatsApp,
    e-mail, cidade e estado;
  - **contatos adicionais** (telefone 1, telefone 2 e e-mail extra), que **se salvam na hora**;
  - aviso **"Contato incompleto — sem telefone, celular ou e-mail"**;
  - botão **WhatsApp** (mensagens prontas em 6.7);
  - parcelas vencidas com juros/multa (seção 4), faixa, carteira, categoria (com histórico) e conta;
  - botão **"Efetuar renegociação"** (6.4); e, se já tem acordo, **"Renegociação efetuada"**, que mostra o acordo e tem
    **"Editar renegociação"**.
- Mudou a categoria → fica no **histórico de categorias** (antes, depois, data, quem mudou).

### 6.3 "Para hoje" do cobrador (no antigo: "Gestão Diária")
A lista do dia, com a quantidade de cada pendência. No antigo eram 7:
1. **Boletos para enviar** — acordo efetivado cujos boletos novos ainda não foram enviados ao cliente.
2. **Boletos agendados vencidos** — a data do pagamento prometido passou (promessa não cumprida).
3. **Entradas de renegociação vencidas** — a data prevista da entrada passou e o Financeiro não confirmou.
4. Reneg. efetivada com verificação pendente — **no novo não existe** (era a conferência no Conta Azul).
5. **SPC inclusão marcados hoje.**
6. **Contatos no dia** (carteira DLG, até 2 anos).
7. **SPC inclusão pendentes** — marcados para o SPC e ainda não enviados pelo Financeiro.

No novo, somar: **retornos agendados para hoje ou atrasados** (situações 3 e 6).

### 6.4 Renegociação (simulação → acordo)
**Regra para renegociar (SÓ AVISO, não trava — 14/10):** ≥ 2 boletos vencidos **e** ≥ 61 dias de atraso **e** saldo vencido
real. Se a dívida não cumpre (ex.: 1 boleto vencido), o sistema **avisa** e o cobrador decide se segue.

**A conta certa (corrigida na 0.5 — é como o sistema antigo faz):**
1. **Total da dívida** = atualizado dos vencidos + parcelas a vencer (seção 4). A renegociação pega a **dívida toda**.
2. **Desconto** em % ou em R$, sobre o **total da dívida** (o antigo mostra os dois: "R$ X de desconto" / "Y% de desconto").
3. **Valor após desconto** = total da dívida − desconto.
4. **Valor a prazo** (sem a entrada) = valor após desconto − entrada.
5. **Parcela** = valor a prazo ÷ nº de parcelas, **sem juros nas parcelas novas**.
   Ou o contrário ("Valor parcela → Qtd."): o cobrador digita o valor desejado e o nº de parcelas = valor a prazo ÷ valor
   desejado, arredondado para cima.
6. **Total a pagar** = entrada + valor a prazo.
7. **Quitação à vista:** se a entrada cobre todo o valor após desconto, não há parcelas ("Entrada de R$ X cobre o valor total
   após desconto").

| Campo | Regra |
|---|---|
| **Entrada (R$)** | a regra é ter entrada, mas é **só aviso** (14/10): sem entrada o sistema avisa e deixa seguir; sugestão R$ 200 (o cobrador pode digitar menos); **data prevista da entrada** |
| **Quem paga a entrada (titular do PIX)** | "Titular" (o próprio cliente) ou "Outra pessoa": **nome + CPF** (decisão de 07/10; o antigo pedia só o nome) |
| **Forma de pagamento da entrada** | **PIX, Cartão ou Dinheiro** (07/10 + 14/10) |
| **Prazo para pagar a entrada** | o cobrador coloca a data limite (= "data prevista da entrada"); é ela que aparece na simulação no lugar dos "5 dias" do antigo (14/10) |
| **Desconto** | em % ou R$; **o cobrador decide quanto** (autonomia); **sem aprovação e sem trava no sistema**; vale à vista ou parcelado. A regra "desconto máximo sem aprovação (10%)" que existe em Configurações **deixa de travar** (14/10). (O manual antigo exigia autorização do ADM para qualquer desconto; vale a decisão do usuário.) |
| **Simular por** | "Qtd. parcelas → Valor" ou "Valor parcela → Qtd." |
| **Nº de parcelas** | sem limite; **parcela mínima R$ 100 é a regra, mas NÃO trava**: o sistema avisa ("Valor da parcela abaixo do mínimo de R$ 100,00. Aumente o número de parcelas ou reduza o desconto/entrada.") e o cobrador pode seguir (14/10). O antigo **travava** os botões; o novo não. Valor editável em Configurações |
| **Forma de pagamento da renegociação** | Pix · Boleto · Cartão · Transferência · Dinheiro (padrão Boleto) |
| **Vencimento do 1º boleto** | acordo feito até dia 20 → dia 10 do mês seguinte; a partir do dia 21 → dia 10 do mês depois (ex.: acordo em julho depois do dia 20 → 10 de setembro). Já vem preenchido e pode mudar; se mudar, aviso **"Data fora de regra"** (no antigo, a conferência usa a data prevista da entrada) |
| **Conta (CNPJ)** | o acordo fica na mesma conta da dívida: dívida da **CA Diogo pode ser renegociada e fica na CA Diogo**; da CA Beatriz, na CA Beatriz |
| **Valores** | o cobrador define entrada, parcelas e condições (autonomia). **Todas as regras do setor são aviso, nenhuma trava:** parcela mínima, entrada, elegibilidade e desconto |
| **Simulação** | sempre salva (situação 6, com data de retorno); vale até o **prazo da entrada** que o cobrador colocou (14/10); depois disso os valores são recalculados com os juros do dia |
| **Encaminhar** | o **documento de simulação** (6.6), enviado ao cliente **antes** de fechar: baixar/imprimir ou abrir o WhatsApp do cliente com o texto pronto |
| **Salvar acordo** | situação 7; o cobrador **imprime a ficha do acordo** (6.6, doc. 2) e **entrega o papel ao Financeiro**; o acordo vai para o Financeiro confirmar a entrada |

**O que o acordo guarda (como no antigo), para nada mudar depois:** a "fotografia" da dívida no dia (valor original em atraso,
multa, juros, atualizado, total da dívida, data do cálculo e as parcelas com o cálculo de cada uma), desconto, entrada, data e
forma da entrada, quem paga, nº e valor das parcelas, forma de pagamento, 1º vencimento, cobrador, e **congelados para a
comissão:** a quantidade de **parcelas vencidas** e a **categoria (estava em Registro SPC?)** no momento do acordo.

**Editar acordo** (o antigo pergunta qual das duas):
- **"Apenas alterar a data da entrada"** — mantém juros, multa, entrada, parcelas e valor da parcela; só muda a data prevista
  da entrada;
- **"Recalcular renegociação"** — pode mudar desconto, entrada, parcelas e valor; os juros são recalculados com a data de hoje.

**Tabela de condições por faixa (existe no antigo — ENTRA no novo, 14/10, como sugestão).** Configurada pelo ADM, servia de
guia. Em cada faixa de atraso, o cobrador oferece a **condição 1**; se o cliente não aceitar, depois de **3 dias úteis** pode
oferecer a condição 2, e depois a 3. Mínimo de **2 boletos vencidos** para renegociar. Padrão do antigo:

| Faixa | Condição 1 | Condição 2 | Condição 3 |
|---|---|---|---|
| **61 a 180 dias** | entrada 100% | entrada 70% | entrada 50% |
| **181 a 360 dias** | entrada 70% | entrada 50% | entrada 30% |
| **acima de 360 dias** | entrada 50% + desconto de 100% dos juros/multa | entrada 30% + 100% juros/multa + 10% do principal | entrada 20% + 100% juros/multa + 20% do principal |

(A entrada em % é sobre os vencidos atualizados já com o desconto; o nº de parcelas sai do valor mínimo de R$ 100.)
No novo ela aparece como **sugestão** na simulação (a condição da faixa do cliente), editável pelo ADM em Configurações;
**nunca trava** (autonomia do cobrador).

### 6.5 Depois do acordo (Financeiro — no antigo: "Confirmação de Entradas de Renegociação")
**A tela do Financeiro:**
- topo: responsável pela conferência; **"Entradas pendentes de confirmação"** e **"Entradas vencidas sem conferência"** (a data
  da entrada passou);
- filtros: **Aguardando** (quantidade e R$), **Confirmados**, **Efetivadas**, **Vencidas**; busca por cliente, venda ou
  CPF/CNPJ; filtro do mês;
- cada linha: cliente, venda, entrada (valor, forma, pagador, data), parcelas e valor da parcela, observação da cobrança e
  observação do Financeiro.

**Os passos:**
1. **Aguardando** → o Financeiro confere o valor e a forma da entrada. **Têm que ser exatos** (manual, item 25): se o valor ou a
   forma não batem, o Financeiro **não ajusta**: **rejeita e devolve ao cobrador**, com o motivo, guardando a prova.
2. **Confirmar** → informa **valor recebido** e **data do recebimento** (padrão hoje) → situação "Entrada confirmada". Nesse
   momento se **congelam** a categoria e as parcelas vencidas (comissão) e entra no histórico "Entrada confirmada pelo Financeiro".
   O recebimento entra na meta do cobrador (só dívida em SPC — 8.1).
3. **Reverter a confirmação** → volta para "aguardando", com **motivo obrigatório** (o antigo zerava sem motivo; o manual pede
   reversão com motivo e histórico).
4. **Efetivar** → **o que efetiva o acordo é o pagamento da entrada** (14/10): o Financeiro valida a entrada e **gera as
   parcelas novas conforme o acordo**. No sistema: as parcelas antigas ficam "Em acordo" e entram as parcelas novas →
   "Renegociação efetivada". **Os boletos** dessas parcelas o Financeiro continua gerando **no Conta Azul**, por fora (o
   sistema não liga com o Conta Azul; só registra as parcelas). Existe **"Estornar efetivação"**.
   O Financeiro trabalha com o **papel do acordo** que o cobrador imprimiu e entregou (6.6, doc. 2).
5. **Boletos enviados ao cliente** → no acordo efetivado, o Financeiro marca "Boletos enviados" (com a data). Enquanto não
   marca, aparece em "Boletos para enviar" (6.3).
6. **Entrada não paga** → "Acordo quebrado": a dívida antiga volta como estava, a negociação antiga fica guardada; nova
   tentativa = **nova versão** (outro cobrador pode assumir).

### 6.6 Os 2 documentos (levantados no sistema antigo, 14/10)
Nenhum dos dois tem assinatura nem cláusulas, e **continua assim** (14/10): o acordo vai ao cliente, ele analisa, e o que
efetiva é o **pagamento da entrada** (validado pelo Financeiro).

**1) "Simulação de Renegociação"** — enviada ao cliente **antes** de fechar.
- **Quando sai:** na tela da simulação ("Exportar Simulação" = imprimir/PDF; "Encaminhar" = abre o WhatsApp do cliente com o
  texto pronto) e depois pelo histórico ("Imprimir Renegociação" e "Reenviar Renegociação"). Só sai se a conta fecha.
- **Cabeçalho:** logo DLG Photo Studio; "Colaborador: (quem emitiu)"; "Emissão: (data)"; título **SIMULAÇÃO DE RENEGOCIAÇÃO**; "Data".
- **Dados do cliente:** nome, CPF/CNPJ, nº da venda, pagador.
- **Resumo da dívida:** valor original em atraso, multa, juros, valor atualizado (vencidos), parcelas a vencer, **total da dívida**.
- **Condições da proposta:** desconto concedido (se houver), valor após desconto, entrada, data prevista da entrada, quem vai
  pagar a entrada, forma de pagamento da entrada, valor a prazo (sem entrada), forma de pagamento da renegociação, vencimento
  do primeiro boleto; em destaque **nº de parcelas e valor da parcela** (ou "QUITAÇÃO À VISTA"); faixa final **"Total a pagar"**
  (ou "Total quitado") = entrada + valor a prazo.
- **Rodapé:** "Proposta válida por 5 dias a partir da data de emissão. Esta simulação não constitui um acordo formal. O acordo
  será confirmado após aceite do cliente." **No novo** (14/10): sai a frase dos 5 dias e entra **"Prazo para pagamento da
  entrada: (data)"** (a data que o cobrador colocou) + "O acordo é efetivado com o pagamento da entrada."
- **Versão WhatsApp** (texto): *SIMULAÇÃO DE RENEGOCIAÇÃO*, data, cliente, venda, desconto, entrada, data prevista da entrada,
  quem paga, forma da entrada, forma da renegociação, "Parcelamento: Nx de R$ …", 1º vencimento, valor a prazo, total e
  "_Proposta válida por 5 dias._" (no novo: "Prazo para pagamento da entrada: (data)"). Vai para o WhatsApp do cliente
  (WhatsApp, senão celular, senão telefone).

**2) "Ficha de Renegociação de Cobrança"** — a **formalização** do acordo (no antigo, uma ficha amarela, como a de papel).
- **Quando sai (no novo, 14/10):** **o cobrador imprime ao fechar o acordo** e **entrega o papel ao Financeiro**, que usa a
  ficha para gerar os boletos no Conta Azul depois que a entrada é paga. O sistema guarda que a ficha foi impressa e quando
  ("Imprimir Ficha"; depois "Reimprimir Ficha nº N"). (No antigo ela só saía depois da entrada confirmada.)
- **Cabeçalho:** logo; "Colaborador"; "Emissão"; título **FICHA DE RENEGOCIAÇÃO DE COBRANÇA**.
- **Dados do cliente:** número da venda, nome, **todos os telefones** do cliente, CPF/CNPJ, categoria.
- **Detalhes financeiros:** boletos vencidos (original), multa, juros, boletos a vencer, **total da dívida renegociada**, valor da entrada.
- **Forma de pagamento da entrada:** caixinhas [ ] Pix [ ] Dinheiro (marcada a escolhida; no novo: [ ] PIX [ ] Cartão [ ] Dinheiro);
  quem vai pagar a entrada; data da entrada.
- **Parcelamento:** valor para parcelamento; "O restante será pago em N vezes"; "Prestações de R$ …"; "Confirmação (N × R$ …)"
  = total; vencimento do primeiro boleto.
- **Observações** (a observação da cobrança).
- ⚠ **Erro do antigo, para não repetir:** a ficha não mostra o desconto, e o "valor para parcelamento" é total − entrada (sem tirar
  o desconto), então não bate com "N × parcela" quando houve desconto. **No novo:** mostrar o desconto e usar
  valor após desconto − entrada.
- **Melhorias que a versão 2 do antigo planejava** (vale trazer): nº da versão do acordo; "Primeira impressão" /
  "Reimpressão nº N"; telefones do dia do acordo; desconto e "saldo após entrada"; **data real do recebimento** da entrada;
  **tabela das parcelas novas** (nº, vencimento, valor) ou "Sem saldo parcelado após a entrada"; rodapé com o código do acordo.

### 6.7 Mensagens prontas de WhatsApp (do sistema antigo)
O botão abre a conversa no WhatsApp do cobrador (link `wa.me`) com o texto pronto; **quem envia é o cobrador**, o sistema
não manda nada sozinho (sem integração).
1. **Confirmar o número:** "Olá, tudo bem? Aqui é (nome do cobrador), eu trabalho na DLG PHOTO STUDIO. Por favor, esse
   telefone/contato pertence ao(a) (nome do cliente)?"
2. **Primeira cobrança:** "Olá (cliente), tudo bem? Verificamos que existem (N) parcela(s) vencida(s) referente(s) à sua compra.
   Valor original em atraso: R$ …. Multa: R$ …. Juros: R$ …. Valor atualizado até (data): R$ …. Podemos te ajudar a regularizar?"
3. **Simulação:** o texto do documento 1 (6.6).
4. **Aviso antes do SPC** (no quadro de envio ao SPC, seção 7): "Olá (cliente), tudo bem? Aqui é (nome do cobrador), da DLG.
   Verificamos que você possui (N) parcela(s) vencida(s) (contrato #…). 💰 Valor das parcelas vencidas: R$ …. 📋 Valor total
   do contrato em aberto: R$ …. Estamos abertos para renegociação, caso tenha interesse em regularizar. Caso não haja
   interesse, seu nome será encaminhado ao SPC (Serviço de Proteção ao Crédito). Fico no aguardo do seu retorno!"
   O antigo passa **um cliente por vez** (em ordem de nome), abre o WhatsApp de cada um e marca quem já foi avisado; os
   clientes sem telefone aparecem à parte.
- Sem telefone, o botão **copia o texto** para o cobrador colar onde precisar.

---

## 7. SPC e escritórios (etapa 3.3)

**Elegível ao SPC** (manual, item 8): carteira DLG; saldo vencido real; **≥ 2 boletos vencidos**; **≥ 61 dias**; não terceirizada;
não está em Registro SPC; não está marcado para inclusão; não regularizado; CPF/CNPJ válido. Com 1 boleto vencido: cobrar, mas
não enviar ao SPC.

**O caminho (antigo):**
1. Na Cobrança, o quadro **"Controle — clientes para envio ao SPC"** (elegíveis da DLG, fora do Registro SPC e das terceirizadas).
   Para cada cliente o cobrador escolhe:
   - **"Cliente sem interesse — enviar ao SPC"** → marca **SPC inclusão** (situação "contato sem acordo"); antes de marcar, o
     sistema confere se ainda é elegível e **bloqueia** se não for;
   - **"Ficha não encontrada para envio ao SPC"** → fila de exceção (não envia e não some);
   - **"Cliente não retornou — aguardando retorno"** → "aguardando retorno" (mantém a marca de SPC inclusão; o número pode
     estar errado);
   - **"Cliente interessado — em renegociação"** → renegociação simulada.
   - Há também **"SPC exclusão"** (marcar para sair do SPC) e **"SPC é outro contrato"** (o registro no SPC é de outro contrato
     do mesmo CPF).
2. **Elegível × liberado** (manual, item 9): o elegível aparece no Financeiro como **"Elegível — aguardando tratamento da
   Cobrança"**, **bloqueado**. Contato sem acordo (cliente sem interesse) **libera** para o Financeiro enviar.
3. **Financeiro › Registro SPC:** responsável pelo registro; 3 quadros — **SPC inclusão** (aguardando registro, com R$),
   **Aguardando confirmação** (o Financeiro enviou) e **Registrados no SPC** (confirmados na planilha). Na lista,
   **"Enviar ao SPC"** só registra que foi enviado; **a confirmação é de fora** (planilha do SPC).
4. **Estados de cada contrato:** Elegível para envio → Aguardando confirmação → Registrado no SPC → Divergência →
   Removido/liquidado. Contrato liquidado sai do fluxo.
5. **"Ficha não encontrada"** (manual, item 12): se a ficha aparecer depois, **não libera sozinha**: alguém clica
   "Ficha localizada — liberar para SPC" (fica registrado quem e quando).

**Conferência com a planilha oficial do SPC Brasil** (Excel; manual, item 15):
- O sistema lê a aba **BASE_CONSOLIDADA** (um registro por linha) e a aba **RESUMO** (solicitação, empresa, status, tipo de
  registro, linhas, clientes únicos, CPF+contrato únicos, data de geração).
- Cruza **por CPF/CNPJ** e depois pelo **contrato**; se o contrato não bate, usa a **parcela mais antiga** só para comparar e
  sugerir (nunca para adivinhar o contrato).
- Resultado por linha: **SPC OK** · **marcar como SPC** · **no SPC, mas sem dívida em atraso** (alerta) · **não encontrado** ·
  e a lista inversa: **registrado no sistema, mas fora da planilha**, com o motivo (pagou/quitou, renegociou, sem vencidos,
  **prescrição: parcela mais antiga com mais de 5 anos**, não identificado).
- Regras: Registro SPC + no SPC → OK; Registro SPC + fora → **divergência**; categoria normal + no SPC → **divergência**;
  terceirizada + no SPC → OK (herdado); liquidado + no SPC → **pendência de retirada**.
- "Primeira planilha do ciclo" zera as marcas e recomeça.

**Retirada do SPC** (manual, item 16): **"Solicitação de retirada"** (o cliente regularizou e o Financeiro pediu) é diferente
de **"Retirada confirmada"** (só quando a planilha nova do SPC mostra que saiu).
**SPC herdado** (item 14): cliente que estava em Registro SPC e foi para Terceirizada/Advogado/Fundo perdido continua
**presumido negativado** até a prova oficial de retirada.

**Escritórios:** envio a terceirizada/advogado/fundo perdido = mudança de categoria (com histórico).

> **Retirada de Contratos** (Financeiro) é outra coisa: retirada física do contrato no armário quando a dívida foi **liquidada
> por inteiro** ("Pix e cartão não entram na retirada física"). É **independente** da Cobrança (manual, item 42): acordo
> confirmado não gera retirada.

---

## 8. Meta, indicadores e comissão

### 8.1 Regra de ouro (14/10)
**Meta e comissão do cobrador só contam as dívidas em SPC** (categoria "Registro SPC" no momento da renegociação).
Dívida fora do SPC pode ser cobrada e negociada normalmente, mas **não conta** na meta nem na comissão.
O sistema antigo faz exatamente isso: o "Recebido" da meta e a comissão somam só os clientes em SPC.

> ⚠ **Achado no sistema (não corrigido):** hoje todo recebimento de qualquer cobrança que tenha cobrador entra na meta
> "valor recebido" dele (SQL 041, `registrar_pagamento_parcela`). Precisa mudar na etapa 5, para contar só as dívidas em SPC.

### 8.2 Metas (no antigo são duas)
**a) Meta mensal em R$** (padrão **R$ 40.000**, editável)
- **Recebido** = soma das **entradas confirmadas** pelo Financeiro **das dívidas em SPC**, pela **data da confirmação** no mês.
- Se o cobrador começa no meio do mês, a meta fica **proporcional** aos dias úteis (ou corridos) da vigência.
- No painel: recebido / meta e %; **falta**; **recebido por dia** × **necessário por dia** (o que falta ÷ dias úteis restantes);
  gráfico do **recebimento diário** com a linha da média diária (meta ÷ dias úteis), cada dia "acima" ou "abaixo da média";
  dias úteis "N de M"; rosca da meta com cores 0–24% · 25–49% · 50–74% · 75–99% · 100%.

**b) Meta SPC — "Clientes elegíveis trabalhados"** (manual, itens 10–11)
- **Ciclo:** dia **12** do mês até dia **11** do mês seguinte, em **dias úteis = segunda a sexta** (14/10); **não contam
  sábados, domingos e feriados nacionais**.
- **Conta:** clientes **únicos** elegíveis que o cobrador trabalhou no ciclo (cliente único = 1 vez: 5 mensagens + 3 ligações = 1).
- **Alvo:** padrão **50 por dia útil** × dias úteis do ciclo (configurável).
- **Andamento:** trabalhado × o esperado até hoje → verde (≥ 100%), amarelo (≥ 70%), vermelho (abaixo).
- **Distribuição por desfecho:** enviado/liberado ao SPC, renegociação, renegociação simulada, pagamento, contato sem acordo,
  aguardando retorno, não localizado, ficha não encontrada, demais.
- Feriados descontados: **só os nacionais** (01/01, Sexta-feira Santa, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11,
  25/12). O 26/07 que o antigo descontava **sai** (não é nacional).
  A mesma regra vale para os dias úteis da meta em R$ (8.2a).

### 8.3 Indicadores
- **Clientes trabalhados** = clientes únicos contatados no mês.
- **Efetividade** = renegociações fechadas ÷ clientes únicos contatados. **Simulação não conta**, só acordo fechado.
- No antigo também: contatados, retornos (sem os "não localizado"), renegociados no mês, pagos (entrada confirmada no mês),
  taxa de retorno, conversão (renegociados ÷ contatados), pagamento (pagos ÷ renegociados) e "% de efetivação"
  (efetivadas ÷ contatos).
- Painel por faixa de atraso (até 60 · 61–180 · 181–360 · acima de 360): clientes, R$ vencido, contatos no mês, aguardando
  entrada, aguardando agendamento, entrada confirmada, % de efetivação, recebido.
- Quadros por situação (como no antigo): total de contatos no mês, pagamento agendado, agendamento efetuado, simulada
  aguardando retorno, contato sem acordo, não localizado, ficha não encontrada, aguardando retorno SPC, renegociação aguardando
  entrada (com R$ e "N com entrada vencida"), entrada confirmada, renegociação efetivada, % de efetivação, total recebido,
  valores em aberto.

### 8.4 Comissão (print de 14/10 + regras do sistema antigo)
- **Base:** % sobre o **valor da entrada** do acordo (a entrada confirmada).
- **Só conta** se o cliente estava em **Registro SPC no momento da renegociação** (congelado no acordo).
- **Faixa:** a quantidade de **parcelas vencidas no momento da renegociação** (congelada no acordo): 1 a 2 · 3 a 4 · 5 a 6 ·
  acima de 6. (Se o número congelado for 0 e o cliente está em SPC, o antigo usa "acima de 6".)
- **Nível do mês:** pelo **total de entradas confirmadas das dívidas em SPC no mês** (data da confirmação). O nível vale para o
  mês todo, também para trás (retroativo).
- **Tabela** (editável em Configurações) — limites decididos em 14/10 (como no print):

  | Nível (entradas confirmadas no mês) | 1 a 2 parcelas | 3 a 4 parcelas | 5 a 6 parcelas | Acima de 6 parcelas |
  |---|---|---|---|---|
  | **Nível 1** (até R$ 30.000,00) | 1,00% | 1,50% | 2,00% | 2,50% |
  | **Nível 2** (de R$ 30.000,01 até R$ 35.000,00) | 2,00% | 2,50% | 3,00% | 3,50% |
  | **Nível 3** (acima de R$ 35.000,00) | 2,25% | 2,75% | 3,25% | 3,75% |

  ⚠ **Mudança pendente (NÃO feita):** hoje as Configurações do novo têm Nível 1 até R$ 29.999,99 (como o antigo).
  Passar para **até R$ 30.000,00** quando o usuário der a ordem.
- **Quadro "Comissão por quantidade de parcelas vencidas"** (como no antigo): uma linha por faixa + Total, com as colunas
  **Entradas a confirmar** e **Comissão estimada** (acordo fechado, entrada ainda não confirmada — calculada com o nível atual)
  e **Entrada confirmada** e **Comissão gerada** (o Financeiro confirmou). Exemplo do print: R$ 200,00 de entrada a confirmar
  na faixa 3 a 4, no Nível 1 → comissão estimada R$ 3,00 (1,50%). A linha do nível atual fica destacada.
- **Selo do nível** ("Comissão — Nível 1/2/3") com **quanto falta** para o próximo nível.
- **Competência:** a data em que o Financeiro confirmou a entrada.
- **Quem recebe:** o cobrador responsável no momento da confirmação (o criador do acordo fica no histórico).
- **Relatório de Comissões** (Financeiro): por cobrador e mês — total recebido, comissão, andamento da meta e o detalhe por dia:
  contrato, entrada (base), parcelas vencidas (congeladas), faixa, %, comissão.

---

## 9. Antes de tudo: ligar a carteira ao cobrador
- **Hoje existe 1 cobrador só** (14/10). Por isso **não precisa** da tela de distribuir carteira.
- **Proposta (a confirmar):** todas as dívidas em atraso, as 9.284 migradas e as novas, ficam ligadas sozinhas ao cobrador do
  setor. A meta e a comissão dele contam o que for das dívidas em SPC (8.1).
- Se um dia entrar um segundo cobrador, aí se cria a divisão da carteira (por conta, faixa ou cidade) e a tela de distribuir.
  (O antigo tinha botões por responsável + "Visão Administrador" com todos.)

---

## 10. Telas

| Tela (novo) | Conteúdo | No sistema antigo |
|---|---|---|
| **Painel da Cobrança** | Meta R$ × recebido, meta SPC, "Para hoje", quadros por situação e por faixa, comissão | Visão Geral, Cobrança DLG, Dashboard do Responsável, Gestão Diária |
| **Minha carteira / Inadimplência** | Um cliente por linha: nome, selos (SPC inclusão, conta), venda, nº de parcelas vencidas, dias, categoria, situação, "novo registro", WhatsApp, valor, histórico; filtros (faixa, carteira, situação, conta, cidade); ordenar por valor, parcelas, nome; imprimir e exportar | "Cobrança Geral — Todas as Faixas" |
| **Ficha do cliente** | Seção 6.2 + Simular / Renegociar + histórico de contatos e acordos | Registrar Cobrança, Histórico de Cobrança, Dados Atualizados do Contrato |
| **Simulação / acordo** | Seção 6.4 + os 2 documentos (6.6) | Simular Renegociação |
| **Acordos (Financeiro)** | Aguardando, confirmados, efetivadas, vencidas, quebrados (6.5) | Conf. Entradas Reneg. |
| **SPC** | Controle de envio (Cobrança), Registro SPC (Financeiro), conferência da planilha (seção 7) | Controle SPC, Registro SPC, Conferência SPC, Fluxo SPC |
| **Busca de cliente** | A porta de entrada (1.1): nome, CPF, contrato ou telefone (a partir de 2 letras), em **toda** a base em atraso (todas as carteiras), até 50 resultados, direto para a ficha | Busca Geral de Clientes |
| **Índice de inadimplência** | Por ano (últimos 5): regime **caixa** (esperado por vencimento × vencido não pago) e **competência** (vendido × vencido daquela venda); faixas até 30 · 31–60 · 61–90 · 91–180 · 181–360 · acima de 360; contratos e clientes inadimplentes; **só categorias marcadas "entra na inadimplência"** (empréstimos e receitas que não são venda ficam fora) | Inadimplência |
| **Manual de cobrança** | As regras do setor, para o cobrador consultar | Regras de Cobrança |
| **Configurações** | Já existe (regras, categorias, escritórios) + juros por dia, multa, parcela mínima, meta, níveis | Juros/Multa, Configurar Faixas |

---

## 11. Regras de segurança
- Banco fechado para quem é de fora (anon); o setor Cobrança vê e trabalha **toda a carteira em atraso**; ADM vê tudo;
  Financeiro só lê a inadimplência.
- Contato e acordo **não se apagam** (histórico); correção = novo registro ou nova versão.
- Tudo calculado no banco (a tela só mostra). Dados pessoais nunca saem do sistema; os documentos com CPF só são gerados dentro
  do sistema, e o WhatsApp só abre a conversa (quem envia é o cobrador).

---

## 12. Etapas de construção (uma por vez, com teste e "manda pro git")
1. **9 — Ligar a carteira ao cobrador** + função só "Cobrador" no cadastro (seção 2)
2. **6.1–6.3 — Contatos, situações, "Para hoje"** (SQL 045)
3. **6.4 + 6.6 — Simulação e acordo + os 2 documentos** (SQL 046)
4. **6.5 — Financeiro confirma/efetiva/quebra** (SQL 047)
5. **8 — Painel, metas, indicadores, comissão**
6. **7 — SPC e escritórios**

**Critério de pronto de cada etapa:** teste no banco local (regras e permissões), teste da tela na demonstração, você roda o SQL
e testa no sistema, depois git.

---

## 13. Perguntas

### Respondidas em 14/10 (pelo usuário)
- **Cobradores:** existe 1 só, e é ele quem negocia. Não há hierarquia (seções 1.1, 2 e 9).
- **Dívida nova:** fica na empresa em que foi vendida, CA Diogo ou CA Beatriz (seção 3).
- **Desconto:** o cobrador faz direto, sabe quanto pode dar e tem autonomia; sem aprovação (seção 6.4).
- **CA Diogo:** as dívidas podem ser renegociadas e ficam no CNPJ da CA Diogo (seção 6.4).
- **Como o trabalho começa:** o Financeiro manda papéis físicos com os clientes que podem ser cobrados; o cobrador pesquisa
  o nome no sistema e tenta o acordo (seção 1.1).
- **Parcela mínima R$ 100:** é regra, mas não trava; o cobrador tem autonomia para mudar se precisar (seção 6.4).
- **Papéis físicos do Financeiro:** trazem todos os dados do cliente e as parcelas em atraso (seção 1.1).
- **Terceirizada / Advogado / Fundo perdido:** a Cobrança só consulta (seção 5).
- **CA Diogo:** ainda tem venda nova, só no cartão de crédito (seção 3).
- **Venda no cartão:** hoje toda vai para a CA Diogo, mas pode ir para a CA Beatriz (seção 3).
- **Entrada e elegibilidade (≥ 2 boletos, ≥ 61 dias):** só aviso, não travam (seção 6.4).
- **Comissão:** % sobre o valor da entrada, só com o cliente em Registro SPC; tabela de níveis do print (seção 8.4).
- **Meta e comissão:** só contam as dívidas em SPC (seção 8.1).

### Respondidas pelo sistema antigo (14/10) — confirmar se continua assim
1. **Os 2 contratos:** "Simulação de Renegociação" (antes, para o cliente ver) e "Ficha de Renegociação de Cobrança"
   (formalização, depois da entrada confirmada). Campos completos em 6.6.
2. **Nível da comissão:** decidido pelas **entradas confirmadas das dívidas em SPC** no mês (não por tudo o que foi recebido).
   (No antigo R$ 30.000,00 já era Nível 2; o usuário decidiu Nível 1 até R$ 30.000,00 — seção 8.4.)
3. **Meta SPC:** 50 clientes elegíveis trabalhados **por dia útil**, ciclo do dia 12 ao 11 (seção 8.2).
4. **Promessa não cumprida:** a data passou sem pagamento → vira pendência ("boletos agendados vencidos") e **não** vira
   "sem acordo" sozinha (seção 6.1).

### Respondidas em 14/10 (as 7 perguntas da v0.5)
1. **Boletos do acordo:** quem gera é o **Financeiro, no Conta Azul** (por fora; o sistema não liga com ele). O cobrador, depois
   de fechar o acordo, **imprime o papel do acordo e entrega fisicamente ao Financeiro** (6.4, 6.5, 6.6).
2. **Validade da simulação:** o cobrador coloca o **prazo para pagar a entrada**; é isso que vale e aparece no documento (6.6).
3. **Dinheiro na entrada:** sim → PIX, Cartão ou Dinheiro (6.4).
4. **Assinatura:** não. O acordo vai ao cliente, ele analisa; o que efetiva é o **pagamento da entrada**, que o Financeiro
   verifica e valida, e então gera as parcelas novas conforme o acordo (6.5).
5. **Tabela de condições por faixa:** entra (como sugestão, sem travar) (6.4).
6. **Dias úteis:** segunda a sexta; **não contam** sábados, domingos e feriados nacionais (8.2).
7. **Nível 1:** até R$ 30.000,00 (8.4).

### Em aberto
- Nada pendente das perguntas. O usuário ainda pode trazer mais informações antes de mandar começar.

---

## 14. O que NÃO vem do sistema antigo
- **Conta Azul:** sincronização de clientes e parcelas, "verificar no Conta Azul", categorias vindas de lá, conferência
  "soma × Conta Azul" — o sistema novo é **independente** (sem integração nenhuma). O Financeiro continua usando o Conta Azul
  **por fora** só para emitir os boletos do acordo (14/10).
- **DataStone** (pesquisa de telefones de fora): o "não localizado" é só a marcação do cobrador.
- **Diagnóstico por IA** do índice de inadimplência (o antigo mandava os números para uma IA externa) — dados não saem do sistema.
- A "versão 2" que nunca foi ligada: só as **regras** do manual entram nesta spec, não a estrutura dela.
