/**
 * check command
 * 로컬과 Google Sheets 간 동기화 상태 확인
 */

import chalk from "chalk";
import { loadConfigWithContext, getSheetName } from "../config/loader.js";
import { CsvManager } from "../core/csv.js";
import { GoogleSheetsClient } from "../core/google-sheets.js";

interface CheckOptions {
  app?: string;
  sheetId?: string;
}

export async function checkCommand(options: CheckOptions): Promise<void> {
  try {
    console.log(chalk.blue("🔍 Checking sync status..."));

    const { config, projectRoot } = await loadConfigWithContext();

    // Sheet ID 오버라이드
    if (options.sheetId) {
      process.env.GOOGLE_SHEET_ID = options.sheetId;
    }

    const csvManager = new CsvManager(config, projectRoot);
    const metadata = csvManager.readSyncMetadata();

    // 로컬 상태
    const localHash = csvManager.calculateLocalHash();
    const localRows = csvManager.readAllLocalCSVs();
    let localRowCount = 0;
    for (const rows of localRows.values()) {
      localRowCount += rows.length;
    }

    console.log("");
    console.log(chalk.bold("📊 Local Status:"));
    console.log(`   Files: ${csvManager.getCsvFiles().length}`);
    console.log(`   Total keys: ${localRowCount}`);
    console.log(`   Hash: ${localHash.substring(0, 8)}...`);

    // 메타데이터 정보
    if (metadata.lastPushTime || metadata.lastPullTime) {
      console.log("");
      console.log(chalk.bold("📅 Last Sync:"));
      if (metadata.lastPushTime) {
        console.log(`   Push: ${new Date(metadata.lastPushTime).toLocaleString()}`);
      }
      if (metadata.lastPullTime) {
        console.log(`   Pull: ${new Date(metadata.lastPullTime).toLocaleString()}`);
      }
    }

    // Google Sheets 상태 확인 (환경변수가 설정된 경우만)
    const hasGoogleConfig =
      process.env.GOOGLE_CREDENTIALS && process.env.GOOGLE_SHEET_ID;

    if (hasGoogleConfig) {
      try {
        const sheetName = getSheetName(config, options.app);
        const sheetsClient = new GoogleSheetsClient(config, sheetName);

        const sheetRowCount = await sheetsClient.getRowCount();
        const lastModified = await sheetsClient.getLastModified();

        console.log("");
        console.log(chalk.bold("☁️  Google Sheets Status:"));
        console.log(`   Sheet: ${sheetName}`);
        console.log(`   Total keys: ${sheetRowCount}`);
        if (lastModified) {
          console.log(`   Last modified: ${new Date(lastModified).toLocaleString()}`);
        }

        // 동기화 상태 판단
        console.log("");
        console.log(chalk.bold("🔄 Sync Status:"));

        const hashChanged = metadata.lastLocalHash !== localHash;
        const countMismatch = metadata.lastSheetRowCount !== sheetRowCount;

        if (!hashChanged && !countMismatch) {
          console.log(chalk.green("   ✅ In sync"));
        } else {
          if (hashChanged) {
            console.log(chalk.yellow("   ⚠️  Local changes detected since last sync"));
          }
          if (countMismatch) {
            const diff = sheetRowCount - localRowCount;
            if (diff > 0) {
              console.log(
                chalk.yellow(`   ⚠️  Sheet has ${diff} more key(s) than local`),
              );
              console.log(chalk.gray("      Run 'i18n pull' to sync"));
            } else {
              console.log(
                chalk.yellow(`   ⚠️  Local has ${-diff} more key(s) than sheet`),
              );
              console.log(chalk.gray("      Run 'i18n push' to sync"));
            }
          }
        }
      } catch (error) {
        console.log("");
        console.log(chalk.yellow("☁️  Google Sheets: Unable to connect"));
        console.log(
          chalk.gray(`      ${error instanceof Error ? error.message : error}`),
        );
      }
    } else {
      console.log("");
      console.log(chalk.gray("☁️  Google Sheets: Not configured"));
      console.log(chalk.gray("   Set GOOGLE_CREDENTIALS and GOOGLE_SHEET_ID in .env"));
    }
  } catch (error) {
    console.error(
      chalk.red("❌ Check failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

