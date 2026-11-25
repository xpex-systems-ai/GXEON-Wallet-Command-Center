# Verificação externa das APIs GXEON

| Programa | Teto anunciado | Cadência e condição para o GXEON |
| --- | --- | --- |
| PayAPI Market | 0,10 pela carteira do operador | Uma compra de verificação em uma rota após revisão. JSON Validate e CSV Audit já têm submissões separadas. Acima do teto o vendedor financia o teste. [Regras](https://payapi.market/list) |
| Lumière PayCheck | 0,01 no teste automático geral. Até 0,05 conforme procura ou histórico de recebimentos | JSON Validate já é monitorado. Compare o recibo assinado, a prova da transferência e o resultado original. [Guia](https://lumierepaycheck.org/docs/sellers#6-seller-funded-tests) |
| Market402 | 0,05 por sondagem | Sondagens pagas no máximo mensais por serviço, sujeitas à seleção e ao orçamento. CSV Audit já consta no opt-in com amostra POST e teto declarado de 0,01. [Metodologia](https://market402.com/methodology) · [Opt-in](https://market402.com/optin.json) |
| vet402 | 0,25 por compra. 0,10 para vendedor sem histórico suficiente | O catálogo precisa declarar termos compatíveis com a cotação. A seleção inicial considera a rota Base mais barata. [Metodologia](https://vet402.com/observatory/methodology) |
| Settled | 1,00 em rotação própria | A rota mais barata tem prioridade. A faixa superior tem cadência mais lenta para vendedores cujas rotas se enquadram nessa faixa. As duas rotas GXEON já indexadas têm alerta de método GET no catálogo e POST na API. [Política](https://settled.tools/bot) · [CSV](https://settled.tools/e/9053340) · [JSON](https://settled.tools/e/9053431) |

## Ofertas de lote

- **JSON Contract Batch** · `POST /x402/json-contract-batch` · 0,10 USDC na Base. Valida até 100 objetos com o mesmo contrato de campos obrigatórios e tipos.
- **CSV Import Check** · `POST /x402/csv-import-check` · 1 USDC na Base. Valida até dez CSVs antes da importação e aponta duplicatas entre arquivos e problemas nas colunas exigidas pelo comprador.

O agente comprador encontra as rotas em `GET /v1/offers`, em `/openapi.json` e na ferramenta pública MCP `gxeon_get_agent_buying_guide`. Cada desafio x402 leva método POST, tipo de corpo JSON e uma amostra sintética executável. Esses lotes são x402. Os packs Stripe atendem às ofertas de créditos existentes.

Depois que a revisão e a implantação forem confirmadas, verifique o desafio 402 em produção com uma amostra sintética e sem assinatura. Confira método, preço, rede e recebedor. Para verificação externa, use uma submissão por rota e por catálogo elegível. Preserve os cadastros existentes e use o mesmo preço público para qualquer comprador. Registre a entrega apenas depois de vincular a transação da Base ao resultado e ao recibo GXEON.
