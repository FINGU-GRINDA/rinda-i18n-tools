/**
 * Rinda i18n Tools - Universal i18n management for Rinda projects
 *
 * @example
 * ```typescript
 * // i18n.config.ts
 * import { defineConfig } from 'rinda-i18n-tools';
 *
 * export default defineConfig({
 *   localePath: 'src/i18n/locales',
 *   languages: ['ko', 'en', 'ja'],
 *   sourceLanguage: 'ko',
 * });
 * ```
 */

// Config exports
export { defineConfig } from "./config/types.js";
export type {
  I18nConfig,
  AppLocaleConfig,
  GoogleSheetsConfig,
  OpenAIConfig,
  ScannerConfig,
} from "./config/types.js";

// Config loader
export { loadConfig, findConfigFile } from "./config/loader.js";

// Core modules
export { CsvManager } from "./core/csv.js";
export { Translator } from "./core/translator.js";
export { GoogleSheetsClient } from "./core/google-sheets.js";

// Utils
export * from "./utils/index.js";

