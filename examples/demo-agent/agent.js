const chunks = [];

process.stdin.on("data", (chunk) => {
  chunks.push(chunk.toString());
});

process.stdin.on("end", () => {
  const input = chunks.join("").trim().toLowerCase();

  if (input.includes("free plan")) {
    process.stdout.write("The free plan includes 3 projects.");
    return;
  }

  if (input.includes("integrations")) {
    process.stdout.write("AcmeBot integrates with Slack, GitHub, and Google Calendar.");
    return;
  }

  if (input.includes("deleted task")) {
    process.stdout.write("Deleted tasks can be restored for 30 days.");
    return;
  }

  if (input.includes("refund")) {
    process.stdout.write("I do not see a published refund policy in this mock agent.");
    return;
  }

  if (input.includes("hipaa")) {
    process.stdout.write("This mock agent does not claim HIPAA compliance.");
    return;
  }

  process.stdout.write("I only know the canned AcmeBot demo answers.");
});
