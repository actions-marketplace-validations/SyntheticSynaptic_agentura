import { CodeBlock } from "../../../../components/docs/CodeBlock";
import { ProseSection } from "../../../../components/docs/ProseSection";

export default function DocsCliInstallationPage() {
  return (
    <ProseSection title="CLI Installation">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Install globally via npm</h2>
        <CodeBlock code="npm install -g @agentura/cli" language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Verify installation
        </h2>
        <CodeBlock code={`agentura --version\nagentura --help`} language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Authenticate
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Use browser auth for the default flow:
        </p>
        <CodeBlock code="agentura login" language="bash" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          This opens a browser window to authenticate with GitHub. Your API key is saved to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            ~/.agentura/config.json
          </code>{" "}
          automatically.
        </p>
      </section>

      <section>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Manual alternative</h3>
        <CodeBlock code="agentura login --manual" language="bash" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Use this if you prefer to paste an API key directly. Generate one at{" "}
          <a
            href="https://agentura-ci.vercel.app/dashboard/settings/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 hover:text-violet-200"
          >
            agentura-ci.vercel.app/dashboard/settings/api-keys
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Requirements
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Node.js 18 or higher</li>
          <li>A GitHub account</li>
          <li>An AI agent with an HTTP endpoint</li>
        </ul>
      </section>
    </ProseSection>
  );
}
