import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../../lib/format';

/**
 * الأزرار — مستويات واضحة:
 * primary (كهرماني): الإجراء الرئيسي في الشاشة، مرة واحدة غالبًا
 * secondary (فحمي): إجراء قوي محايد
 * outline / ghost: إجراءات ثانوية
 */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:translate-y-0';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)] hover:bg-primary-hover',
  secondary: 'bg-ink text-bg hover:bg-ink/85',
  outline: 'border border-line-strong bg-surface text-ink hover:border-ink',
  ghost: 'text-ink hover:bg-subtle',
  danger: 'bg-danger text-white hover:bg-danger/90',
  whatsapp: 'bg-whatsapp text-white hover:bg-whatsapp-hover',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-base sm:h-[3.25rem]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', block = false, className?: string) {
  return cx(base, variants[variant], sizes[size], block && 'w-full', className);
}

type Common = { variant?: Variant; size?: Size; block?: boolean; loading?: boolean; children: ReactNode };

export const Button = forwardRef<HTMLButtonElement, Common & ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ variant = 'primary', size = 'md', block, loading, className, children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: Omit<Common, 'loading'> & LinkProps) {
  return (
    <Link className={buttonClass(variant, size, block, className)} {...rest}>
      {children}
    </Link>
  );
}

export function ButtonA({
  variant = 'primary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: Omit<Common, 'loading'> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={buttonClass(variant, size, block, className)} {...rest}>
      {children}
    </a>
  );
}
