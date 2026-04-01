import { promises as fs } from "node:fs";
import path from "node:path";

export async function loadRubric(
  filePath: string,
  baseDir = process.cwd()
): Promise<string> {
  const absolutePath = path.resolve(baseDir, filePath);

  try {
    return await fs.readFile(absolutePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Rubric file not found: ${filePath}`);
    }
    throw error;
  }
}
