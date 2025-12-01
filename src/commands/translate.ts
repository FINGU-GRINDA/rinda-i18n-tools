/**
 * translate command
 * OpenAI를 사용한 AI 번역
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import ora from "ora";
import { loadConfigWithContext, getLocalePathForApp } from "../config/loader.js";
import { Translator } from "../core/translator.js";
import type { JsonObject } from "../utils/index.js";

interface TranslateOptions {
  target?: string;
  app?: string;
  force?: boolean;
  dryRun?: boolean;
  all?: boolean;
  yes?: boolean;
}

export async function translateCommand(options: TranslateOptions): Promise<void> {
  const spinner = ora();

  try {
    const { config, projectRoot } = await loadConfigWithContext();
    const languages = config.languages ?? ["ko", "en"];
    const sourceLanguage = config.sourceLanguage ?? "ko";

    // 번역할 타겟 언어 목록 결정
    let targetLanguages: string[];

    if (options.all) {
      // --all: 소스 언어를 제외한 모든 언어
      targetLanguages = languages.filter((lang) => lang !== sourceLanguage);
      console.log(chalk.blue(`🌐 Translating to all languages: ${targetLanguages.join(", ")}`));
    } else if (options.target) {
      targetLanguages = [options.target];
      console.log(chalk.blue(`🌐 Translating to ${options.target}...`));
    } else {
      throw new Error(
        "Target language is required.\n" +
        "Use --target <lang> for single language or --all for all languages.\n" +
        "Example: pnpm i18n:translate -- --target ja\n" +
        "Example: pnpm i18n:translate -- --all"
      );
    }

    if (options.dryRun) {
      console.log(chalk.yellow("   (Dry run - no files will be modified)"));
    }

    // 타겟 언어 검증
    for (const target of targetLanguages) {
      if (!languages.includes(target)) {
        console.log(
          chalk.yellow(`⚠️  Target language "${target}" is not in configured languages.`),
        );
        console.log(`   Configured languages: ${languages.join(", ")}`);
      }
    }

    // 로케일 경로
    const localePath = join(
      projectRoot,
      getLocalePathForApp(config, options.app),
    );
    const sourceDir = join(localePath, sourceLanguage);

    if (!existsSync(sourceDir)) {
      throw new Error(`Source locale directory not found: ${sourceDir}`);
    }

    // JSON 파일 목록
    const jsonFiles = readdirSync(sourceDir).filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log(chalk.yellow("⚠️  No JSON files found in source directory."));
      return;
    }

    // 예상 비용 계산
    let totalStrings = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const SYSTEM_PROMPT_TOKENS = 200; // 시스템 프롬프트 약 200 토큰

    for (const jsonFile of jsonFiles) {
      const sourcePath = join(sourceDir, jsonFile);
      const sourceContent = JSON.parse(readFileSync(sourcePath, "utf-8"));
      const strings = collectStrings(sourceContent);
      totalStrings += strings.length;

      for (const text of strings) {
        // 각 문자열에 대한 토큰 계산
        const inputTokens = SYSTEM_PROMPT_TOKENS + estimateTokens(text) + 20; // 20은 프롬프트 템플릿 토큰
        const outputTokens = estimateTokens(text) * 1.2; // 출력은 입력보다 약간 길 수 있음

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
      }
    }

    // 각 언어에 대해 번역하므로 언어 수만큼 곱함
    totalInputTokens *= targetLanguages.length;
    totalOutputTokens *= targetLanguages.length;

    const estimatedTotalCost = estimateCost(totalInputTokens, totalOutputTokens);
    const estimatedKRW = Math.ceil(estimatedTotalCost * 1400);

    console.log("");
    console.log(chalk.bold("💰 Cost Estimation:"));
    console.log("");
    console.log(chalk.white("   Translation Summary:"));
    console.log(chalk.gray(`     Source: ${sourceDir}`));
    console.log(chalk.gray(`     Files to process: ${jsonFiles.length}`));
    console.log(chalk.gray(`     Strings to translate: ${totalStrings}`));
    console.log(chalk.gray(`     Target languages: ${targetLanguages.length} (${targetLanguages.join(", ")})`));
    console.log(chalk.gray(`     Estimated input tokens: ${totalInputTokens.toLocaleString()}`));
    console.log(chalk.gray(`     Estimated output tokens: ${totalOutputTokens.toLocaleString()}`));
    console.log(chalk.cyan(`     Estimated cost: $${estimatedTotalCost.toFixed(4)} (approximately ₩${estimatedKRW.toLocaleString()})`));
    console.log("");
    console.log(chalk.gray("   Note: This is an estimate. Actual cost may vary slightly."));
    console.log("");

    // 비용 확인 (--yes 옵션이 없으면)
    if (!options.yes && !options.dryRun) {
      const confirmed = await promptYesNo("Proceed with translation?");
      if (!confirmed) {
        console.log(chalk.yellow("Translation cancelled."));
        return;
      }
    }

    const translator = new Translator(config);

    let grandTotalTranslated = 0;
    let grandTotalSkipped = 0;
    let grandTotalFailed = 0;
    let grandTotalCost = 0;

    // 각 타겟 언어에 대해 번역 실행
    for (const targetLang of targetLanguages) {
      console.log("");
      console.log(chalk.blue(`━━━ Translating to ${targetLang} ━━━`));

      const targetDir = join(localePath, targetLang);

      // 타겟 디렉토리 생성
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      let totalTranslated = 0;
      let totalSkipped = 0;
      let totalFailed = 0;
      let totalCost = 0;

      for (const jsonFile of jsonFiles) {
        const sourcePath = join(sourceDir, jsonFile);
        const targetPath = join(targetDir, jsonFile);

        spinner.start(`Translating ${jsonFile}...`);

        // 소스 파일 읽기
        const sourceContent = JSON.parse(
          readFileSync(sourcePath, "utf-8"),
        ) as JsonObject;

        // 기존 타겟 파일이 있으면 읽기
        let targetContent: JsonObject = {};
        if (existsSync(targetPath) && !options.force) {
          try {
            targetContent = JSON.parse(
              readFileSync(targetPath, "utf-8"),
            ) as JsonObject;
          } catch {
            // 파일 읽기 실패 시 빈 객체로 시작
          }
        }

        // 번역 실행
        const contentToTranslate = options.force
          ? { ...sourceContent }
          : mergeForTranslation(sourceContent, targetContent);

        const result = await translator.translateJson(
          contentToTranslate,
          targetLang,
          (current, total, text) => {
            spinner.text = `Translating ${jsonFile}... (${current}/${total}) ${text ? `"${text.substring(0, 20)}..."` : ""}`;
          },
        );

        totalTranslated += result.translatedCount;
        totalSkipped += result.skippedCount;
        totalFailed += result.failedCount;
        totalCost += result.estimatedCost;

        if (result.failedCount > 0) {
          spinner.warn(`${jsonFile}: ${result.translatedCount} translated, ${result.failedCount} failed`);
        } else {
          spinner.succeed(`${jsonFile}: ${result.translatedCount} translated, ${result.skippedCount} skipped`);
        }

        // 결과 저장 (dry run이 아닌 경우)
        if (!options.dryRun) {
          writeFileSync(
            targetPath,
            JSON.stringify(contentToTranslate, null, 2),
            "utf-8",
          );
        }
      }

      console.log(chalk.gray(`   → ${targetLang}: ${totalTranslated} translated, ${totalSkipped} skipped, $${totalCost.toFixed(4)}`));

      grandTotalTranslated += totalTranslated;
      grandTotalSkipped += totalSkipped;
      grandTotalFailed += totalFailed;
      grandTotalCost += totalCost;
    }

    console.log("");
    console.log(chalk.green("✅ Translation completed!"));
    console.log("");
    console.log(chalk.bold("📊 Total Summary:"));
    console.log(`   Languages: ${targetLanguages.length}`);
    console.log(`   Translated: ${grandTotalTranslated}`);
    console.log(`   Skipped: ${grandTotalSkipped}`);
    console.log(`   Failed: ${grandTotalFailed}`);
    console.log(`   Total Cost: ${chalk.yellow(`$${grandTotalCost.toFixed(4)}`)}`);

    if (options.dryRun) {
      console.log("");
      console.log(chalk.yellow("   (Dry run - no files were modified)"));
    }
  } catch (error) {
    spinner.fail();
    console.error(
      chalk.red("❌ Translation failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * 소스와 타겟을 병합하여 번역이 필요한 부분만 추출
 */
function mergeForTranslation(
  source: JsonObject,
  target: JsonObject,
): JsonObject {
  const result: JsonObject = {};

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];

    if (typeof sourceValue === "string") {
      if (
        typeof targetValue === "string" &&
        targetValue !== sourceValue &&
        !containsKorean(targetValue)
      ) {
        result[key] = targetValue;
      } else {
        result[key] = sourceValue;
      }
    } else if (
      sourceValue !== null &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      result[key] = mergeForTranslation(
        sourceValue as JsonObject,
        (typeof targetValue === "object" && targetValue !== null && !Array.isArray(targetValue)
          ? targetValue
          : {}) as JsonObject,
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * 문자열에 한국어가 포함되어 있는지 확인
 */
function containsKorean(text: string): boolean {
  const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
  return koreanRegex.test(text);
}

/**
 * JSON 객체에서 모든 문자열 수집
 */
function collectStrings(obj: unknown): string[] {
  const strings: string[] = [];

  const traverse = (value: unknown) => {
    if (typeof value === "string") {
      strings.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(traverse);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(traverse);
    }
  };

  traverse(obj);
  return strings;
}

/**
 * Yes/No 프롬프트
 */
async function promptYesNo(question: string): Promise<boolean> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(`${question} (y/n): `);
    return answer.toLowerCase().trim() === "yes" || answer.toLowerCase().trim() === "y";
  } finally {
    rl.close();
  }
}

/**
 * 대략적인 토큰 수를 추정합니다 (정확하지 않지만 근사치)
 * 영어는 단어당 약 1.3토큰, 한국어/중국어/일본어는 문자당 약 2-3토큰
 * 보수적으로 문자당 2토큰으로 추정
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 비용을 추정합니다 (gpt-4o-mini 기준)
 * 
 * gpt-4o-mini pricing (2025년 기준, Standard tier):
 * - Input: $0.15 / 1M tokens = $0.00015 / 1K tokens
 * - Output: $0.60 / 1M tokens = $0.0006 / 1K tokens
 */
function estimateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * 0.00015;
  const outputCost = (outputTokens / 1000) * 0.0006;
  return inputCost + outputCost;
}
