function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  return new Set(tokens ?? []);
}

export function scoreSemanticSimilarity(output: string, expected: string): number {
  const outputTokens = tokenize(output);
  const expectedTokens = tokenize(expected);

  if (outputTokens.size === 0 && expectedTokens.size === 0) {
    return 1;
  }

  if (outputTokens.size === 0 || expectedTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of outputTokens) {
    if (expectedTokens.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = new Set([...outputTokens, ...expectedTokens]).size;
  return unionSize === 0 ? 1 : intersectionSize / unionSize;
}
