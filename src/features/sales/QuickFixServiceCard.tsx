import React, { useState } from 'react';
import { GXEON_QUICK_FIX_SERVICE, CustomerOrder } from './types';
import { salesClientService } from '../../services/salesClientService';

interface QuickFixServiceCardProps {
  onOrderCreated?: (order: CustomerOrder) => void;
  onCheckoutRequested?: (input: {
    customerName: string;
    customerEmail: string;
    problemSummary: string;
    repoOrCodeUrl?: string;
  }) => Promise<{ checkoutUrl: string; orderId: string }>;
}

export const QuickFixServiceCard: React.FC<QuickFixServiceCardProps> = ({
  onOrderCreated,
  onCheckoutRequested
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [problemSummary, setProblemSummary] = useState('');
  const [repoOrCodeUrl, setRepoOrCodeUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<{ checkoutUrl: string; orderId: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail || !problemSummary) return;

    setIsLoading(true);
    setErrorMsg(null);

    const intakePayload = {
      customerName,
      customerEmail,
      problemSummary,
      repoOrCodeUrl
    };

    try {
      let result: { checkoutUrl: string; orderId: string };
      if (onCheckoutRequested) {
        result = await onCheckoutRequested(intakePayload);
      } else {
        result = await salesClientService.requestCheckout(intakePayload);
      }

      setCheckoutResult(result);

      const newOrder: CustomerOrder = {
        id: result.orderId,
        customerName,
        customerEmail,
        serviceId: GXEON_QUICK_FIX_SERVICE.id,
        amountBrl: GXEON_QUICK_FIX_SERVICE.priceBrl,
        state: 'CHECKOUT_CREATED',
        problemSummary,
        repoOrCodeUrl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (onOrderCreated) {
        onOrderCreated(newOrder);
      }

      // Automatically redirect to verified Stripe Checkout session URL
      if (result.checkoutUrl && result.checkoutUrl.startsWith('https://')) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar sessão de pagamento no servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-2xl max-w-3xl mx-auto my-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-4 mb-6 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            ⚡ GXEON DIRECT SALES V1
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {GXEON_QUICK_FIX_SERVICE.name}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {GXEON_QUICK_FIX_SERVICE.description}
          </p>
        </div>
        <div className="bg-slate-950 px-5 py-3 rounded-lg border border-slate-800 text-right">
          <span className="text-xs text-slate-400 uppercase tracking-wider block">Preço Único</span>
          <span className="text-3xl font-extrabold text-emerald-400">
            R$ {GXEON_QUICK_FIX_SERVICE.priceBrl.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500 block">via Stripe Hosted Checkout</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="text-emerald-400">✓</span> O que está incluso
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {GXEON_QUICK_FIX_SERVICE.deliverables.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400">
            <strong>Prazo:</strong> {GXEON_QUICK_FIX_SERVICE.estimatedDeliveryHours}
          </div>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-lg border border-slate-800/80">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="text-amber-400">ℹ</span> Limites e Condições
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {GXEON_QUICK_FIX_SERVICE.limits.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400 font-medium">
            🛡️ <strong>Política:</strong> {GXEON_QUICK_FIX_SERVICE.refundPolicy}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {!checkoutResult ? (
        <form onSubmit={handleSubmit} className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            1. Descreva o problema para iniciar
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Seu Nome / Empresa</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail para Contato *</label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Descrição do Bug / Ajuste *</label>
            <textarea
              required
              rows={3}
              value={problemSummary}
              onChange={(e) => setProblemSummary(e.target.value)}
              placeholder="Descreva exatamente o que está quebrado ou precisa ser corrigido..."
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Link do Repositório ou URL do Site (opcional)</label>
            <input
              type="text"
              value={repoOrCodeUrl}
              onChange={(e) => setRepoOrCodeUrl(e.target.value)}
              placeholder="https://github.com/... ou https://meusite.com"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-900/30 disabled:opacity-50"
          >
            {isLoading ? 'Conectando ao Stripe Server...' : 'Prosseguir para Pagamento (R$ 49,00) →'}
          </button>
        </form>
      ) : (
        <div className="bg-slate-950 p-6 rounded-lg border border-emerald-500/30 text-center space-y-4">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
            ✓
          </div>
          <h3 className="text-lg font-bold text-white">Sessão Criada: #{checkoutResult.orderId}</h3>
          <p className="text-sm text-slate-300 max-w-md mx-auto">
            Redirecionando para o Stripe Checkout oficial para pagamento de <strong>R$ 49,00</strong>.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={checkoutResult.checkoutUrl}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors text-sm flex items-center justify-center gap-2"
            >
              💳 Ir para o Stripe Checkout
            </a>
            <button
              onClick={() => setCheckoutResult(null)}
              className="w-full sm:w-auto px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
            >
              Novo Pedido
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Status: <span className="text-amber-400 font-mono font-bold">CHECKOUT_CREATED</span> (Aguardando confirmação exclusiva do webhook)
          </div>
        </div>
      )}
    </div>
  );
};
