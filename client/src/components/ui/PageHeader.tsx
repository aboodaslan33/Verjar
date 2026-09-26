import type { ReactNode } from 'react';

/** رأس الصفحات الداخلية */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="container py-10 md:py-14">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl md:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-prose text-lg text-muted">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}
