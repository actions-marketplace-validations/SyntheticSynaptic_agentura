import type { ReactNode } from "react";

interface ProseSectionProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function ProseSection({ title, subtitle, children }: ProseSectionProps) {
  return (
    <article className="mx-auto w-full max-w-3xl pb-20">
      <header>
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {subtitle ? <p className="mt-2 text-lg text-slate-400">{subtitle}</p> : null}
        <div className="mb-10 mt-6 border-t border-slate-800" />
      </header>
      {children}
    </article>
  );
}
