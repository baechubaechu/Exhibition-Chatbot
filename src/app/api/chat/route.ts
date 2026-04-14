import { NextRequest } from "next/server";
import { createDataStreamResponse, streamText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { twoStageRetrieve, buildContextBlock } from "@/lib/rag";
import { rateLimitOrThrow } from "@/lib/rateLimit";
import { faqCacheGet, faqCacheSet } from "@/lib/faqCache";
import { tryStaticFaqMatch } from "@/lib/staticFaq";
import { insertChatTurn, classifyOutcome } from "@/lib/chatTurn";
import { classifyExhibitTopic } from "@/lib/offTopic";
import { translateToEnglishBatch } from "@/lib/translateDisplay";
import { publishSceneHintFromChat } from "@/lib/sceneHint";

export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  sessionId: z.string().min(8).max(200),
  locale: z.enum(["ko", "en"]).optional(),
  /** 클라이언트가 요청마다 보내 스트림 data 이벤트와 매칭 */
  clientSubmitId: z.string().min(8).max(120).optional(),
});

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const enHdr = req.headers.get("x-es-locale") === "en";
    return new Response(enHdr ? "Invalid JSON body." : "요청 본문이 올바른 JSON이 아닙니다.", { status: 400 });
  }

  const localeHint =
    typeof raw === "object" && raw !== null && (raw as { locale?: string }).locale === "en" ? "en" : "ko";

  const parsedBody = bodySchema.safeParse(raw);
  if (!parsedBody.success) {
    return new Response(
      localeHint === "en" ? "Invalid request body." : "잘못된 요청 본문입니다.",
      { status: 400 },
    );
  }
  const body = parsedBody.data;

  try {
    rateLimitOrThrow(`chat:${clientIp(req)}`);
  } catch (e) {
    if ((e as Error).message === "RATE_LIMITED") {
      const localeEarly = body.locale === "en" ? "en" : "ko";
      return new Response(
        localeEarly === "en"
          ? "Too many requests. Please try again in a moment."
          : "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        { status: 429 },
      );
    }
    throw e;
  }

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    const loc = body.locale === "en" ? "en" : "ko";
    return new Response(loc === "en" ? "No user message was provided." : "사용자 메시지가 없습니다.", {
      status: 400,
    });
  }

  const question = lastUser.content.trim();
  if (!question) {
    const loc = body.locale === "en" ? "en" : "ko";
    return new Response(loc === "en" ? "Empty question." : "빈 질문입니다.", { status: 400 });
  }

  const locale = body.locale === "en" ? "en" : "ko";

  if (process.env.DISABLE_TOPIC_GUARD !== "1") {
    const topic = await classifyExhibitTopic(question);
    if (topic.label === "off_topic") {
      let reasonBlock = topic.reason_ko;
      if (locale === "en") {
        const [reasonEn] = await translateToEnglishBatch([topic.reason_ko]);
        reasonBlock = reasonEn ?? topic.reason_ko;
      }
      const offTopicMessage =
        locale === "en"
          ? "This question is outside the scope of this exhibit assistant, so we cannot answer it.\n" +
            "Please ask again about architecture, the site, the Geumjeong context, layering, nodes, theory, exhibit FAQ, and similar topics.\n\n" +
            `(Classifier note) ${reasonBlock}`
          : "이 질문은 전시 프로젝트 안내 범위와 직접 관련이 없어 답변할 수 없습니다.\n" +
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
      return result.toDataStreamResponse();
    }
  }

  const cached = faqCacheGet(question);
  if (cached) {
    const cacheStreamKo = [
      {
        role: "system" as const,
        content:
          "아래 USER_TEXT를 한 글자도 수정하지 말고 그대로 출력하세요. 다른 설명은 금지입니다.",
      },
      { role: "user" as const, content: `USER_TEXT:\n${cached.answer}` },
    ];
    const cacheStreamEn = [
      {
        role: "system" as const,
        content:
          "Translate USER_TEXT into clear, natural English. Output only the translation, no preamble or quotes.",
      },
      { role: "user" as const, content: `USER_TEXT:\n${cached.answer}` },
    ];
    const result = streamText({
      model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
      temperature: 0,
      maxTokens: 256,
      messages: locale === "en" ? cacheStreamEn : cacheStreamKo,
      async onFinish({ text }) {
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
    return result.toDataStreamResponse();
  }

  const staticAns = tryStaticFaqMatch(question);
  if (staticAns) {
    const citationsJson = JSON.stringify([]);
    const staticStreamKo = [
      {
        role: "system" as const,
        content: "USER_TEXT를 한 글자도 수정하지 말고 그대로 출력하세요.",
      },
      { role: "user" as const, content: `USER_TEXT:\n${staticAns}` },
    ];
    const staticStreamEn = [
      {
        role: "system" as const,
        content:
          "Translate USER_TEXT into clear, natural English. Output only the translation, no preamble or quotes.",
      },
      { role: "user" as const, content: `USER_TEXT:\n${staticAns}` },
    ];
    const result = streamText({
      model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
      temperature: 0,
      maxTokens: 512,
      messages: locale === "en" ? staticStreamEn : staticStreamKo,
      async onFinish({ text }) {
        faqCacheSet(question, staticAns, citationsJson);
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
    return result.toDataStreamResponse();
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const submitTag = body.clientSubmitId ?? "none";
      const { wikiChunks, rawChunks, debug } = await twoStageRetrieve(question, {
        onBeforeRawSearch: () => {
          dataStream.writeData({
            type: "rag_status",
            phase: "raw_search",
            locale,
            clientSubmitId: submitTag,
          });
        },
      });
      const wikiIds = wikiChunks.map((c) => c.id);
      const rawIds = rawChunks.map((c) => c.id);

      const refusalMessage =
        locale === "en"
          ? "We could not find reliable evidence for this question in the exhibit materials (curated wiki and raw logs). " +
            "Please contact the project team directly, or try again another day when the materials may have been updated."
          : "제공된 전시 자료(정리 위키·원문 로그)에서 이 질문에 대한 확실한 근거를 찾지 못했습니다. " +
            "프로젝트 담당자에게 직접 문의하시거나, 다음날 다시 찾아주시면 자료가 보강되었을 수 있습니다.";

      if (!debug.wikiConfidenceOK && !debug.rawConfidenceOK) {
        const refusal = streamText({
          model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
          temperature: 0,
          maxTokens: 220,
          messages: [
            { role: "system", content: "USER_TEXT를 한 글자도 바꾸지 말고 그대로 출력하세요." },
            { role: "user", content: `USER_TEXT:\n${refusalMessage}` },
          ],
          async onFinish({ text }) {
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
        refusal.mergeIntoDataStream(dataStream);
        return;
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

      const systemContent =
        locale === "en"
          ? [
              "You are an assistant for a graduation architecture exhibit.",
              "CONTEXT may be in Korean (curated wiki and raw logs). The visitor may write in Korean.",
              "Answer in clear, natural English only, strictly grounded in CONTEXT. Do not invent facts.",
              "Do not include citation numbers, 'Sources:' lists, #n markers, or wiki/raw meta labels in the answer. Use natural sentences only.",
              "",
              "CONTEXT:",
              context,
            ].join("\n")
          : [
              "당신은 졸업전시 안내 도우미입니다.",
              "반드시 CONTEXT에 근거해 한국어로 답하세요. CONTEXT에 없는 사실은 만들지 마세요.",
              "답변 본문에 출처 번호, '근거:' 목록, #n 표기, wiki/raw 같은 메타 표기를 넣지 마세요. 자연스러운 문장만 사용하세요.",
              "",
              "CONTEXT:",
              context,
            ].join("\n");

      const coreMessages: CoreMessage[] = [
        { role: "system", content: systemContent },
        ...body.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const _mt = Number(process.env.OPENAI_CHAT_MAX_TOKENS);
      const answerMaxTokens = Number.isFinite(_mt) ? Math.min(1200, Math.max(400, _mt)) : 680;
      const result = streamText({
        model: openai(process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini"),
        temperature: 0.2,
        maxTokens: answerMaxTokens,
        messages: coreMessages,
        async onFinish({ text }) {
          publishSceneHintFromChat({
            question,
            locale,
            sessionId: body.sessionId,
          });
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
      result.mergeIntoDataStream(dataStream);
    },
  });
}
