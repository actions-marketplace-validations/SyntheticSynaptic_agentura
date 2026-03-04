export function scoreContains(output: string, expected: string): number {
  return output.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;
}
