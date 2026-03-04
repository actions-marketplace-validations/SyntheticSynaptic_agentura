export function scoreExactMatch(output: string, expected: string): number {
  return output.trim().toLowerCase() === expected.trim().toLowerCase() ? 1 : 0;
}
