import { STATUS_LABEL, STATUS_ORDER } from '../../lib/format';
import type { RequestStatus } from '../../lib/types';
import { Select } from '../ui';

export function StatusSelect({
  value,
  onChange,
  label = 'الحالة',
  disabled,
}: {
  value: RequestStatus;
  onChange: (s: RequestStatus) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Select label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as RequestStatus)}>
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </Select>
  );
}

/** خيارات الحالة لفلاتر القوائم */
export function StatusOptions() {
  return (
    <>
      <option value="">كل الحالات</option>
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </>
  );
}
