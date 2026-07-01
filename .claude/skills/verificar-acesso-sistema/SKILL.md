---
name: verificar-acesso-sistema
description: Diagnostica por que o BRASMAT MES (https://brasmat-mes.vercel.app) não abre, fica travado em "carregando", está lento, ou parece fora do ar. Use SEMPRE que o usuário disser algo como "o sistema não abre", "ficou carregando", "está lento", "não consigo acessar", "caiu", "o Supabase não responde", "deu erro ao buscar peça/demanda/expedição", ou qualquer sintoma de indisponibilidade do site ou do banco de dados — mesmo que ele não peça "diagnóstico" literalmente. Cobre site (Vercel) e banco (Supabase), isolando se é rede do usuário, projeto Supabase pausado, incidente de plataforma, ou chave de API inválida.
---

# Verificar acesso ao sistema (BRASMAT MES)

Esta skill existe porque já aconteceu de o site parecer "travado" e a causa real ser um
incidente na própria plataforma Supabase — não algo quebrado no código ou na configuração.
O objetivo é isolar a causa rápido, sem o usuário (que não é programador) precisar entender
de rede ou de painéis técnicos, e agir sozinho até o ponto em que uma decisão dele é
realmente necessária.

## Passo 1 — rodar o diagnóstico automático

Rode o script bundled, passando o caminho do repo (normalmente já é o diretório atual):

```
bash .claude/skills/verificar-acesso-sistema/scripts/check_conectividade.sh C:\Users\grafe\brasmat-mes
```

Ele testa, nessa ordem, e já devolve um resumo classificado:
1. O site na Vercel (`https://brasmat-mes.vercel.app`) — status HTTP e tempo.
2. A API REST do Supabase do projeto — lendo `SUPA_URL`/`SUPA_KEY` direto de `status.js`
   (não usar chave hardcoded na skill: ela pode ser rotacionada e o script ficaria desatualizado).
3. Um site de referência (`google.com`) — serve só para provar que a internet do usuário
   está funcionando, isolando "problema geral de rede" de "problema específico do Supabase".

Faça essa etapa sozinho, sem perguntar — é só leitura, não muda nada em lugar nenhum.

## Passo 2 — interpretar o resumo

O script já classifica em uma destas categorias — use isso para decidir o próximo passo:

- **OK** → tudo respondendo normal. Diga isso ao usuário e sugira Ctrl+F5 se ele ainda
  reportar tela travada (pode ser só cache do navegador).
- **REDE_GERAL** → a internet local do usuário é que está com problema (nem google.com
  respondeu). Não adianta olhar Supabase/Vercel — oriente a checar a conexão local dele
  (Wi-Fi, roteador, operadora).
- **SUPABASE_TIMEOUT** → vá para o Passo 3.
- **SUPABASE_AUTH** (401/403) → a chave pública em `status.js` pode ter sido revogada ou
  rotacionada no painel do Supabase. Avise o usuário e, se ele confirmar, acesse
  `Project Settings > API Keys` no dashboard para conferir a chave atual antes de propor
  qualquer alteração em `status.js` (isso é uma mudança de código normal — commitar/push
  segue a regra de sempre do projeto, mas troque a chave só depois do usuário confirmar
  que é isso mesmo, já que é um arquivo público no repo).
- **VERCEL_PROBLEMA** → o problema é no front, não no banco. Cheque
  `https://www.vercel-status.com` e o painel do projeto na Vercel.

## Passo 3 — se for específico do Supabase (SUPABASE_TIMEOUT)

Um timeout no Supabase tem normalmente uma destas três causas — e cada uma pede uma ação
diferente, por isso vale a pena checar o dashboard antes de concluir qualquer coisa:

1. **Incidente na plataforma Supabase** (acontece, não é culpa do projeto). Costuma vir com
   um banner no topo do dashboard tipo "We are investigating a technical issue" com link
   para `status.supabase.com`.
2. **Projeto pausado por inatividade** (comum em projeto gratuito, que pausa sozinho depois
   de ~7 dias sem uso). O dashboard mostra status "Paused" em vez de "Healthy".
3. **Algo genuinamente errado** com o projeto (raro, mas existe) — vale olhar `CPU`/`RAM`/
   conexões na aba de overview se nenhuma das duas anteriores explicar.

Para checar, use o Chrome já conectado via MCP (`mcp__Claude_in_Chrome__*`):

1. Confirme que há um browser conectado (`list_connected_browsers`). Se a lista vier vazia,
   peça ao usuário para ativar a extensão do Claude no Chrome — não dá para prosseguir sem
   isso.
2. Navegue para `https://supabase.com/dashboard/project/hjvlznijsgdwurtsyukl` (ref do
   projeto brasmatmatrizes — confirme lendo `SUPA_URL` do status.js se o projeto mudar).
3. Se a página pedir login: **pare e peça para o usuário fazer login ele mesmo**. Nunca
   digite e-mail/senha por ele — entrar com credenciais é uma ação que a skill nunca deve
   tentar, mesmo que o usuário autorize verbalmente. Só continue depois que ele confirmar
   que já está logado.
4. Tire um screenshot do dashboard e leia:
   - Existe banner de incidente no topo? Se sim, é causa #1 — não há nada para clicar ou
     configurar, é só esperar a Supabase resolver. Informe isso e pare por aqui.
   - O card de status mostra "Healthy" ou "Paused"? Se "Paused", é causa #2.

### Se o projeto estiver "Paused"

Restaurar o projeto é uma ação com efeito real (reativa recursos do projeto) — **sempre
peça confirmação explícita ao usuário antes de clicar em "Restore project"**, mesmo que ele
já tenha pedido para você verificar o acesso de forma autônoma no início da conversa. Depois
que ele confirmar, clique, aguarde a reativação (pode levar um ou dois minutos) e rode o
Passo 1 de novo para confirmar que voltou.

## Passo 4 — reportar ao usuário

Feche sempre com um diagnóstico direto, sem jargão técnico desnecessário:
- **Causa raiz** identificada (uma das categorias acima).
- **O que já foi feito** (ex.: "chequei o painel, está tudo saudável, era um incidente da
  plataforma") ou **o que falta o usuário decidir/fazer** (ex.: "o projeto está pausado,
  posso reativar — confirma?").
- Se tudo estiver normal mas o usuário via de fato uma tela travada, sugira Ctrl+F5 (cache
  do navegador é a explicação mais comum quando os testes técnicos não acusam nada).

## O que esta skill nunca deve fazer

- Não oferecer nem agendar verificações futuras automaticamente (rodar em loop, lembrar
  depois, etc.) — é uma checagem sob demanda, disparada pelo usuário quando ele perceber
  lentidão ou indisponibilidade, não uma rotina recorrente.
- Não digitar credenciais (senha, login) em nenhum painel, mesmo que autorizado verbalmente.
- Não clicar em nenhuma ação com efeito (restaurar projeto, mudar configuração, etc.) sem
  confirmação explícita do usuário para aquela ação específica, mesmo que ele já tenha
  pedido a verificação de forma geral no início.
