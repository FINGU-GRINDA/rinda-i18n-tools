/**
 * Utility functions
 */

import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";

/**
 * JSON 값 타입 정의
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonArray = JsonValue[];

/**
 * 병렬 처리를 위한 유틸리티 함수 (p-map 유사)
 */
export async function pMap<T, R>(
  iterable: T[],
  mapper: (item: T, index: number) => Promise<R>,
  options: { concurrency: number },
): Promise<R[]> {
  const results = new Array<R>(iterable.length);
  const iterator = iterable.entries();

  const worker = async (): Promise<void> => {
    for (const [index, item] of iterator) {
      results[index] = await mapper(item, index);
    }
  };

  const workers = Array.from(
    { length: Math.min(iterable.length, options.concurrency) },
    () => worker(),
  );

  await Promise.all(workers);
  return results;
}

/**
 * 디렉토리가 존재하는지 확인하고, 없으면 생성합니다.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 파일이 존재하는지 확인합니다.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON 파일을 읽어옵니다.
 */
export async function readJsonFile(filePath: string): Promise<JsonObject> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * JSON 파일을 씁니다.
 */
export async function writeJsonFile(
  filePath: string,
  data: JsonObject,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * 중첩된 객체를 평탄화하여 키 목록 추출
 * 예: { common: { welcome: "..." } } => ["common.welcome"]
 */
export function flattenKeys(
  obj: Record<string, unknown>,
  prefix = "",
): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * 중첩된 객체에 값을 설정하는 헬퍼 함수
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * 중첩된 객체에서 값을 가져오는 헬퍼 함수
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * 문자열에 한국어가 포함되어 있는지 확인합니다.
 */
export function containsKorean(text: string): boolean {
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
  return koreanRegex.test(text);
}

/**
 * 시간을 사람이 읽기 쉬운 형식으로 변환합니다.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 비용을 추정합니다 (gpt-4o-mini 기준)
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
): number {
  // gpt-4o-mini pricing (2025년 기준)
  const inputCost = (inputTokens / 1000) * 0.00015;
  const outputCost = (outputTokens / 1000) * 0.0006;
  return inputCost + outputCost;
}

/**
 * 대략적인 토큰 수를 추정합니다
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 현재 시간을 ISO 문자열로 반환
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 지연 함수
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 재시도 함수
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier?: number;
  },
): Promise<T> {
  let lastError: Error | undefined;
  let currentDelay = options.retryDelay;

  for (let i = 0; i <= options.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < options.maxRetries) {
        await delay(currentDelay);
        currentDelay *= options.backoffMultiplier ?? 2;
      }
    }
  }

  throw lastError;
}

/**
 * SHA256 해시 생성
 */
export async function calculateHash(content: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(content).digest("hex");
}

