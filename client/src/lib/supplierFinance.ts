import type { PaymentMethod } from '../components/admin/types';
import type { DeliveryStatus, FinancialStatus, Tone } from './delivery';
import type { RequestStatus } from './types';

/** حالة مبلغ فرجار على الطلب — تُحسب في الخادم */
export type FeeStatus = 'PENDING' | 'DUE' | 'PAID' | 'PARTIALLY_PAID' | 'DISPUTED';

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  PENDING: 'معلّق',
  DUE: 'مستحق',
  PAID: 'مدفوع',
  PARTIALLY_PAID: 'مدفوع جزئيًا',
  DISPUTED: 'متنازع عليه',
};

export const FEE_STATUS_HINT: Record<FeeStatus, string> = {
  PENDING: 'الطلب قيد التنفيذ — لم يصبح قابلًا للتحصيل بعد',
  DUE: 'الطلب اكتمل وأصبح المبلغ مستحقًا لفرجار',
  PAID: 'تم دفع المبلغ لفرجار',
  PARTIALLY_PAID: 'تم دفع جزء من المبلغ',
  DISPUTED: 'يوجد اعتراض على العملية',
};

export const FEE_STATUS_TONE: Record<FeeStatus, Tone> = {
  PENDING: 'neutral',
  DUE: 'brand',
  PAID: 'success',
  PARTIALLY_PAID: 'sand',
  DISPUTED: 'danger',
};

export const FEE_STATUSES = Object.keys(FEE_STATUS_LABEL) as FeeStatus[];

export type FeeSummary = {
  orders: number;
  customerSales: number;
  supplierBase: number;
  fees: number;
  paid: number;
  outstanding: number;
  pending: number;
  due: number;
  disputed: number;
};

export type FeeRate = { percent: number; min: number; max: number; perProduct: boolean };

export type StatementRow = {
  id: string;
  number: number;
  orderId: string;
  orderNumber: number;
  orderCode: string | null;
  date: string;
  orderStatus: RequestStatus;
  paymentStatus: FinancialStatus | null;
  deliveryStatus: DeliveryStatus;
  customerTotal: number;
  supplierBase: number;
  feeAmount: number;
  feePaid: number;
  remaining: number;
  feeStatus: FeeStatus;
  settledByPayout: boolean;
  dispute: { note: string | null; by: 'SUPPLIER' | 'ADMIN' | null } | null;
  items: { id: string; product: string; quantity: number; supplierPrice: number; customerPrice: number; feePercent: number; feeAmount: number }[];
};

export type Activity =
  | { kind: 'SALE'; id: string; date: string; amount: number; ref: string; total: number }
  | { kind: 'FEE_PAYMENT'; id: string; date: string; amount: number; ref: string | null; method: PaymentMethod }
  | { kind: 'PAYOUT'; id: string; date: string; amount: number; ref: string | null; total: number };

export type FeePayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  paidAt: string;
  recordedBy?: string | null;
  orders: { id: string; number: number; amount: number }[];
};

export function rateLabel(r: FeeRate) {
  return r.perProduct ? `${r.min}% – ${r.max}%` : `${r.percent}%`;
}
