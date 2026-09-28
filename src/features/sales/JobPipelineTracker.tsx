import React from 'react';
import { CustomerOrder, JobTicket, MoneyTruthState } from './types';

interface JobPipelineTrackerProps {
  orders: CustomerOrder[];
  tickets: JobTicket[];
  onTriggerExecution?: (ticketId: string) => void;
  onTriggerQA?: (ticketId: string) => void;
  onDeliverJob?: (ticketId: string) => void;
}

const STATE_BADGES: Record<MoneyTruthState, { label: string; bg: string; text: string }> = {
  CUSTOMER_CREATED: { label: 'Cliente Criado', bg: 'bg-slate-500/10 border-slate-500/20', text: 'text-slate-400' },
  CHECKOUT_CREATED: { label: 'Checkout Criado', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
  PAYMENT_PENDING: { label: 'Pagamento Pendente', bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
  PAYMENT_SUCCEEDED: { label: 'Pagamento Confirmado (Stripe)', bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
  JOB_CREATED: { label: 'Job Criado', bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  EXECUTING: { label: 'Em Execução', bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-400' },
  QA_PASSED: { label: 'QA Aprovado', bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-400' },
  DELIVERED: { label: 'Entregue ao Cliente', bg: 'bg-indigo-500/10 border-indigo-500/20', text: 'text-indigo-400' },
  FUNDS_PENDING: { label: 'Fundos em Liquidação', bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400' },
  FUNDS_AVAILABLE_STRIPE: { label: 'Saldo Disponível Stripe', bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-400' },
  PAYOUT_PENDING: { label: 'Transferência Bancária Pendente', bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400' },
  PAYOUT_PAID_TO_BANK: { label: 'Pago na Conta Bancária', bg: 'bg-emerald-500/25 border-emerald-500/50', text: 'text-emerald-300' },
  REFUNDED: { label: 'Reembolsado', bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
  FAILED: { label: 'Falha no Pagamento', bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400' }
};

export const JobPipelineTracker: React.FC<JobPipelineTrackerProps> = ({
  orders,
  tickets,
  onTriggerExecution,
  onTriggerQA,
  onDeliverJob
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-2xl max-w-4xl mx-auto my-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>⚙️</span> GXEON Direct Sales Job Pipeline
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Monitoramento zero-trust de pedidos Stripe e ciclo de vida de execução técnica.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-slate-800 text-slate-300">
            Total Pedidos: <strong>{orders.length}</strong>
          </span>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-10 bg-slate-950 rounded-lg border border-slate-800/80">
          <p className="text-slate-400 text-sm">Nenhum pedido registrado no momento.</p>
          <span className="text-xs text-slate-500 mt-1 block">
            Os pedidos criados via Stripe Checkout aparecerão aqui automaticamente.
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const ticket = tickets.find((t) => t.orderId === order.id);
            const badge = STATE_BADGES[order.state] || STATE_BADGES.CHECKOUT_CREATED;

            return (
              <div key={order.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-slate-400 font-bold">{order.id}</span>
                    <span className="text-sm font-semibold text-white">{order.customerName || order.customerEmail}</span>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </div>
                </div>

                <div className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                  <span className="text-slate-400 block mb-1 font-semibold">Problema Relatado:</span>
                  {order.problemSummary}
                  {order.repoOrCodeUrl && (
                    <div className="mt-1 text-slate-400">
                      <strong>Ref:</strong> <a href={order.repoOrCodeUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{order.repoOrCodeUrl}</a>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/60 gap-2">
                  <div>
                    Valor: <strong className="text-emerald-400">R$ {order.amountBrl.toFixed(2)}</strong> | Criado: {new Date(order.createdAt).toLocaleTimeString()}
                  </div>

                  {ticket && (
                    <div className="flex items-center gap-2">
                      {order.state === 'PAYMENT_SUCCEEDED' && (
                        <button
                          onClick={() => onTriggerExecution && onTriggerExecution(ticket.ticketId)}
                          className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
                        >
                          Iniciar Execução →
                        </button>
                      )}
                      {order.state === 'EXECUTING' && (
                        <button
                          onClick={() => onTriggerQA && onTriggerQA(ticket.ticketId)}
                          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium"
                        >
                          Rodar QA & Auditoria →
                        </button>
                      )}
                      {order.state === 'QA_PASSED' && (
                        <button
                          onClick={() => onDeliverJob && onDeliverJob(ticket.ticketId)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                        >
                          Confirmar Entrega →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
