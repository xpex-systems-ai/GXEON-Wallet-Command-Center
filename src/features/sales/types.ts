export type MoneyTruthState =
  | 'CUSTOMER_CREATED'
  | 'CHECKOUT_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_SUCCEEDED'
  | 'JOB_CREATED'
  | 'EXECUTING'
  | 'QA_PASSED'
  | 'DELIVERED'
  | 'FUNDS_PENDING'
  | 'FUNDS_AVAILABLE_STRIPE'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_PAID_TO_BANK'
  | 'REFUNDED'
  | 'FAILED';

export interface QuickFixProduct {
  id: string;
  name: string;
  description: string;
  priceBrl: number;
  currency: 'BRL';
  deliverables: string[];
  limits: string[];
  estimatedDeliveryHours: string;
  clientRequirements: string[];
  refundPolicy: string;
}

export const GXEON_QUICK_FIX_SERVICE: QuickFixProduct = {
  id: 'gxeon_quick_fix_v1',
  name: 'GXEON Quick Fix',
  description: 'Diagnóstico técnico especializado e implementação de 1 correção cirúrgica para seu website, app ou script.',
  priceBrl: 49.0,
  currency: 'BRL',
  deliverables: [
    'Análise e diagnóstico técnico detalhado com identificação da causa raiz',
    'Implementação de 1 correção de código delimitada e testada',
    'Relatório de entrega com validação do resultado e instruções de aplicação'
  ],
  limits: [
    'Limitado a 1 bug, erro de layout, script quebrado ou falha de integração específica',
    'Não inclui redesign completo, criação de novas features complexas ou refatoração estrutural',
    'O cliente deve fornecer trecho de código, acesso ao repositório ou passos detalhados de reprodução'
  ],
  estimatedDeliveryHours: '2 a 4 horas úteis após confirmação do pagamento e recebimento dos detalhes',
  clientRequirements: [
    'URL do site/app ou descrição do ambiente',
    'Passos claros para reproduzir o erro ou print do problema',
    'Código-fonte relevante ou acesso ao repositório/arquivo'
  ],
  refundPolicy: 'Solicitações elegíveis a reembolso serão processadas de acordo com a política do serviço.'
};

export interface CustomerOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  serviceId: string;
  amountBrl: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  state: MoneyTruthState;
  problemSummary: string;
  repoOrCodeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobTicket {
  ticketId: string;
  orderId: string;
  service: string;
  customerIntake: {
    customerEmail: string;
    customerName: string;
    problemSummary: string;
    repoOrCodeUrl?: string;
  };
  paymentReference: string;
  state: MoneyTruthState;
  diagnosisNotes?: string;
  solutionDiff?: string;
  qaVerificationNotes?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}
