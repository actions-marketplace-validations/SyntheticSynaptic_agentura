import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const model = "gpt-4o-mini";
export const modelVersion = "gpt-4o-mini-2026-03-27";
export const systemPrompt = `You summarize patient histories for clinicians.
Never invent medications, diagnoses, or next steps.
When context is incomplete, say what is missing.`;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getDemoPatientRecord() {
  return {
    patient_id: "pt_demo",
    name: "Avery Chen",
    dob: "1986-01-23",
    mrn: "MRN-481516",
    diagnosis: "Type 2 diabetes",
    meds: ["metformin 500mg BID"],
    last_visit: "2026-03-01",
    note: "A1C improving, continue monitoring fasting glucose.",
  };
}

export default async function traceableAgent(
  input: string,
  options: { model?: string } = {}
) {
  const startedAt = performance.now();
  const selectedModel = options.model ?? model;
  const patientRecord = getDemoPatientRecord();

  const completion = await client.chat.completions.create({
    model: selectedModel,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Summarize the patient history below for a clinician.\n\nUser request: ${input}\n\nPatient chart:\n${JSON.stringify(
          patientRecord,
          null,
          2
        )}`,
      },
    ],
  });

  return {
    output: completion.choices[0]?.message?.content?.trim() ?? "",
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    inputTokens: completion.usage?.prompt_tokens,
    outputTokens: completion.usage?.completion_tokens,
    model: selectedModel,
    modelVersion,
    promptHash: sha256(systemPrompt),
    tool_calls: [
      {
        name: "patient_records.lookup",
        args: { patient_id: patientRecord.patient_id },
        result: patientRecord,
        timestamp: new Date().toISOString(),
        data_accessed: [
          `patient:${patientRecord.patient_id}`,
          `medications:${patientRecord.patient_id}`,
        ],
      },
    ],
  };
}
