import { FINANCIAL_LABEL, STATUS_LABEL, financialTone, statusTone, type DeliveryStatus, type FinancialStatus } from '../../lib/delivery';
import { Tag } from '../ui';

export function DeliveryStatusTag({ status }: { status: DeliveryStatus }) {
  return <Tag tone={statusTone(status)}>{STATUS_LABEL[status]}</Tag>;
}

export function FinancialTag({ status }: { status: FinancialStatus | null | undefined }) {
  if (!status) return <span className="text-muted">—</span>;
  return <Tag tone={financialTone(status)}>{FINANCIAL_LABEL[status]}</Tag>;
}
