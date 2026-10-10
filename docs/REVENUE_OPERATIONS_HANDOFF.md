# GXEON Revenue Operations — handoffs V1.0 + V1.1

Implementado dentro do GXEON Wallet Command Center, módulo financeiro do XPeX Systems Command. Acesso: `/?tab=revenue-operations`; resumo e atalho também no dashboard principal.

## Escopo implantável

- Duas frentes: Contract Revenue e API Revenue. Estados financeiros potencial, contratado, pendente e confirmado separados; permanecem NÃO VERIFICADOS até integração autenticada com o Revenue Ledger.
- Radar existente reutilizado por leitura do documento público `marketplace_agent_state/unified`, sem acionar polling, claims ou ingestão. Fonte com mais de 15 minutos ou data futura permanece antiga. Links, hashes e datas por oportunidade; filtros por mercado e estado.
- BaseBounty: GET público fixo, timeout, limite de 1 MB, sem redirecionamentos ou credenciais. Rede Base mainnet e schema conferidos. Lista vazia de fonte válida pode indicar zero registros; falha significa indisponível com contagem null. Gas para claim impede avanço pela política de custo inicial zero.
- Catálogo consultado na rota existente GET `/api/v1/services`. O estado AVAILABLE é uma declaração do catálogo, não teste de execução nem evidência de venda.
- Três propostas AgenticTrade do handoff: USDC Proof Validator (0,01), API Health Auditor (0,02) e Bounty Intelligence (0,05 USDC/chamada). Preços propostos, sem endpoint novo ou publicação comercial. Revisões são rascunhos efêmeros UNSENT.
- Coinbase mantém seu card e gate de identidade existentes. Command privado acessível por link; nenhuma federação privada ou autorização é presumida.

## Integração e controles

GET `/api/integration-status?view=revenue-operations` despacha o novo handler antes do agregador legado. Não aumenta o número de funções Vercel. POST/PUT/DELETE retornam 405 antes de ler provedores. Não existem assinaturas, depósitos, compras, execução paga de APIs, aceite de termos ou operações financeiras neste fluxo.

Normalização separa evidência histórica on-chain, relato do provedor e financiamento desconhecido. Exige hash e data para classificar evidência on-chain do radar, sem tratar isso como validação atual do escrow. Custos desconhecidos, elegibilidade desconhecida e ausência de aprovação impedem qualquer liberação. Registros repetidos do mesmo provedor/ID são deduplicados; conflitos invalidam a fonte. Nenhum registro financeiro é escrito; reconciliação real e sua deduplicação continuam pendentes.

## Auditoria das fontes — 10/10/2026 UTC

Leitura direta do BaseBounty retornou chainId 8453, testnet false, count 0 e bounties vazio. O catálogo publicado GXEON retornou quatro serviços: JSON Validate, CSV Audit, URL Verify, API Health. O radar existente continha oportunidades Taskmarket/MergePay e evidências históricas de financiamento, inclusive prazos vencidos; não comprova claim, aceite ou pagamento para a empresa.

Documentação primária consultada: https://www.basebounty.app/developers, https://agentictrade.io/docs/getting-started, https://ubounty.ai/bounties, https://www.openbounty.app/. AgenticTrade requer validação da conta do provedor e autorização específica antes da publicação comercial. Open Bounty não exige pré-financiamento; isso não permite classificá-lo como contrato financiado.

## Validação e limites

Testes cobrem indisponibilidade ≠ zero, idade/futuro, custo/gas/bond, prazo vencido, links não autorizados, evidência incompleta, duplicidade/conflito, dados inválidos, tamanho máximo e bloqueio de verbos de escrita. Validar também build, lint, CI e interface na implantação.

Fluxo final necessário por contrato: fonte e escopo → funding e elegibilidade → custo zero → aprovação humana → execução ALETIX → testes/evidências → aceite independente → confirmação de USDC → reconciliação autenticada. Este bloco observa e prepara; essas etapas não são declaradas concluídas pelo simples carregamento da interface.
