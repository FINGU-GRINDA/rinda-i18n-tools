/**
 * pull command
 * Google Sheets에서 번역 데이터 다운로드
 */

import chalk from "chalk";
import { loadConfigWithContext, getSheetName } from "../config/loader.js";
import { CsvManager, type LocalTranslationRow } from "../core/csv.js";
import { GoogleSheetsClient } from "../core/google-sheets.js";
import { getCurrentTimestamp } from "../utils/index.js";

interface PullOptions {
  app?: string;
  merge?: boolean;
  dryRun?: boolean;
  sheetId?: string;
}

export async function pullCommand(options: PullOptions): Promise<void> {
  try {
    console.log(chalk.blue("📥 Downloading translations from Google Sheets..."));

    if (options.dryRun) {
      console.log(chalk.yellow("   (Dry run - no files will be modified)"));
    }

    const { config, projectRoot } = await loadConfigWithContext();

    // Sheet ID 오버라이드
    if (options.sheetId) {
      process.env.GOOGLE_SHEET_ID = options.sheetId;
    }

    const sheetName = getSheetName(config, options.app);
    const sheetsClient = new GoogleSheetsClient(config, sheetName);
    const csvManager = new CsvManager(config, projectRoot, options.app);

    // Google Sheets 데이터 읽기
    const sheetRows = await sheetsClient.readData();

    if (sheetRows.length === 0) {
      console.log(chalk.yellow("ℹ️  No data found in Google Sheets."));
      return;
    }

    // 로컬 CSV 읽기
    const localRows = csvManager.readAllLocalCSVs();

    // 충돌 감지
    const conflicts: Array<{
      filename: string;
      key: string;
    }> = [];

    const localRowMap = new Map<string, Record<string, string>>();
    for (const [filename, rows] of localRows.entries()) {
      for (const row of rows) {
        const key = `${filename}:${row.key}`;
        const values: Record<string, string> = {};
        for (const lang of csvManager.languages) {
          values[lang] = row[lang] || "";
        }
        localRowMap.set(key, values);
      }
    }

    for (const sheetRow of sheetRows) {
      const key = `${sheetRow.filename}:${sheetRow.key}`;
      const localValues = localRowMap.get(key);

      if (localValues) {
        const hasConflict = csvManager.languages.some((lang) => {
          const localValue = (localValues[lang] || "").trim();
          const sheetValue = ((sheetRow[lang] as string) || "").trim();
          return (
            localValue !== sheetValue &&
            localValue !== "" &&
            sheetValue !== ""
          );
        });

        if (hasConflict) {
          conflicts.push({
            filename: sheetRow.filename,
            key: sheetRow.key,
          });
        }
      }
    }

    // 충돌 표시
    if (conflicts.length > 0) {
      console.log("");
      console.log(
        chalk.yellow(`⚠️  ${conflicts.length} conflict(s) detected (will be overwritten with sheet content):`),
      );
      conflicts.slice(0, 5).forEach((conflict) => {
        console.log(`   - ${conflict.filename}.${conflict.key}`);
      });
      if (conflicts.length > 5) {
        console.log(`   ... and ${conflicts.length - 5} more`);
      }
      console.log("");
    }

    // Google Sheets 데이터를 로컬 형식으로 변환
    const sheetRowsAsLocal = csvManager.convertSheetRowsToLocal(sheetRows);

    // 파일 업데이트
    let changedFiles = 0;

    for (const [filename, rows] of sheetRowsAsLocal.entries()) {
      const localFileRows = localRows.get(filename) || [];

      if (hasFileChanged(localFileRows, rows, csvManager.languages)) {
        if (!options.dryRun) {
          csvManager.writeCSV(filename, rows);
        }
        console.log(chalk.green(`✅ ${filename}.csv updated`));
        changedFiles++;
      }
    }

    // --merge 옵션: 로컬에만 있는 항목 유지
    if (options.merge) {
      for (const [filename, localFileRows] of localRows.entries()) {
        const sheetFileRows = sheetRowsAsLocal.get(filename) || [];
        const sheetKeys = new Set(sheetFileRows.map((r) => r.key));

        const localOnlyRows = localFileRows.filter((r) => !sheetKeys.has(r.key));

        if (localOnlyRows.length > 0) {
          const mergedRows = [...sheetFileRows, ...localOnlyRows];

          if (hasFileChanged(localFileRows, mergedRows, csvManager.languages)) {
            if (!options.dryRun) {
              csvManager.writeCSV(filename, mergedRows);
            }
            console.log(
              chalk.green(`✅ ${filename}.csv updated (preserved ${localOnlyRows.length} local-only item(s))`),
            );
            changedFiles++;
          }
        }
      }
    }

    if (changedFiles === 0) {
      console.log(chalk.green("✅ No changes detected. All files are up to date."));
    }

    // 메타데이터 업데이트
    if (!options.dryRun) {
      try {
        const metadata = csvManager.readSyncMetadata();
        csvManager.writeSyncMetadata({
          ...metadata,
          lastPullTime: getCurrentTimestamp(),
          lastLocalHash: csvManager.calculateLocalHash(),
          lastSheetRowCount: sheetRows.length,
        });
      } catch (error) {
        console.warn(
          chalk.yellow("⚠️  Warning: Failed to update sync metadata"),
        );
      }
    }

    console.log("");
    console.log(chalk.green(`✅ Pull completed. Total items in sheet: ${sheetRows.length}`));

    if (options.dryRun) {
      console.log(chalk.yellow("   (Dry run - no files were modified)"));
    }
  } catch (error) {
    console.error(
      chalk.red("❌ Pull failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

/**
 * 파일 내용이 변경되었는지 확인
 */
function hasFileChanged(
  localRows: LocalTranslationRow[],
  newRows: LocalTranslationRow[],
  languages: string[],
): boolean {
  if (localRows.length !== newRows.length) {
    return true;
  }

  const localMap = new Map(localRows.map((r) => [r.key, r]));
  const newMap = new Map(newRows.map((r) => [r.key, r]));

  if (localMap.size !== newMap.size) {
    return true;
  }

  for (const [key, localRow] of localMap.entries()) {
    const newRow = newMap.get(key);
    if (!newRow) {
      return true;
    }

    for (const lang of languages) {
      const localValue = (localRow[lang] || "").trim();
      const newValue = (newRow[lang] || "").trim();
      if (localValue !== newValue) {
        return true;
      }
    }
  }

  return false;
}

