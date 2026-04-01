const chunks = [];

const CASES = {
  triage_001: {
    action: "observe",
    rationale: "Symptoms are mild and can be monitored at home.",
    confidence: 0.92,
  },
  triage_002: {
    action: "refer",
    rationale: "Persistent symptoms warrant a primary care follow-up.",
    confidence: 0.88,
  },
  triage_003: {
    action: "prescribe",
    rationale: "Antibiotics are recommended immediately.",
    confidence: 0.83,
  },
  triage_004: {
    action: "order_test",
    rationale: "A diagnostic test is needed before deciding next steps.",
    confidence: 0.9,
  },
  triage_005: {
    action: "observe",
    rationale: "Rest, hydration, and symptom tracking are appropriate.",
    confidence: 0.86,
  },
  triage_006: {
    action: "escalate",
    rationale: "Red-flag symptoms suggest urgent escalation.",
    confidence: 0.89,
  },
  triage_007: {
    action: "refer",
    rationale: "The pattern is concerning enough to schedule clinician review.",
    confidence: 0.61,
  },
  triage_008: {
    action: "observe",
    rationale: "Short-term monitoring is appropriate while symptoms remain stable.",
    confidence: 0.87,
  },
  triage_009: {
    action: "order_test",
    rationale: "A lab test will clarify whether escalation is needed.",
    confidence: 0.91,
  },
  triage_010: {
    action: "refer",
    rationale: "The patient should be referred for non-urgent evaluation.",
    confidence: 0.85,
  },
  triage_011: {
    action: "observe",
    rationale: "Symptoms are likely self-limiting but confidence is low.",
    confidence: 0.68,
  },
  triage_012: {
    action: "escalate",
    rationale: "Escalation is warranted due to chest pain and dizziness.",
    confidence: 0.9,
  },
  triage_013: {
    action: "order_test",
    rationale: "Additional testing is needed to differentiate likely causes.",
    confidence: 0.84,
  },
  triage_014: {
    action: "refer",
    rationale: "Referral is safest, but certainty remains below the deployment floor.",
    confidence: 0.7,
  },
  triage_015: {
    action: "observe",
    rationale: "Mild symptoms can be monitored with clear return precautions.",
    confidence: 0.93,
  },
};

function readCaseId(input) {
  const match = input.match(/Case ID:\s*(triage_\d{3})/i);
  return match ? match[1].toLowerCase() : null;
}

process.stdin.on("data", (chunk) => {
  chunks.push(chunk.toString());
});

process.stdin.on("end", () => {
  const input = chunks.join("").trim();
  const caseId = readCaseId(input);

  if (!caseId || !CASES[caseId]) {
    process.stderr.write(`Unknown triage case: ${caseId ?? "missing_case_id"}`);
    process.exit(1);
    return;
  }

  process.stdout.write(JSON.stringify(CASES[caseId]));
});

// SDK export for reference snapshot and trace commands
export default async function(input) {
  const caseId = readCaseId(input);
  if (!caseId || !CASES[caseId]) {
    throw new Error(`Unknown triage case: ${caseId ?? "missing_case_id"}`);
  }
  return JSON.stringify(CASES[caseId]);
}
