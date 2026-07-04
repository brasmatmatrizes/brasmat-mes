---
name: modelagem-dados-mes
description: Convenções de modelagem de dados do BRASMAT MES no Supabase/PostgreSQL — como desenhar tabelas, colunas, chaves e índices para módulos novos (roteiros, estoque, rastreabilidade, orçamento, inspeção). Use SEMPRE que for criar ou alterar tabela/view/coluna no banco, desenhar schema de módulo novo, ou decidir entre tabela e view. Evita que o banco vire colcha de retalhos conforme o sistema cresce de MES para ERP+MES.
---

# Modelagem de dados (BRASMAT MES)

Convenções extraídas do que já funciona no banco. Módulo novo segue isto — desvio só
com justificativa explícita aprovada pelo usuário.

## Identidade das coisas

- **Peça** = `pedido` + `codigo_peca`, **sempre juntos**. A mesma `codigo_peca` existe
  em vários pedidos com tipo/cliente diferentes. Toda tabela nova que referencia peça
  carrega as duas colunas; todo lookup filtra pelas duas.
- **Cliente** = nome real completo (ex.: `2_METALAC SPS  INDÚSTRIA E COMÉRCIO LTDA - SOROCABA`),
  como vem do sistema de apontamento — pode ter espaço duplo e prefixo numérico; nunca
  "normalizar". Personalização (nome curto, cor) fica em `demanda_clientes`.
- Pedidos podem ter sufixo de linha (`4500598851-10`, `2602452-2`) e até apóstrofo no
  fim — tratar como **texto**, nunca como número.

## Padrão de tabela

- Nomes em português, `snake_case`, plural (`demanda_itens`, `producao_eventos`).
- Colunas mínimas: `id` (identity/serial PK), `created_at` e `updated_at`
  (`timestamptz default now()`).
- Datas de negócio sem hora (prazo, data desejada) = `date`; momentos de evento =
  `timestamptz`. No front, converter `date` com `new Date(valor+"T00:00:00")` para não
  voltar um dia por fuso.
- Booleanos com `default false`, nunca nullable (`concluido`, `critico`).
- Status de fluxo = `text` com valores minúsculos combinados (`pendente`/`separado`/`expedido`)
  — sem enum do Postgres (dificulta evolução).
- Acesso: `grant all to anon, authenticated` + RLS com policy permissiva
  `using(true) with check(true)` (padrão atual; muda no marco de autenticação da Fase 3).
- Índice desde a criação em coluna que será filtrada com frequência (em
  `producao_eventos` já existem `idx_producao_eventos_*` para `pedido`, `codigo_peca`,
  `data_evento`, `operador` — seguir o exemplo).

## Eventos vs estado

O padrão central do MES é **evento imutável + view de estado**:

- Fatos que acontecem (apontamento, movimentação de estoque, medição de inspeção) são
  **append-only**: insere, nunca atualiza/apaga. Correção = novo evento.
- O "estado atual" é uma **view** derivada do último evento (como `posicao_atual`).
  Views novas desse tipo devem expor as colunas que as telas precisam — lembrar que
  `posicao_atual` NÃO tem `razao_social`/`classificacao_fiscal`/`sequencial_operacao`,
  o que obriga fetch extra; view nova pode já incluir o que for barato.
- Documentos de trabalho editáveis (item de demanda, cabeçalho de orçamento, roteiro)
  são tabelas normais com update, `updated_at` e salvamento automático com debounce.

## Módulos futuros — reservas de desenho

- **Roteiros**: reutilizar os códigos de suboperação já firmados (`SUBOP_*` em
  `status.js`: 10.1, 10.2, 11.3, 11.4...) — o roteiro referencia esses códigos, não
  cria numeração paralela.
- **Estoque/rastreabilidade**: movimentação como evento imutável (entrada com
  certificado/corrida, reserva por OS, baixa); vínculo lote→peça é uma tabela de
  ligação com `pedido`+`codigo_peca`.
- **Orçamento**: dados de custo/margem são **confidenciais** — este módulo só entra
  depois do marco de autenticação (Supabase Auth + RLS restritiva). Não criar tabela
  de custos sob a política permissiva atual.

## Storage

- Bucket público `demanda-arquivos`, caminho `CLIENTE/CODIGO/{tipo}-{timestamp}.ext`.
  Módulo novo com anexos segue o mesmo padrão de caminho (e apaga o arquivo do bucket
  quando o registro que o referencia é removido — padrão `supaDeleteArquivo`).

## Processo

- DDL sempre mostrado ao usuário antes de executar (ele acompanha e aprova).
- Depois de criar/alterar: atualizar a seção "Dados Supabase" do `CLAUDE.md` e rodar
  `backup-dados` antes da primeira carga real.
