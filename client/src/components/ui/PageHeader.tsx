import type { ReactNode } from 'react';

/** رأس الصفحات الداخلية */
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-subtle">
      <div className="container py-12 md:py-16">
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h1 className="text-3xl md:text-[2.75rem] md:leading-tight">{title}</h1>
        {description && <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}
