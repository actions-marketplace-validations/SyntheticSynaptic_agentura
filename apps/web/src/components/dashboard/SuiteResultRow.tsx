"use client";

import { useState } from "react";
import { StatusBadge } from "./StatusBadge";

interface SerializableCaseResult {
  id: string;
  caseIndex: number;
  input: string;
  output: string | null;
  expected: string | null;
  score: number;
  passed: boolean;
  judgeReason: string | null;
  latencyMs: number | null;
}

interface SerializableSuiteResult {
  id: string;
  suiteName: string;
  strategy: string;
  score: number;
  threshold: number;
  baselineScore: number | null;
  passed: boolean;
  totalCases: number;
  passedCases: number;
}

interface SuiteResultRowProps {
  suite: SerializableSuiteResult;
  cases: SerializableCaseResult[];
}

function truncate(text: string | null | undefined, maxLength: number) {
  if (!text) {
    return "—";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export function SuiteResultRow({ suite, cases }: SuiteResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const delta = suite.baselineScore === null ? null : suite.score - suite.baselineScore;

  return (
    <>
      <tr className="border-t border-slate-200">
        <td className="px-4 py-3 align-middle">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-2 text-left font-medium text-slate-900 hover:text-slate-700"
          >
            <span className="text-xs text-slate-500">{expanded ? "▾" : "▸"}</span>
            {suite.suiteName}
            <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {suite.passedCases}/{suite.totalCases}
            </span>
          </button>
        </td>
        <td className="px-4 py-3 align-middle text-sm text-slate-700">{suite.strategy}</td>
        <td className="px-4 py-3 text-right align-middle font-mono text-sm text-slate-700">
          {suite.score.toFixed(2)}
        </td>
        <td className="px-4 py-3 text-right align-middle font-mono text-sm text-slate-700">
          {suite.threshold.toFixed(2)}
        </td>
        <td className="px-4 py-3 text-right align-middle font-mono text-sm text-slate-700">
          {suite.baselineScore === null ? "—" : suite.baselineScore.toFixed(2)}
        </td>
        <td className="px-4 py-3 text-right align-middle font-mono text-sm text-slate-700">
          {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}
        </td>
        <td className="px-4 py-3 align-middle">
          <StatusBadge status="completed" passed={suite.passed} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-t border-slate-200 bg-slate-50">
          <td colSpan={7} className="px-4 py-4">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-2 py-2 font-semibold text-slate-700">Case</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Input</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Output</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Expected</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Score</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Status</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Judge Reason</th>
                    <th className="px-2 py-2 font-semibold text-slate-700">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((result) => (
                    <tr key={result.id} className="border-b border-slate-200 last:border-0">
                      <td className="px-2 py-2 align-top text-slate-500">{result.caseIndex + 1}</td>
                      <td className="px-2 py-2 align-top font-mono text-slate-700">
                        {truncate(result.input, 100)}
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-slate-700">
                        {truncate(result.output, 100)}
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-slate-700">
                        {truncate(result.expected, 100)}
                      </td>
                      <td className="px-2 py-2 align-top text-slate-700">{result.score.toFixed(2)}</td>
                      <td className="px-2 py-2 align-top">
                        <StatusBadge status="completed" passed={result.passed} />
                      </td>
                      <td className="px-2 py-2 align-top text-slate-700">
                        {truncate(result.judgeReason, 100)}
                      </td>
                      <td className="px-2 py-2 align-top text-slate-700">
                        {result.latencyMs === null ? "—" : `${result.latencyMs}ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
