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
  target: string;
  app?: string;
  force?: boolean;
  dryRun?: boolean;
}

export async function translateCommand(options: TranslateOptions): Promise<void> {
  const spinner = ora();

  try {
    console.log(chalk.blue(`🌐 Translating to ${options.target}...`));

    if (options.dryRun) {
      console.log(chalk.yellow("   (Dry run - no files will be modified)"));
    }

    const { config, projectRoot } = await loadConfigWithContext();

    // 타겟 언어 검증
    const languages = config.languages ?? ["ko", "en"];
    if (!languages.includes(options.target)) {
      console.log(
        chalk.yellow(`⚠️  Target language "${options.target}" is not in configured languages.`),
      );
      console.log(`   Configured languages: ${languages.join(", ")}`);
    }

    const translator = new Translator(config);

    // 로케일 경로
    const localePath = join(
      projectRoot,
      getLocalePathForApp(config, options.app),
    );
    const sourceLanguage = config.sourceLanguage ?? "ko";
    const sourceDir = join(localePath, sourceLanguage);
    const targetDir = join(localePath, options.target);

    if (!existsSync(sourceDir)) {
      throw new Error(`Source locale directory not found: ${sourceDir}`);
    }

    // 타겟 디렉토리 생성
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // JSON 파일 목록
    const jsonFiles = readdirSync(sourceDir).filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log(chalk.yellow("⚠️  No JSON files found in source directory."));
      return;
    }

    console.log(`   Found ${jsonFiles.length} file(s) to translate`);
    console.log(`   Source: ${sourceDir}`);
    console.log(`   Target: ${targetDir}`);
    console.log("");

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
      // force 모드가 아니면 기존 타겟의 내용을 병합
      const contentToTranslate = options.force
        ? { ...sourceContent }
        : mergeForTranslation(sourceContent, targetContent);

      const result = await translator.translateJson(
        contentToTranslate,
        options.target,
        (current, total, text) => {
          spinner.text = `Translating ${jsonFile}... (${current}/${total}) ${text ? `"${text}..."` : ""}`;
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

    console.log("");
    console.log(chalk.green("✅ Translation completed!"));
    console.log("");
    console.log(chalk.bold("📊 Summary:"));
    console.log(`   Translated: ${totalTranslated}`);
    console.log(`   Skipped: ${totalSkipped}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Estimated Cost: $${totalCost.toFixed(4)}`);

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
 * - 타겟에 이미 번역이 있으면 유지
 * - 소스에만 있는 키는 번역 필요
 */
function mergeForTranslation(
  source: JsonObject,
  target: JsonObject,
): JsonObject {
  const result: JsonObject = {};

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = target[key];

    if (typeof sourceValue === "string") {
      // 타겟에 값이 있고 한국어가 아니면 유지
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
      // 중첩 객체는 재귀 처리
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

