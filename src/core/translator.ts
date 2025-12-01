/**
 * AI Translator
 * OpenAI를 사용한 자동 번역 기능
 */

import OpenAI from "openai";
import type { I18nConfig, LanguageInfo } from "../config/types.js";
import { DEFAULT_LANGUAGES } from "../config/types.js";
import {
  pMap,
  delay,
  retry,
  containsKorean,
  formatDuration,
  estimateCost,
  estimateTokens,
} from "../utils/index.js";
import type { JsonObject, JsonValue } from "../utils/index.js";

/**
 * 번역 결과 타입
 */
export interface TranslationResult {
  success: boolean;
  translatedCount: number;
  skippedCount: number;
  failedCount: number;
  duration: number;
  estimatedCost: number;
}

/**
 * 번역 진행 콜백
 */
export type TranslationProgressCallback = (
  current: number,
  total: number,
  text?: string,
) => void;

/**
 * Translator 클래스
 */
export class Translator {
  private config: I18nConfig;
  private client: OpenAI;
  private languageInfo: Record<string, LanguageInfo>;

  constructor(config: I18nConfig) {
    this.config = config;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is not set.\n" +
          "Please add OPENAI_API_KEY to .env file.",
      );
    }

    this.client = new OpenAI({ apiKey });

    // 기본 언어 정보와 커스텀 언어 정보 병합
    this.languageInfo = {
      ...DEFAULT_LANGUAGES,
      ...config.customLanguages,
    };
  }

  /**
   * 모델명
   */
  get model(): string {
    return this.config.openai?.model ?? "gpt-4o-mini";
  }

  /**
   * 온도 설정
   */
  get temperature(): number {
    return this.config.openai?.temperature ?? 0.3;
  }

  /**
   * 분당 요청 수 제한
   */
  get rpmLimit(): number {
    return this.config.openai?.rpmLimit ?? 800;
  }

  /**
   * 동시 처리 수
   */
  get concurrency(): number {
    return this.config.openai?.concurrency ?? 10;
  }

  /**
   * 요청 간 딜레이 (ms)
   */
  get delayBetweenRequests(): number {
    return Math.ceil(60000 / this.rpmLimit);
  }

  /**
   * 시스템 프롬프트 생성
   */
  getSystemPrompt(targetLanguage: string): string {
    const langInfo = this.languageInfo[targetLanguage];
    const langName = langInfo?.nativeName || langInfo?.name || targetLanguage;

    let prompt = `You are a professional translator specializing in B2B SaaS marketing content.

Your task:
- Translate the given Korean text to ${langName}
- Maintain the marketing tone and persuasive language
- Keep technical terms consistent (e.g., brand names, "AI", "B2B", "SaaS")
- Preserve placeholders like {variable}, \\n (newlines), and HTML/markdown formatting
- Ensure the translation sounds natural to native speakers
- For very short text or single words, provide the most appropriate translation in context

Important:
- Return ONLY the translated text, without any explanations or additional comments
- If the text contains special characters or formatting, preserve them exactly
- Do not translate brand names, product names, or technical acronyms`;

    // 커스텀 시스템 프롬프트 추가
    if (this.config.openai?.systemPrompt) {
      prompt += `\n\nAdditional context:\n${this.config.openai.systemPrompt}`;
    }

    return prompt;
  }

  /**
   * 사용자 프롬프트 생성
   */
  getUserPrompt(text: string, sourceLanguage: string): string {
    const langInfo = this.languageInfo[sourceLanguage];
    const langName = langInfo?.name || sourceLanguage;
    return `Translate the following ${langName} text:\n\n${text}`;
  }

  /**
   * 단일 텍스트 번역
   */
  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<string> {
    const sourceLang = sourceLanguage ?? this.config.sourceLanguage ?? "ko";

    // 빈 텍스트는 그대로 반환
    if (!text || text.trim() === "") {
      return text;
    }

    // 이미 번역된 텍스트는 건너뛰기 (한국어가 아닌 경우)
    if (sourceLang === "ko" && !containsKorean(text)) {
      return text;
    }

    const result = await retry(
      async () => {
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: this.temperature,
          max_tokens: 2000,
          messages: [
            {
              role: "system",
              content: this.getSystemPrompt(targetLanguage),
            },
            {
              role: "user",
              content: this.getUserPrompt(text, sourceLang),
            },
          ],
        });

        return response.choices[0]?.message?.content?.trim() ?? text;
      },
      {
        maxRetries: 3,
        retryDelay: 2000,
        backoffMultiplier: 2,
      },
    );

    return result;
  }

  /**
   * JSON 객체의 모든 문자열 번역
   */
  async translateJson(
    source: JsonObject,
    targetLanguage: string,
    onProgress?: TranslationProgressCallback,
  ): Promise<TranslationResult> {
    const startTime = Date.now();
    const sourceLanguage = this.config.sourceLanguage ?? "ko";

    // 번역이 필요한 문자열 수집
    const stringsToTranslate: Array<{ path: string; text: string }> = [];
    this.collectStrings(source, "", stringsToTranslate, sourceLanguage);

    const total = stringsToTranslate.length;
    let translatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // 병렬 번역 처리
    await pMap(
      stringsToTranslate,
      async ({ path, text }, index) => {
        try {
          // 레이트 리밋 적용
          if (index > 0 && index % this.concurrency === 0) {
            await delay(this.delayBetweenRequests * this.concurrency);
          }

          const translated = await this.translateText(
            text,
            targetLanguage,
            sourceLanguage,
          );

          // 번역 결과를 소스 객체에 적용
          this.setValueByPath(source, path, translated);

          // 토큰 추정
          totalInputTokens += estimateTokens(text);
          totalOutputTokens += estimateTokens(translated);

          if (translated === text) {
            skippedCount++;
          } else {
            translatedCount++;
          }

          onProgress?.(index + 1, total, text.substring(0, 30));
        } catch (error) {
          console.error(`Failed to translate: ${path}`, error);
          failedCount++;
        }
      },
      { concurrency: this.concurrency },
    );

    const duration = Date.now() - startTime;

    return {
      success: failedCount === 0,
      translatedCount,
      skippedCount,
      failedCount,
      duration,
      estimatedCost: estimateCost(totalInputTokens, totalOutputTokens),
    };
  }

  /**
   * 번역이 필요한 문자열 수집
   */
  private collectStrings(
    obj: JsonValue,
    path: string,
    result: Array<{ path: string; text: string }>,
    sourceLanguage: string,
  ): void {
    if (typeof obj === "string") {
      // 소스 언어가 한국어인 경우, 한국어가 포함된 텍스트만 번역
      if (sourceLanguage === "ko") {
        if (containsKorean(obj)) {
          result.push({ path, text: obj });
        }
      } else {
        result.push({ path, text: obj });
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.collectStrings(item, `${path}[${index}]`, result, sourceLanguage);
      });
      return;
    }

    if (obj !== null && typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = path ? `${path}.${key}` : key;
        this.collectStrings(value, newPath, result, sourceLanguage);
      }
    }
  }

  /**
   * 경로를 통해 객체에 값 설정
   */
  private setValueByPath(obj: JsonObject, path: string, value: string): void {
    const parts = path.match(/[^.\[\]]+|\[\d+\]/g) || [];
    let current: JsonValue = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const isArrayIndex = part.startsWith("[");
      const key = isArrayIndex ? parseInt(part.slice(1, -1)) : part;

      if (Array.isArray(current)) {
        current = current[key as number];
      } else if (typeof current === "object" && current !== null) {
        current = (current as JsonObject)[key as string];
      }
    }

    const lastPart = parts[parts.length - 1];
    const isArrayIndex = lastPart.startsWith("[");
    const key = isArrayIndex ? parseInt(lastPart.slice(1, -1)) : lastPart;

    if (Array.isArray(current)) {
      current[key as number] = value;
    } else if (typeof current === "object" && current !== null) {
      (current as JsonObject)[key as string] = value;
    }
  }

  /**
   * 번역 결과 요약 출력
   */
  printSummary(result: TranslationResult): void {
    console.log("\n📊 Translation Summary:");
    console.log(`   Translated: ${result.translatedCount}`);
    console.log(`   Skipped: ${result.skippedCount}`);
    console.log(`   Failed: ${result.failedCount}`);
    console.log(`   Duration: ${formatDuration(result.duration)}`);
    console.log(`   Estimated Cost: $${result.estimatedCost.toFixed(4)}`);
  }
}

