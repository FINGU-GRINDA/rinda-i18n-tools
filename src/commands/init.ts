/**
 * init command
 * 설정 파일 템플릿 생성
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const configPath = join(process.cwd(), "i18n.config.ts");

  if (existsSync(configPath) && !options.force) {
    console.log(chalk.yellow("⚠️  i18n.config.ts already exists."));
    console.log("   Use --force to overwrite.");
    return;
  }

  try {
    // 템플릿 파일 경로 찾기
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const templatePath = join(__dirname, "../../templates/i18n.config.ts");

    if (existsSync(templatePath)) {
      copyFileSync(templatePath, configPath);
    } else {
      // 템플릿 파일이 없는 경우 기본 내용으로 생성
      const defaultConfig = `/**
 * i18n Configuration
 * Customize this file for your project
 */

import { defineConfig } from "rinda-i18n-tools";

export default defineConfig({
  // 로케일 파일 경로
  localePath: "src/i18n/locales",

  // 지원 언어
  languages: ["ko", "en"],

  // 소스 언어
  sourceLanguage: "ko",

  // CSV 파일 디렉토리
  csvDir: "locales",

  // JSON 출력 디렉토리
  outputDir: "src/i18n/generated",

  // Google Sheets 설정
  googleSheets: {
    sheetName: "translations",
  },

  // OpenAI 설정
  openai: {
    model: "gpt-4o-mini",
    temperature: 0.3,
  },

  // i18next-scanner 설정
  scanner: {
    input: ["src/**/*.{ts,tsx,js,jsx}"],
  },
});
`;
      writeFileSync(configPath, defaultConfig, "utf-8");
    }

    console.log(chalk.green("✅ Created i18n.config.ts"));
    console.log("");
    console.log("Next steps:");
    console.log("  1. Edit i18n.config.ts to match your project structure");
    console.log("  2. Set environment variables in .env:");
    console.log("     - OPENAI_API_KEY (for AI translation)");
    console.log("     - GOOGLE_SHEET_ID (for Google Sheets sync)");
    console.log("     - GOOGLE_CREDENTIALS (for Google Sheets auth)");
    console.log("");
    console.log("Available commands:");
    console.log("  i18n build      - Build JSON from CSV");
    console.log("  i18n translate  - AI translation");
    console.log("  i18n push       - Upload to Google Sheets");
    console.log("  i18n pull       - Download from Google Sheets");
  } catch (error) {
    console.error(
      chalk.red("❌ Failed to create config:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

