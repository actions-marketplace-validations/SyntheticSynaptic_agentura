import { CodeBlock } from "../../../../components/docs/CodeBlock";
import { ProseSection } from "../../../../components/docs/ProseSection";

const configExample = `{
  "apiKey": "agt_...",
  "baseUrl": "https://agentura-ci.vercel.app"
}`;

export default function DocsCliLoginPage() {
  return (
    <ProseSection title="agentura login" subtitle="Authenticate the CLI with your Agentura account">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Usage</h2>
        <CodeBlock code="agentura login" language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Browser flow
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Opens a browser window to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            agentura-ci.vercel.app/cli-auth
          </code>
          . Log in with GitHub if needed, then click Approve. Your API key is saved automatically
          to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            ~/.agentura/config.json
          </code>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Manual flow
        </h2>
        <CodeBlock code="agentura login --manual" language="bash" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Prompts you to paste an API key directly. Generate one at:{" "}
          <a
            href="https://agentura-ci.vercel.app/dashboard/settings/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 hover:text-violet-200"
          >
            agentura-ci.vercel.app/dashboard/settings/api-keys
          </a>
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Config file
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Credentials are stored at{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            ~/.agentura/config.json
          </code>
          :
        </p>
        <CodeBlock code={configExample} language="json" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          This file is created automatically on first login.
        </p>
      </section>
    </ProseSection>
  );
}
