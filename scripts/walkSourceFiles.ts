import { readdir } from "fs/promises";
import { join, extname } from "path";

const TEXT_EXT = new Set([".md", ".txt", ".mdx", ".log"]);

export async function walkTextFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(p);
      } else if (ent.isFile() && TEXT_EXT.has(extname(ent.name).toLowerCase())) {
        out.push(p);
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}
