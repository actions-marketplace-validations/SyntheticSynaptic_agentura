export interface SemanticSimilarityOptions {
  getEmbedding: (text: string) => Promise<number[]>;
  cache?: Map<string, number[]>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const similarity = dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  return Math.max(0, Math.min(1, similarity));
}

export async function scoreSemanticSimilarity(
  a: string,
  b: string,
  options: SemanticSimilarityOptions
): Promise<number> {
  const cache = options.cache;

  const getOrCreate = async (text: string): Promise<number[]> => {
    const cached = cache?.get(text);
    if (cached) {
      return cached;
    }

    const embedding = await options.getEmbedding(text);
    cache?.set(text, embedding);
    return embedding;
  };

  const [aEmbedding, bEmbedding] = await Promise.all([getOrCreate(a), getOrCreate(b)]);
  return cosineSimilarity(aEmbedding, bEmbedding);
}
