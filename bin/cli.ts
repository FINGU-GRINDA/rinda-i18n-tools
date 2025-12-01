#!/usr/bin/env node
/**
 * Rinda i18n Tools CLI
 * Universal i18n management for Rinda projects
 */

import "dotenv/config";
import { Command } from "commander";
import { scanCommand } from "../src/commands/scan.js";
import { buildCommand } from "../src/commands/build.js";
import { exportCommand } from "../src/commands/export.js";
import { translateCommand } from "../src/commands/translate.js";
import { pushCommand } from "../src/commands/push.js";
import { pullCommand } from "../src/commands/pull.js";
import { checkCommand } from "../src/commands/check.js";
import { watchCommand } from "../src/commands/watch.js";
import { initCommand } from "../src/commands/init.js";

const program = new Command();

program
  .name("i18n")
  .description("Universal i18n tools for Rinda projects")
  .version("1.0.0");

// init - 설정 파일 생성
program
  .command("init")
  .description("Initialize i18n config file in current project")
  .option("-f, --force", "Overwrite existing config file")
  .action(initCommand);

// scan - 코드에서 번역 키 스캔
program
  .command("scan")
  .description("Scan source code for translation keys (requires i18next-scanner)")
  .option("-a, --app <name>", "App name for monorepo")
  .option("-m, --merge", "Merge scanned keys to CSV files")
  .action(scanCommand);

// build - CSV → JSON 변환
program
  .command("build")
  .description("Build JSON locale files from CSV")
  .option("-a, --app <name>", "App name for monorepo")
  .action(buildCommand);

// export - JSON → CSV 변환
program
  .command("export")
  .description("Export JSON locale files to CSV")
  .option("-a, --app <name>", "App name for monorepo")
  .action(exportCommand);

// translate - AI 번역
program
  .command("translate")
  .description("Translate locale files using OpenAI")
  .requiredOption("-t, --target <locale>", "Target language code (e.g., en, ja, zh-CN)")
  .option("-a, --app <name>", "App name for monorepo")
  .option("-f, --force", "Force overwrite existing translations")
  .option("-d, --dry-run", "Preview without making changes")
  .action(translateCommand);

// push - Google Sheets로 업로드
program
  .command("push")
  .description("Push translations to Google Sheets")
  .option("-a, --app <name>", "App name for monorepo")
  .option("-f, --force", "Force overwrite sheet data")
  .option("--sheet-id <id>", "Override Google Sheet ID")
  .action(pushCommand);

// pull - Google Sheets에서 다운로드
program
  .command("pull")
  .description("Pull translations from Google Sheets")
  .option("-a, --app <name>", "App name for monorepo")
  .option("-m, --merge", "Merge with local-only keys")
  .option("-d, --dry-run", "Preview without making changes")
  .option("--sheet-id <id>", "Override Google Sheet ID")
  .action(pullCommand);

// check - 동기화 상태 확인
program
  .command("check")
  .description("Check sync status between local and Google Sheets")
  .option("-a, --app <name>", "App name for monorepo")
  .option("--sheet-id <id>", "Override Google Sheet ID")
  .action(checkCommand);

// watch - 파일 변경 감지
program
  .command("watch")
  .description("Watch for file changes and auto-build")
  .option("-a, --app <name>", "App name for monorepo")
  .option("--csv", "Watch CSV files only")
  .option("--source", "Watch source files only (for scan)")
  .action(watchCommand);

program.parse();

