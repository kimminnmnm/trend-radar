import "server-only";
import { getModel, OpenAIAnalysisError, rateLimitMessage } from "./openai-client";
import { composeImagePrompt, IMAGE_SIZES, validImageSize, type ImageRequest } from "./image-assets";

/*
 * C4 이미지 생성 공통 모듈. Creative Collision(콘셉트 시안)과 Content Studio(제작용 이미지)가 함께 쓴다.
 * Responses API의 image_generation 도구를 쓴다(공식 문서 2026-10). 이미지 모델 이름은 추측해 넣지 않는다:
 * OPENAI_IMAGE_MODEL이 있을 때만 도구의 model로 지정하고, 없으면 API 기본값을 쓴다.
 */
type ImageOutput = { output?: Array<{ type?: string; result?: string; revised_prompt?: string }>; error?: { message?: string; code?: string; type?: string } };

async function requestOnce(prompt: string, size: string, timeoutMs: number) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new OpenAIAnalysisError("OPENAI_API_KEY가 설정되지 않았습니다.", 503, "OPENAI_NOT_CONFIGURED");
  const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim();
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: getModel(), input: prompt, store: false,
        tools: [{ type: "image_generation", size, quality: "low", output_format: "jpeg", output_compression: 70, ...(imageModel ? { model: imageModel } : {}) }],
        tool_choice: { type: "image_generation" },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new OpenAIAnalysisError(timedOut ? "이미지 생성 시간이 초과됐습니다." : "OpenAI API에 연결할 수 없습니다.", 504, timedOut ? "OPENAI_TIMEOUT" : "OPENAI_NETWORK_ERROR");
  }
  const body = await response.json().catch(() => ({})) as ImageOutput;
  if (!response.ok) throw new OpenAIAnalysisError(response.status === 429 ? rateLimitMessage(body.error) : body.error?.message || "이미지 생성 요청에 실패했습니다.", response.status === 429 ? 429 : response.status >= 500 ? 502 : 400, "OPENAI_IMAGE_FAILED");
  const call = body.output?.find((item) => item.type === "image_generation_call" && item.result);
  if (!call?.result) throw new OpenAIAnalysisError("OpenAI 응답에 이미지가 없습니다.", 502, "OPENAI_IMAGE_EMPTY");
  return { base64: call.result, model: `${getModel()} · image_generation${imageModel ? ` (${imageModel})` : ""}`, revisedPrompt: call.revised_prompt };
}

/** 이미지 1장. 서버 오류·연결 실패는 1회만 다시 시도한다(요청 한도·거절·입력 오류는 재시도하지 않음). */
export async function generateImage(request: ImageRequest) {
  const { width, height } = IMAGE_SIZES[request.aspect];
  if (!validImageSize(width, height)) throw new OpenAIAnalysisError("지원하지 않는 이미지 크기입니다.", 400, "IMAGE_SIZE_UNSUPPORTED");
  const prompt = composeImagePrompt(request);
  const size = `${width}x${height}`;
  try {
    return { ...(await requestOnce(prompt, size, 180_000)), prompt, size, retried: false };
  } catch (error) {
    const retryable = error instanceof OpenAIAnalysisError && (error.status === 502 || error.code === "OPENAI_NETWORK_ERROR");
    if (!retryable) throw error;
    return { ...(await requestOnce(prompt, size, 180_000)), prompt, size, retried: true };
  }
}
