/**
 * CSV Manager
 * CSV 파일 읽기/쓰기 및 JSON 변환 기능
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { createHash } from "node:crypto";
import type { I18nConfig } from "../config/types.js";
import { getLanguages, getCsvDir, getOutputDir } from "../config/loader.js";
import { ensureDir, setNestedValue, flattenKeys } from "../utils/index.js";

/**
 * CSV 행 타입 (로컬 파일용 - filename 없음)
 */
export interface LocalTranslationRow {
  key: string;
  [lang: string]: string;
}

/**
 * CSV 행 타입 (Google Sheets용 - filename 포함)
 */
export interface TranslationRow {
  filename: string;
  key: string;
  lastModified?: string;
  [lang: string]: string | undefined;
}

/**
 * 동기화 메타데이터 타입
 */
export interface SyncMetadata {
  lastPushTime?: string;
  lastPullTime?: string;
  lastSheetRowCount?: number;
  lastLocalHash?: string;
}

/**
 * CSV Manager 클래스
 */
export class CsvManager {
  private config: I18nConfig;
  private projectRoot: string;
  private appName?: string;

  constructor(config: I18nConfig, projectRoot: string, appName?: string) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.appName = appName;
  }

  /**
   * CSV 디렉토리 절대 경로
   * appName이 설정되어 있으면 앱별 서브폴더 경로 반환
   */
  get csvDir(): string {
    const baseCsvDir = join(this.projectRoot, getCsvDir(this.config));
    if (this.appName) {
      return join(baseCsvDir, this.appName);
    }
    return baseCsvDir;
  }

  /**
   * JSON 출력 디렉토리 절대 경로
   */
  get outputDir(): string {
    return join(this.projectRoot, getOutputDir(this.config));
  }

  /**
   * 지원 언어 목록
   */
  get languages(): string[] {
    return getLanguages(this.config);
  }

  /**
   * JSON 문자열인 경우 파싱하여 원래 형태로 복원
   * 배열이나 객체 형태의 JSON 문자열을 파싱하고, 일반 문자열은 그대로 반환
   */
  private parseJsonValue(value: string): unknown {
    // JSON 배열 또는 객체 형태인지 확인
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // 파싱 실패시 원래 문자열 반환
        return value;
      }
    }
    return value;
  }

  /**
   * CSV 파일들의 해시값 계산 (변경 감지용)
   */
  calculateLocalHash(): string {
    const csvFiles = this.getCsvFiles();

    if (csvFiles.length === 0) {
      return "";
    }

    const hash = createHash("sha256");

    for (const csvFile of csvFiles.sort()) {
      try {
        const csvPath = join(this.csvDir, csvFile);
        const content = readFileSync(csvPath, "utf-8");
        hash.update(csvFile);
        hash.update(content);
      } catch {
        hash.update(csvFile);
        hash.update("ERROR_READING_FILE");
      }
    }

    return hash.digest("hex");
  }

  /**
   * CSV 파일 목록 가져오기
   * appName이 설정되어 있으면 해당 앱 서브폴더 내의 모든 CSV 파일 반환
   */
  getCsvFiles(): string[] {
    if (!existsSync(this.csvDir)) {
      return [];
    }

    // 앱 서브폴더 또는 기본 폴더 내의 모든 CSV 파일 반환
    return readdirSync(this.csvDir).filter(
      (file: string) => file.endsWith(".csv") && !file.startsWith("."),
    );
  }

  /**
   * 모든 로컬 CSV 파일 읽기
   */
  readAllLocalCSVs(): Map<string, LocalTranslationRow[]> {
    const result = new Map<string, LocalTranslationRow[]>();
    const csvFiles = this.getCsvFiles();

    for (const csvFile of csvFiles) {
      try {
        const csvPath = join(this.csvDir, csvFile);
        const csvContent = readFileSync(csvPath, "utf-8");

        const records = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as LocalTranslationRow[];

        const filename = csvFile.replace(".csv", "");

        // 중복 키 처리
        const seenKeys = new Set<string>();
        const dedupedRecords: LocalTranslationRow[] = [];

        for (const record of records) {
          if (seenKeys.has(record.key)) {
            console.warn(
              `⚠️  Warning: Duplicate key "${record.key}" found in ${csvFile}`,
            );
          }
          seenKeys.add(record.key);

          const existingIndex = dedupedRecords.findIndex(
            (r) => r.key === record.key,
          );
          if (existingIndex >= 0) {
            dedupedRecords[existingIndex] = record;
          } else {
            dedupedRecords.push(record);
          }
        }

        result.set(filename, dedupedRecords);
      } catch (error) {
        console.error(
          `❌ Error reading ${csvFile}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    return result;
  }

  /**
   * CSV 파일 쓰기
   */
  writeCSV(filename: string, rows: LocalTranslationRow[]): void {
    ensureDir(this.csvDir);
    const csvPath = join(this.csvDir, `${filename}.csv`);

    const columns = ["key", ...this.languages];
    const csvContent = stringify(rows, {
      header: true,
      columns,
    });

    writeFileSync(csvPath, csvContent, "utf-8");
  }

  /**
   * CSV → JSON 변환 (빌드)
   * 각 CSV 파일별로 언어별 폴더에 JSON 파일 생성
   * 예: csv/index.csv, csv/shared.csv → ko/index.json, ko/shared.json, en/index.json, en/shared.json
   */
  async buildJsonFromCsv(): Promise<void> {
    const csvFiles = this.getCsvFiles();

    if (csvFiles.length === 0) {
      console.log("⚠️  No CSV files found");
      return;
    }

    // 각 CSV 파일별로 처리
    for (const csvFile of csvFiles) {
      const csvPath = join(this.csvDir, csvFile);
      const namespace = basename(csvFile, ".csv");

      const csvContent = readFileSync(csvPath, "utf-8");
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as LocalTranslationRow[];

      // 언어별 번역 객체 초기화 (이 CSV 파일에 대해서만)
      const translations: Record<string, Record<string, unknown>> = {};
      for (const lang of this.languages) {
        translations[lang] = {};
      }

      for (const record of records) {
        const key = record.key;
        if (!key) continue;

        for (const lang of this.languages) {
          const value = record[lang];
          if (value) {
            // JSON 문자열인 경우 파싱하여 원래 형태로 복원
            const parsedValue = this.parseJsonValue(value);
            setNestedValue(translations[lang], key, parsedValue);
          }
        }
      }

      // 각 언어별 폴더에 JSON 파일 저장
      for (const lang of this.languages) {
        const langDir = join(this.outputDir, lang);
        await ensureDir(langDir);

        const outputPath = join(langDir, `${namespace}.json`);
        writeFileSync(
          outputPath,
          JSON.stringify(translations[lang], null, 2),
          "utf-8",
        );
        console.log(`✅ Generated: ${outputPath}`);
      }
    }

    console.log(
      `\n🎉 Successfully converted ${csvFiles.length} CSV files to JSON!`,
    );
  }

  /**
   * JSON → CSV 변환 (내보내기)
   */
  async exportCsvFromJson(localePath: string): Promise<void> {
    const { readdirSync: readDir, readFileSync: readFile } = await import(
      "node:fs"
    );

    // 소스 언어의 JSON 파일들 읽기
    const sourceDir = join(localePath, this.config.sourceLanguage ?? "ko");

    if (!existsSync(sourceDir)) {
      throw new Error(`Source locale directory not found: ${sourceDir}`);
    }

    const jsonFiles = readDir(sourceDir).filter((f: string) => f.endsWith(".json"));

    for (const jsonFile of jsonFiles) {
      const namespace = basename(jsonFile, ".json");
      const rows: LocalTranslationRow[] = [];

      // 소스 언어 JSON 읽기
      const sourceJson = JSON.parse(
        readFile(join(sourceDir, jsonFile), "utf-8"),
      );
      const keys = flattenKeys(sourceJson);

      for (const key of keys) {
        const row: LocalTranslationRow = { key };

        // 각 언어별 값 추가
        for (const lang of this.languages) {
          const langDir = join(localePath, lang);
          const langFile = join(langDir, jsonFile);

          if (existsSync(langFile)) {
            try {
              const langJson = JSON.parse(readFile(langFile, "utf-8"));
              const keys = key.split(".");
              let value: unknown = langJson;
              for (const k of keys) {
                if (
                  value &&
                  typeof value === "object" &&
                  k in (value as Record<string, unknown>)
                ) {
                  value = (value as Record<string, unknown>)[k];
                } else {
                  value = undefined;
                  break;
                }
              }
              // 배열이나 객체는 JSON 문자열로 직렬화
              if (typeof value === "string") {
                row[lang] = value;
              } else if (value !== undefined && value !== null) {
                row[lang] = JSON.stringify(value);
              } else {
                row[lang] = "";
              }
            } catch {
              row[lang] = "";
            }
          } else {
            row[lang] = "";
          }
        }

        rows.push(row);
      }

      this.writeCSV(namespace, rows);
      console.log(`✅ Exported: ${namespace}.csv`);
    }
  }

  /**
   * 로컬 CSV를 Google Sheets 형식으로 변환
   */
  convertLocalToSheetRows(
    localRows: Map<string, LocalTranslationRow[]>,
  ): TranslationRow[] {
    const result: TranslationRow[] = [];

    for (const [filename, rows] of localRows.entries()) {
      for (const row of rows) {
        result.push({
          filename,
          ...row,
        });
      }
    }

    return result;
  }

  /**
   * Google Sheets 형식을 로컬 CSV로 변환
   */
  convertSheetRowsToLocal(
    sheetRows: TranslationRow[],
  ): Map<string, LocalTranslationRow[]> {
    const result = new Map<string, LocalTranslationRow[]>();

    for (const row of sheetRows) {
      const { filename } = row;
      if (!filename) continue;

      if (!result.has(filename)) {
        result.set(filename, []);
      }

      // Extract only key and language fields
      const localRow: LocalTranslationRow = { key: row.key };
      for (const lang of this.languages) {
        localRow[lang] = row[lang] ?? "";
      }

      const fileRows = result.get(filename);
      if (fileRows) {
        fileRows.push(localRow);
      }
    }

    return result;
  }

  /**
   * 동기화 메타데이터 읽기
   */
  readSyncMetadata(): SyncMetadata {
    const metadataPath = join(this.csvDir, ".i18n-sync.json");

    if (!existsSync(metadataPath)) {
      return {};
    }

    try {
      const content = readFileSync(metadataPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * 동기화 메타데이터 쓰기
   */
  writeSyncMetadata(metadata: SyncMetadata): void {
    ensureDir(this.csvDir);
    const metadataPath = join(this.csvDir, ".i18n-sync.json");
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  /**
   * 스캔된 키를 CSV에 병합
   */
  async mergeScannedKeys(scannedJsonPath: string): Promise<number> {
    if (!existsSync(scannedJsonPath)) {
      return 0;
    }

    const scannedData = JSON.parse(readFileSync(scannedJsonPath, "utf-8"));
    const scannedKeys = flattenKeys(scannedData);

    // 파일별로 키 그룹화
    const keysByFile: Record<string, string[]> = {};

    for (const fullKey of scannedKeys) {
      const [namespace, ...rest] = fullKey.split(".");
      if (!namespace || rest.length === 0) continue;

      const keyWithoutNamespace = rest.join(".");

      // 복수형 키 무시
      const pluralSuffixes = [
        "_other",
        "_one",
        "_zero",
        "_two",
        "_few",
        "_many",
      ];
      if (pluralSuffixes.some((suffix) => keyWithoutNamespace.endsWith(suffix))) {
        continue;
      }

      const csvFileName = `${namespace}.csv`;
      if (!keysByFile[csvFileName]) {
        keysByFile[csvFileName] = [];
      }
      keysByFile[csvFileName].push(keyWithoutNamespace);
    }

    // 각 CSV 파일별로 처리
    let totalNewKeys = 0;

    for (const [csvFileName, keysToAdd] of Object.entries(keysByFile)) {
      const csvPath = join(this.csvDir, csvFileName);
      let existingRows: LocalTranslationRow[] = [];
      let existingKeys = new Set<string>();

      if (existsSync(csvPath)) {
        const csvContent = readFileSync(csvPath, "utf-8");
        existingRows = parse(csvContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as LocalTranslationRow[];
        existingKeys = new Set(existingRows.map((row) => row.key));
      }

      // 새로운 키만 추가
      const newKeys: string[] = [];
      for (const key of keysToAdd) {
        if (!existingKeys.has(key)) {
          newKeys.push(key);
          const namespace = csvFileName.replace(".csv", "");
          const fullKey = `${namespace}.${key}`;
          const newRow: LocalTranslationRow = { key };
          for (const lang of this.languages) {
            newRow[lang] = `[NO TRANSLATION] ${fullKey}`;
          }
          existingRows.push(newRow);
        }
      }

      if (newKeys.length > 0) {
        this.writeCSV(csvFileName.replace(".csv", ""), existingRows);
        totalNewKeys += newKeys.length;
      }
    }

    return totalNewKeys;
  }
}

