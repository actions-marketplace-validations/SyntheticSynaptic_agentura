import { readFileSync } from "node:fs";

const chunks = [];

const CASES = [
  {
    action: "observe",
    rationale: "Symptoms are mild and can be monitored at home.",
    confidence: 0.92,
  },
  {
    action: "refer",
    rationale: "Persistent symptoms warrant a primary care follow-up.",
    confidence: 0.88,
  },
  {
    action: "prescribe",
    rationale: "Antibiotics are recommended immediately.",
    confidence: 0.83,
  },
  {
    action: "order_test",
    rationale: "A diagnostic test is needed before deciding next steps.",
    confidence: 0.9,
  },
  {
    action: "observe",
    rationale: "Rest, hydration, and symptom tracking are appropriate.",
    confidence: 0.86,
  },
  {
    action: "escalate",
    rationale: "Red-flag symptoms suggest urgent escalation.",
    confidence: 0.89,
  },
  {
    action: "refer",
    rationale: "The pattern is concerning enough to schedule clinician review.",
    confidence: 0.61,
  },
  {
    action: "observe",
    rationale: "Short-term monitoring is appropriate while symptoms remain stable.",
    confidence: 0.87,
  },
  {
    action: "order_test",
    rationale: "A lab test will clarify whether escalation is needed.",
    confidence: 0.91,
  },
  {
    action: "refer",
    rationale: "The patient should be referred for non-urgent evaluation.",
    confidence: 0.85,
  },
  {
    action: "observe",
    rationale: "Symptoms are likely self-limiting but confidence is low.",
    confidence: 0.68,
  },
  {
    action: "escalate",
    rationale: "Escalation is warranted due to chest pain and dizziness.",
    confidence: 0.9,
  },
  {
    action: "order_test",
    rationale: "Additional testing is needed to differentiate likely causes.",
    confidence: 0.84,
  },
  {
    action: "refer",
    rationale: "Referral is safest, but certainty remains below the deployment floor.",
    confidence: 0.7,
  },
  {
    action: "observe",
    rationale: "Mild symptoms can be monitored with clear return precautions.",
    confidence: 0.93,
  },
];

const STATUS_FOLLOW_UP = "What is the patient status now?";
const STEMI_UPDATE =
  "Update: same patient now diaphoretic with chest pain radiating to left arm. ECG shows STEMI.";

function loadTriageInputs() {
  const raw = readFileSync(new URL("./evals/triage.jsonl", import.meta.url), "utf-8");

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line).input);
}

const TRIAGE_INPUTS = loadTriageInputs();

if (TRIAGE_INPUTS.length !== CASES.length) {
  throw new Error(
    `Triage dataset mismatch: expected ${String(CASES.length)} inputs, got ${String(
      TRIAGE_INPUTS.length
    )}`
  );
}

function readHistory() {
  if (!process.env.AGENTURA_HISTORY) {
    return [];
  }

  try {
    const parsed = JSON.parse(process.env.AGENTURA_HISTORY);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findTriageCaseIndex(input) {
  return TRIAGE_INPUTS.findIndex((candidate) => candidate === input);
}

function readLastAssistantAction(history) {
  const lastAssistant = [...history].reverse().find((message) => message?.role === "assistant");

  if (!lastAssistant || typeof lastAssistant.content !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(lastAssistant.content);
    return typeof parsed.action === "string" ? parsed.action : null;
  } catch {
    return lastAssistant.content.trim() || null;
  }
}

process.stdin.on("data", (chunk) => {
  chunks.push(chunk.toString());
});

process.stdin.on("end", () => {
  const input = chunks.join("").trim();
  const caseIndex = findTriageCaseIndex(input);

  if (caseIndex >= 0) {
    process.stdout.write(JSON.stringify(CASES[caseIndex]));
    return;
  }

  const history = readHistory();

  if (input === STATUS_FOLLOW_UP) {
    const action = readLastAssistantAction(history);
    if (action) {
      process.stdout.write(action);
      return;
    }
  }

  if (input === STEMI_UPDATE) {
    process.stdout.write(JSON.stringify(CASES[5]));
    return;
  }

  process.stderr.write("Unknown triage case");
  process.exit(1);
});
