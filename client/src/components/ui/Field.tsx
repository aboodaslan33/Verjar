import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/format';

type FieldShellProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
};

export function FieldShell({ label, error, hint, optional, id, children, className }: FieldShellProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ms-1 text-xs font-normal text-muted">(اختياري)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Extra = { label: string; error?: string; hint?: ReactNode; optional?: boolean; wrapperClassName?: string };

export const Input = forwardRef<HTMLInputElement, Extra & InputHTMLAttributes<HTMLInputElement>>(
  ({ label, error, hint, optional, wrapperClassName, className, id, ...rest }, ref) => {
    const autoId = useId();
    const fid = id ?? autoId;
    return (
      <FieldShell label={label} error={error} hint={hint} optional={optional} id={fid} className={wrapperClassName}>
        <input
          ref={ref}
          id={fid}
          className={cx('input', error && 'input-error', className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          {...rest}
        />
      </FieldShell>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, Extra & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ label, error, hint, optional, wrapperClassName, className, id, rows = 4, ...rest }, ref) => {
    const autoId = useId();
    const fid = id ?? autoId;
    return (
      <FieldShell label={label} error={error} hint={hint} optional={optional} id={fid} className={wrapperClassName}>
        <textarea
          ref={ref}
          id={fid}
          rows={rows}
          className={cx('input resize-y leading-relaxed', error && 'input-error', className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          {...rest}
        />
      </FieldShell>
    );
  },
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, Extra & SelectHTMLAttributes<HTMLSelectElement>>(
  ({ label, error, hint, optional, wrapperClassName, className, id, children, ...rest }, ref) => {
    const autoId = useId();
    const fid = id ?? autoId;
    return (
      <FieldShell label={label} error={error} hint={hint} optional={optional} id={fid} className={wrapperClassName}>
        <select
          ref={ref}
          id={fid}
          className={cx('input appearance-none bg-no-repeat pe-3.5 ps-9', error && 'input-error', className)}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23889' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundSize: '18px',
            backgroundPosition: 'left 12px center',
          }}
          aria-invalid={Boolean(error) || undefined}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  },
);
Select.displayName = 'Select';

/** اختيار من خيارات كبيرة قابلة للمس (بديل للراديو) */
export function ChoiceGroup<T extends string | boolean>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  columns = 2,
  name,
}: {
  label: string;
  value: T | undefined | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string }[];
  error?: string;
  hint?: ReactNode;
  columns?: 2 | 3 | 4;
  name?: string;
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div
        role="radiogroup"
        aria-describedby={error ? `${id}-err` : undefined}
        className={cx(
          'grid gap-2',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-2 sm:grid-cols-3',
          columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={active}
              name={name}
              onClick={() => onChange(o.value)}
              className={cx(
                'min-h-[3rem] rounded-xl border px-3 py-2.5 text-start text-[15px] transition-colors',
                active
                  ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800 ring-1 ring-brand-600 dark:bg-brand-900/40 dark:text-brand-100'
                  : 'border-line bg-surface hover:border-brand-300',
                error && !active && 'border-danger/60',
              )}
            >
              <span className="block">{o.label}</span>
              {o.description && <span className="mt-0.5 block text-xs font-normal text-muted">{o.description}</span>}
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label
      className={cx(
        'flex min-h-[3rem] cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        checked ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/40' : 'border-line bg-surface hover:border-brand-300',
      )}
    >
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
    </label>
  );
}
