import OpenAI from "openai";

let client: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
    client = new OpenAI({ apiKey: key });
  }
  return client;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const res = await getOpenAI().embeddings.create({ model, input: texts });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}
