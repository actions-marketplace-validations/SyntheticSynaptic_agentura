"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    label: "Overview",
    links: [{ label: "Introduction", href: "/docs" }, { label: "Quick Start", href: "/docs/quickstart" }],
  },
  {
    label: "CLI",
    links: [
      { label: "Installation", href: "/docs/cli/installation" },
      { label: "agentura init", href: "/docs/cli/init" },
      { label: "agentura generate", href: "/docs/cli/generate" },
      { label: "agentura run", href: "/docs/cli/run" },
      { label: "agentura login", href: "/docs/cli/login" },
    ],
  },
  {
    label: "Configuration",
    links: [
      { label: "agentura.yaml", href: "/docs/configuration" },
      { label: "Eval Strategies", href: "/docs/strategies" },
      { label: "Editing AI Evals", href: "/docs/editing-evals" },
    ],
  },
  {
    label: "Concepts",
    links: [
      { label: "How It Works", href: "/docs/how-it-works" },
      { label: "Baseline Comparison", href: "/docs/baseline-comparison" },
      { label: "No SDK Required", href: "/docs/no-sdk" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 h-full overflow-y-auto border-r border-slate-800 px-4 py-8">
      {sections.map((section, index) => (
        <div key={section.label} className={index === 0 ? "" : "mt-6"}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            {section.label}
          </p>
          <nav>
            {section.links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block py-1 text-sm transition ${
                    isActive ? "font-medium text-violet-400" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">More</p>
        <a
          href="https://github.com/SyntheticSynaptic/agentura"
          target="_blank"
          rel="noreferrer"
          className="block py-1 text-sm text-slate-400 transition hover:text-white"
        >
          GitHub
        </a>
        <Link href="/dashboard" className="block py-1 text-sm text-slate-400 transition hover:text-white">
          Dashboard
        </Link>
        <Link href="/docs/changelog" className="block py-1 text-sm text-slate-400 transition hover:text-white">
          Changelog
        </Link>
      </div>
    </div>
  );
}
