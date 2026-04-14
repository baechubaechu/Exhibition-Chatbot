import { NextRequest } from "next/server";
import { streamText, StreamData, type CoreMessage, type JSONValue } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { twoStageRetrieve, buildContextBlock, type RetrievedChunk } from "@/lib/rag";
import { rateLimitOrThrow } from "@/lib/rateLimit";
import { faqCacheGet, faqCacheSet } from "@/lib/faqCache";
import { tryStaticFaqMatch } from "@/lib/staticFaq";
import { insertChatTurn, classifyOutcome } from "@/lib/chatTurn";
import { classifyExhibitTopic } from "@/lib/offTopic";

export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  sessionId: z.string().min(8).max(200),
});

function excerpt(s: string, n = 220): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function toCitations(chunks: RetrievedChunk[]) {
  return chunks.map((c) => ({
    source: c.source,
    id: c.id,
    title: c.title,
    path: c.sectionPath ? `${c.title} / ${c.sectionPath}` : c.title,
    excerpt: excerpt(c.content),
  }));
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return new Response("잘못된 요청 본문입니다.", { status: 400 });
  }

  try {
    rateLimitOrThrow(`chat:${clientIp(req)}`);
  } catch (e) {
    if ((e as Error).message === "RATE_LIMITED") {
      return new Response("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", { status: 429 });
    }
    throw e;
  }

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return new Response("사용자 메시지가 없습니다.", { status: 400 });

  const question = lastUser.content.trim();
  if (!question) return new Response("빈 질문입니다.", { status: 400 });

  if (process.env.DISABLE_TOPIC_GUARD !== "1") {
    const topic = await classifyExhibitTopic(question);
    if (topic.label === "off_topic") {
      const data = new StreamData();
      const offTopicMessage =
        "이 질문은 전시 프로젝트 안내 범위와 직접 관련이 없어 답변할 수 없습니다.\n" +
        "건축·대지·금정 맥락·매싱·노드·층위·이론·전시 FAQ 등으로 다시 질문해 주세요.\n\n" +
        `(분류 사유) ${topic.reason_ko}`;
      const result = streamText({
        model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
        temperature: 0,
        maxTokens: 320,
        messages: [
          { role: "system", content: "USER_TEXT를 한 글자도 바꾸지 말고 그대로 출력하세요." },
          { role: "user", content: `USER_TEXT:\n${offTopicMessage}` },
        ],
        async onFinish({ text }) {
          data.append({ type: "citations", citations: [] as unknown as JSONValue });
          await data.close();
          await insertChatTurn({
            sessionId: body.sessionId,
            userMessage: question,
            assistantMessage: text,
            outcome: "refused",
            gapCandidate: false,
            retrievalDebug: {
              wikiChunkIds: [],
              rawChunkIds: [],
              offTopic: true,
              topicReason: topic.reason_ko,
            },
          }).catch(() => {});
        },
      });
      return result.toDataStreamResponse({ data });
    }
  }

  const cached = faqCacheGet(question);
  if (cached) {
    const data = new StreamData();
    const result = streamText({
      model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
      temperature: 0,
      maxTokens: 256,
      messages: [
        {
          role: "system",
          content:
            "아래 USER_TEXT를 한 글자도 수정하지 말고 그대로 출력하세요. 다른 설명은 금지입니다.",
        },
        { role: "user", content: `USER_TEXT:\n${cached.answer}` },
      ],
      async onFinish({ text }) {
        data.append({
          type: "citations",
          citations: JSON.parse(cached.citationsJson) as JSONValue,
        });
        await data.close();
        await insertChatTurn({
          sessionId: body.sessionId,
          userMessage: question,
          assistantMessage: text,
          outcome: "answered",
          gapCandidate: false,
          retrievalDebug: {
            wikiTop: 1,
            wikiConfidenceOK: true,
            rawTop: 0,
            rawConfidenceOK: false,
            wikiThreshold: 0,
            rawThreshold: 0,
            marginMin: 0,
            wikiChunkIds: [],
            rawChunkIds: [],
            cache: "memory",
          },
        }).catch(() => {});
      },
    });
    return result.toDataStreamResponse({ data });
  }

  const staticAns = tryStaticFaqMatch(question);
  if (staticAns) {
    const data = new StreamData();
    const citationsJson = JSON.stringify([]);
    const result = streamText({
      model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
      temperature: 0,
      maxTokens: 512,
      messages: [
        {
          role: "system",
          content: "USER_TEXT를 한 글자도 수정하지 말고 그대로 출력하세요.",
        },
        { role: "user", content: `USER_TEXT:\n${staticAns}` },
      ],
      async onFinish({ text }) {
        data.append({ type: "citations", citations: [] as unknown as JSONValue });
        await data.close();
        faqCacheSet(question, text, citationsJson);
        await insertChatTurn({
          sessionId: body.sessionId,
          userMessage: question,
          assistantMessage: text,
          outcome: "answered",
          gapCandidate: false,
          retrievalDebug: {
            wikiTop: 1,
            wikiConfidenceOK: true,
            rawTop: 0,
            rawConfidenceOK: false,
            wikiThreshold: 0,
            rawThreshold: 0,
            marginMin: 0,
            wikiChunkIds: [],
            rawChunkIds: [],
            cache: "static_faq",
          },
        }).catch(() => {});
      },
    });
    return result.toDataStreamResponse({ data });
  }

  const { wikiChunks, rawChunks, debug } = await twoStageRetrieve(question);
  const wikiIds = wikiChunks.map((c) => c.id);
  const rawIds = rawChunks.map((c) => c.id);

  const data = new StreamData();

  const refusalMessage =
    "제공된 전시 자료(정리 위키·원문 로그)에서 이 질문에 대한 확실한 근거를 찾지 못했습니다. " +
    "프로젝트 담당자에게 직접 문의하시거나, 다음날 다시 찾아주시면 자료가 보강되었을 수 있습니다.";

  if (!debug.wikiConfidenceOK && !debug.rawConfidenceOK) {
    const result = streamText({
      model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
      temperature: 0,
      maxTokens: 220,
      messages: [
        { role: "system", content: "USER_TEXT를 한 글자도 바꾸지 말고 그대로 출력하세요." },
        { role: "user", content: `USER_TEXT:\n${refusalMessage}` },
      ],
      async onFinish({ text }) {
        data.append({
          type: "citations",
          citations: toCitations([...wikiChunks, ...rawChunks].slice(0, 6)) as unknown as JSONValue,
        });
        await data.close();
        await insertChatTurn({
          sessionId: body.sessionId,
          userMessage: question,
          assistantMessage: text,
          outcome: "low_confidence",
          gapCandidate: true,
          retrievalDebug: {
            ...debug,
            wikiChunkIds: wikiIds,
            rawChunkIds: rawIds,
          },
        }).catch(() => {});
      },
    });
    return result.toDataStreamResponse({ data });
  }

  const usedWiki = debug.wikiConfidenceOK ? wikiChunks : wikiChunks.slice(0, 3);
  const usedRaw =
    !debug.wikiConfidenceOK && debug.rawConfidenceOK
      ? rawChunks
      : debug.wikiConfidenceOK
        ? []
        : rawChunks;
  const contextChunks = [...usedWiki, ...usedRaw];
  const context = buildContextBlock(contextChunks);

  const coreMessages: CoreMessage[] = [
    {
      role: "system",
      content: [
        "당신은 졸업전시 안내 도우미입니다.",
        "반드시 CONTEXT에 근거해 한국어로 답하세요. CONTEXT에 없는 사실은 만들지 마세요.",
        "답변 끝에 짧게 '근거:' 라고 적고, 사용한 조각 번호(#n)와 source(wiki/raw)를 나열하세요.",
        "",
        "CONTEXT:",
        context,
      ].join("\n"),
    },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const result = streamText({
    model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
    temperature: 0.2,
    maxTokens: 900,
    messages: coreMessages,
    async onFinish({ text }) {
      const citations = toCitations(contextChunks);
      data.append({ type: "citations", citations: citations as unknown as JSONValue });
      await data.close();
      const { outcome, gapCandidate } = classifyOutcome(debug);
      await insertChatTurn({
        sessionId: body.sessionId,
        userMessage: question,
        assistantMessage: text,
        outcome,
        gapCandidate,
        retrievalDebug: {
          ...debug,
          wikiChunkIds: wikiIds,
          rawChunkIds: rawIds,
        },
      }).catch(() => {});
    },
  });

  return result.toDataStreamResponse({ data });
}
