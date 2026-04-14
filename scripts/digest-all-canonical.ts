/**
 * wiki/sources 전체를 각 canonical 문서에 순서대로 소화(append)합니다.
 * OpenAI 호출이 많으니 시간·비용이 큽니다.
 */
import { spawnSync } from "child_process";
import { loadEnv } from "./loadEnv";
import { CANONICAL_FILES } from "./canonical-manifest";

loadEnv();

function runOne(canonical: string) {
  console.log(`\n========== digest: ${canonical} ==========\n`);
  const cmd = `npx tsx scripts/digest-sources-to-canonical.ts --canonical ${canonical}`;
  const r = spawnSync(cmd, { stdio: "inherit", cwd: process.cwd(), shell: true, env: process.env });
  if (r.status !== 0) {
    console.error(`[digest-all] 실패: ${canonical} (status ${r.status})`);
  }
}

async function main() {
  for (const f of CANONICAL_FILES) {
    runOne(f);
  }
  console.log("\n[digest-all] 전체 순회 끝. wiki/canonical/*.md 를 사람이 검수한 뒤 npm run ingest:wiki 하세요.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
