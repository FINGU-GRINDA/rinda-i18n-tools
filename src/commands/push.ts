/**
 * push command
 * Google Sheets로 번역 데이터 업로드
 */

import chalk from "chalk";
import { loadConfigWithContext, getSheetName } from "../config/loader.js";
import { CsvManager, type TranslationRow } from "../core/csv.js";
import { GoogleSheetsClient } from "../core/google-sheets.js";
import { getCurrentTimestamp } from "../utils/index.js";

interface PushOptions {
  app?: string;
  force?: boolean;
  sheetId?: string;
}

export async function pushCommand(options: PushOptions): Promise<void> {
  try {
    console.log(chalk.blue("📤 Uploading translations to Google Sheets..."));

    const { config, projectRoot } = await loadConfigWithContext();

    // Sheet ID 오버라이드
    if (options.sheetId) {
      process.env.GOOGLE_SHEET_ID = options.sheetId;
    }

    // 모노레포 여부 확인
    const isMonorepo = config.apps && Object.keys(config.apps).length > 0;

    const sheetName = getSheetName(config, options.app, isMonorepo);
    const sheetsClient = new GoogleSheetsClient(config, sheetName);
    const csvManager = new CsvManager(config, projectRoot, options.app);

    // 로컬 CSV 읽기
    const localRows = csvManager.readAllLocalCSVs();
    const localSheetRows = csvManager.convertLocalToSheetRows(localRows);

    // Google Sheets 데이터 읽기
    const sheetRows = await sheetsClient.readData();

    // 시트 행 맵 생성
    const sheetRowMap = new Map<string, TranslationRow>();
    for (const row of sheetRows) {
      const key = `${row.filename}:${row.key}`;
      sheetRowMap.set(key, row);
    }

    // 업로드할 데이터 준비
    const rowsToUpload: TranslationRow[] = [];
    const newKeys = new Set<string>();
    const updatedKeys = new Set<string>();
    const languages = csvManager.languages;

    if (options.force) {
      // Force 모드: 로컬 데이터로 덮어쓰기
      console.log(chalk.yellow("   Force mode: Local data will overwrite sheet"));

      for (const localRow of localSheetRows) {
        const key = `${localRow.filename}:${localRow.key}`;
        const sheetRow = sheetRowMap.get(key);

        if (!sheetRow) {
          newKeys.add(key);
        } else {
          const hasChange = languages.some((lang) => {
            const localValue = ((localRow[lang] as string) || "").trim();
            const sheetValue = ((sheetRow[lang] as string) || "").trim();
            return localValue !== sheetValue;
          });
          if (hasChange) {
            updatedKeys.add(key);
          }
        }

        rowsToUpload.push({
          ...localRow,
          lastModified: getCurrentTimestamp(),
        });
      }

      // 시트에만 있는 항목도 포함
      for (const sheetRow of sheetRows) {
        const key = `${sheetRow.filename}:${sheetRow.key}`;
        const hasLocal = localSheetRows.some(
          (r) => `${r.filename}:${r.key}` === key,
        );
        if (!hasLocal) {
          rowsToUpload.push(sheetRow);
        }
      }
    } else {
      // 기본 모드: Sheet-first 규칙 - 새 항목만 추가
      const uploadedKeys = new Set<string>();

      // 시트 데이터 우선
      for (const sheetRow of sheetRows) {
        const key = `${sheetRow.filename}:${sheetRow.key}`;
        uploadedKeys.add(key);
        rowsToUpload.push(sheetRow);
      }

      // 로컬에만 있는 항목 추가
      for (const localRow of localSheetRows) {
        const key = `${localRow.filename}:${localRow.key}`;
        if (!uploadedKeys.has(key)) {
          newKeys.add(key);
          rowsToUpload.push({
            ...localRow,
            lastModified: getCurrentTimestamp(),
          });
        }
      }
    }

    // Google Sheets에 업로드
    await sheetsClient.writeData(rowsToUpload);

    // 메타데이터 업데이트
    try {
      const metadata = csvManager.readSyncMetadata();
      csvManager.writeSyncMetadata({
        ...metadata,
        lastPushTime: getCurrentTimestamp(),
        lastLocalHash: csvManager.calculateLocalHash(),
        lastSheetRowCount: rowsToUpload.length,
      });
    } catch {
      console.warn(
        chalk.yellow("⚠️  Warning: Failed to update sync metadata"),
      );
    }

    // 결과 출력
    if (newKeys.size === 0 && updatedKeys.size === 0) {
      console.log(
        chalk.green(`✅ No changes detected. Sheet is up to date. (${rowsToUpload.length} total items)`),
      );
    } else {
      if (newKeys.size > 0) {
        console.log(chalk.green(`✅ Added ${newKeys.size} new translation(s)`));
      }
      if (updatedKeys.size > 0) {
        console.log(chalk.green(`✅ Updated ${updatedKeys.size} translation(s)`));
      }
      console.log(`   Total: ${rowsToUpload.length} items in sheet`);
    }
  } catch (error) {
    console.error(
      chalk.red("❌ Push failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

