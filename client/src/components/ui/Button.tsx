import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'whatsapp';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 select-none';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-hover',
  secondary: 'border border-line bg-subtle text-ink hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10',
  outline: 'border border-line bg-surface text-ink hover:bg-subtle',
  ghost: 'text-ink hover:bg-subtle',
  danger: 'bg-danger text-white hover:opacity-90',
  whatsapp: 'bg-[#1f7a4d] text-white hover:bg-[#19663f]',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-6 text-base',
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
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
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
