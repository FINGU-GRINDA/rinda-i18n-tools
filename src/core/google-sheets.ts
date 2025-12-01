/**
 * Google Sheets Client
 * Google Sheets API를 통한 번역 데이터 동기화
 */

import { google } from "googleapis";
import type { I18nConfig } from "../config/types.js";
import { getLanguages, getSheetName } from "../config/loader.js";
import type { TranslationRow } from "./csv.js";

/**
 * Google Sheets 클라이언트 클래스
 */
export class GoogleSheetsClient {
  private config: I18nConfig;
  private sheetsClient: ReturnType<typeof google.sheets> | null = null;
  private spreadsheetId: string;
  private sheetName: string;

  constructor(config: I18nConfig, sheetName?: string) {
    this.config = config;
    this.sheetName = sheetName ?? getSheetName(config);

    // 스프레드시트 ID 확인
    const spreadsheetId =
      config.googleSheets?.spreadsheetId ?? process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error(
        "GOOGLE_SHEET_ID environment variable is not set.\n" +
          "Please add GOOGLE_SHEET_ID to .env file.",
      );
    }

    this.spreadsheetId = spreadsheetId;
  }

  /**
   * 지원 언어 목록
   */
  get languages(): string[] {
    return getLanguages(this.config);
  }

  /**
   * Google Sheets API 클라이언트 초기화
   */
  async initialize(): Promise<void> {
    if (this.sheetsClient) {
      return;
    }

    const credentials = process.env.GOOGLE_CREDENTIALS;

    if (!credentials) {
      throw new Error(
        "GOOGLE_CREDENTIALS environment variable is not set.\n" +
          "Please add GOOGLE_CREDENTIALS to .env file.\n" +
          'Example: GOOGLE_CREDENTIALS=\'{"type":"service_account",...}\'',
      );
    }

    try {
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(credentials),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      this.sheetsClient = google.sheets({
        version: "v4",
        auth: auth,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Google Sheets authentication failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 시트가 존재하는지 확인하고 없으면 생성
   */
  async ensureSheetExists(): Promise<void> {
    await this.initialize();

    try {
      const spreadsheet = await this.sheetsClient!.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets?.some(
        (sheet) => sheet.properties?.title === this.sheetName,
      );

      if (!sheetExists) {
        // 시트 생성
        await this.sheetsClient!.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                  },
                },
              },
            ],
          },
        });

        // 헤더 행 작성
        const headers = ["filename", "key", ...this.languages, "lastModified"];
        await this.sheetsClient!.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1`,
          valueInputOption: "RAW",
          requestBody: {
            values: [headers],
          },
        });

        console.log(`✅ Created sheet "${this.sheetName}" with headers`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to check/create sheet: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Google Sheets에서 모든 데이터 읽기
   */
  async readData(): Promise<TranslationRow[]> {
    await this.ensureSheetExists();

    try {
      const response = await this.sheetsClient!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:Z`,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return [];
      }

      const headers = rows[0] as string[];
      const dataRows = rows.slice(1);

      // 헤더 인덱스 찾기
      const filenameIndex = headers.indexOf("filename");
      const keyIndex = headers.indexOf("key");
      const lastModifiedIndex = headers.indexOf("lastModified");
      const langIndices: Record<string, number> = {};
      for (const lang of this.languages) {
        langIndices[lang] = headers.indexOf(lang);
      }

      const result: TranslationRow[] = [];
      const seenKeys = new Map<string, number>();

      for (const row of dataRows) {
        if (!row[filenameIndex] || !row[keyIndex]) {
          continue;
        }

        const translationRow: TranslationRow = {
          filename: row[filenameIndex] as string,
          key: row[keyIndex] as string,
        };

        // 언어별 값 추가
        for (const lang of this.languages) {
          const index = langIndices[lang];
          if (index >= 0 && row[index]) {
            translationRow[lang] = row[index] as string;
          }
        }

        // lastModified 추가
        if (lastModifiedIndex >= 0 && row[lastModifiedIndex]) {
          translationRow.lastModified = row[lastModifiedIndex] as string;
        }

        // 중복 키 처리
        const compositeKey = `${translationRow.filename}:${translationRow.key}`;
        const existingIndex = seenKeys.get(compositeKey);

        if (existingIndex !== undefined) {
          console.warn(
            `⚠️  Warning: Duplicate key "${compositeKey}" found in Google Sheet`,
          );
          result[existingIndex] = translationRow;
        } else {
          seenKeys.set(compositeKey, result.length);
          result.push(translationRow);
        }
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read sheet: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Google Sheets에 데이터 쓰기 (전체 덮어쓰기)
   */
  async writeData(rows: TranslationRow[]): Promise<void> {
    await this.ensureSheetExists();

    try {
      const headers = ["filename", "key", ...this.languages, "lastModified"];

      const values = rows.map((row) => {
        const rowValues: (string | undefined)[] = [
          row.filename,
          row.key,
          ...this.languages.map((lang) => row[lang] || ""),
          row.lastModified || "",
        ];
        return rowValues;
      });

      // 전체 시트 덮어쓰기
      await this.sheetsClient!.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [headers, ...values],
        },
      });

      // 남은 행 정리
      if (values.length > 0) {
        const lastRow = values.length + 1;
        const clearRange = `${this.sheetName}!A${lastRow + 1}:ZZZ`;
        try {
          await this.sheetsClient!.spreadsheets.values.clear({
            spreadsheetId: this.spreadsheetId,
            range: clearRange,
          });
        } catch {
          // 정리 오류 무시
        }
      }

      console.log(`✅ Wrote ${rows.length} rows to sheet "${this.sheetName}"`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to write sheet: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 시트의 행 개수 조회
   */
  async getRowCount(): Promise<number> {
    await this.ensureSheetExists();

    try {
      const response = await this.sheetsClient!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:A`,
      });

      const rows = response.data.values || [];
      return Math.max(0, rows.length - 1);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get sheet row count: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 마지막 수정 시간 조회
   */
  async getLastModified(): Promise<string | null> {
    await this.ensureSheetExists();

    try {
      const headers = ["filename", "key", ...this.languages, "lastModified"];
      const lastModifiedIndex = headers.length - 1;

      const columnLetter = this.indexToColumnLetter(lastModifiedIndex);

      const response = await this.sheetsClient!.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!${columnLetter}2:${columnLetter}`,
      });

      const values = response.data.values as string[][] | undefined;
      if (!values || values.length === 0) {
        return null;
      }

      let latest: string | null = null;
      for (const row of values) {
        if (row[0]) {
          const timestamp = row[0];
          if (!latest || timestamp > latest) {
            latest = timestamp;
          }
        }
      }

      return latest;
    } catch {
      return null;
    }
  }

  /**
   * 인덱스를 열 문자로 변환
   */
  private indexToColumnLetter(index: number): string {
    let result = "";
    let idx = index;
    while (idx >= 0) {
      result = String.fromCharCode(65 + (idx % 26)) + result;
      idx = Math.floor(idx / 26) - 1;
    }
    return result;
  }
}

