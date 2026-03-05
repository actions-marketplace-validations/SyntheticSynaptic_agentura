import { promises as fs } from "node:fs";
import path from "node:path";

export async function loadRubric(filePath: string): Promise<string> {
  const absolutePath = path.resolve(process.cwd(), filePath);

  try {
    return await fs.readFile(absolutePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Rubric file not found: ${filePath}`);
    }
    throw error;
  }
}
