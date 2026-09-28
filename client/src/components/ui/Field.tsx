import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/format';
import { Icon } from './Icon';

/** رسالة خطأ الحقل — أيقونة + نص، وتُقرأ فور ظهورها */
export function FieldErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger anim-fade" role="alert">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

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
        <FieldErrorText id={`${id}-error`}>{error}</FieldErrorText>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] leading-relaxed text-muted">
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
            cursor: 'pointer',
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
                'group relative flex min-h-[3rem] items-start gap-3 rounded-lg border px-3.5 py-3 text-start text-[15px] transition-[border-color,background-color,box-shadow] duration-150',
                active
                  ? 'border-ink bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_rgb(var(--c-ink))]'
                  : 'border-line-strong bg-surface hover:border-ink/50',
                error && !active && 'border-danger/60',
              )}
            >
              <span
                className={cx(
                  'mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors',
                  active ? 'border-ink bg-ink' : 'border-line-strong group-hover:border-ink/50',
                )}
                aria-hidden
              >
                <span className={cx('h-1.5 w-1.5 rounded-full bg-primary transition-transform duration-150', active ? 'scale-100' : 'scale-0')} />
              </span>
              <span className="min-w-0">
                <span className="block leading-snug">{o.label}</span>
                {o.description && <span className="mt-0.5 block text-xs font-normal text-muted">{o.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <FieldErrorText id={`${id}-err`}>{error}</FieldErrorText>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </fieldset>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  description,
  error,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
  /** رسالة خطأ (خانة إلزامية لم تُحدد) */
  error?: string;
  id?: string;
}) {
  const errId = id ? `${id}-error` : undefined;
  return (
    <div>
      <label
        className={cx(
          'flex min-h-[3rem] cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-[border-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-brand-500/40',
          checked
            ? 'border-ink shadow-[inset_0_0_0_1px_rgb(var(--c-ink))]'
            : error
              ? 'border-danger bg-surface shadow-[inset_0_0_0_1px_rgb(var(--c-danger))]'
              : 'border-line-strong bg-surface hover:border-ink/50',
        )}
      >
        <input
          id={id}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
        />
        <span
          className={cx(
            'mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors duration-150',
            checked ? 'border-ink bg-ink text-primary' : error ? 'border-danger bg-surface' : 'border-line-strong bg-surface',
          )}
          aria-hidden
        >
          <svg viewBox="0 0 16 16" className={cx('h-3 w-3 transition-transform duration-150', checked ? 'scale-100' : 'scale-0')} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
        <span>
          <span className="block text-[15px] font-medium">{label}</span>
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      </label>
      {error && !checked && (
        <p id={errId} className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
