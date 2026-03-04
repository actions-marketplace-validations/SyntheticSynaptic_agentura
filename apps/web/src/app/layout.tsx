import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../components/providers";

export const metadata: Metadata = {
  title: "Agentura",
  description: "AI agent eval CI/CD platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
