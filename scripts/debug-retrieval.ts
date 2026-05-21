import { loadEnv } from "./loadEnv";
import { twoStageRetrieve } from "../src/lib/rag";

loadEnv();

const queries = [
  "레이어가 뭐야?",
  "층위 전략 설명해줘",
  "환승 레이어와 산책 레이어 차이",
  "레이어와 노드 관계",
  "노드가 뭐야?",
];

async function main() {
  for (const q of queries) {
    const { wikiChunks, rawChunks, debug } = await twoStageRetrieve(q);
    console.log("\n===", q, "===");
    console.log("wikiOK", debug.wikiConfidenceOK, "top", debug.wikiTop.toFixed(3), "rawOK", debug.rawConfidenceOK);
    for (const c of wikiChunks.slice(0, 5)) {
      console.log(`  wiki ${c.similarity.toFixed(3)} ${c.docId} | ${c.content.slice(0, 70).replace(/\n/g, " ")}…`);
    }
    for (const c of rawChunks.slice(0, 3)) {
      console.log(`  raw  ${c.similarity.toFixed(3)} ${c.docId} | ${c.content.slice(0, 70).replace(/\n/g, " ")}…`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
