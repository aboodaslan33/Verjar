import { useState } from 'react';
import { api } from '../../lib/api';
import type { Paged } from '../../lib/types';
import { Input } from '../ui';
import { useAdminQuery, useDebounced } from './hooks';

export type PickedCustomer = { id: string; name: string; phone: string; companyName: string | null };

/** اختيار عميل/شركة بالبحث بالاسم أو الهاتف (يستخدم قائمة العملاء الحالية) */
export function CustomerPicker({ value, onChange, label, error }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void; label: string; error?: string }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const results = useAdminQuery(() => (q.length >= 2 ? api.get<Paged<PickedCustomer>>('/admin/customers', { q, pageSize: 6 }) : Promise.resolve(null)), [q], { keep: true });
  if (value) {
    return (
      <div>
        <p className="label">{label}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line-strong p-3">
          <span>
            <span className="block font-medium">{value.companyName ?? value.name}</span>
            <span className="ltr block text-sm text-muted">{value.phone}</span>
          </span>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => onChange(null)}>
            ✕
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <Input label={label} value={search} onChange={(e) => setSearch(e.target.value)} error={error} placeholder="…" />
      {results.data && results.data.items.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {results.data.items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start hover:bg-subtle">
                <span className="font-medium">{c.companyName ?? c.name}</span>
                <span className="ltr text-sm text-muted">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
