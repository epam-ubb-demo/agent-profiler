import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write a PDF buffer to disk, creating parent directories if needed.
 */
export async function savePdf(
  outputPath: string,
  data: Uint8Array,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, data);
}
