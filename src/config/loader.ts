/**
 * Configuration Loader
 * 프로젝트 루트에서 i18n.config.ts 파일을 찾아 로드
 */

import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { I18nConfig } from "./types.js";
import { mergeWithDefaults, DEFAULT_CONFIG } from "./types.js";

/**
 * 설정 파일 이름 목록 (우선순위 순)
 */
const CONFIG_FILE_NAMES = [
  "i18n.config.ts",
  "i18n.config.js",
  "i18n.config.mjs",
  ".i18nrc.ts",
  ".i18nrc.js",
  ".i18nrc.json",
];

/**
 * 프로젝트 루트 경로를 찾습니다
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);

  while (currentDir !== dirname(currentDir)) {
    // package.json이 있으면 프로젝트 루트로 간주
    if (existsSync(join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = dirname(currentDir);
  }

  // package.json을 찾지 못하면 시작 디렉토리 반환
  return resolve(startDir);
}

/**
 * 설정 파일 경로를 찾습니다
 */
export function findConfigFile(startDir?: string): string | null {
  const projectRoot = findProjectRoot(startDir);

  for (const fileName of CONFIG_FILE_NAMES) {
    const configPath = join(projectRoot, fileName);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * 설정 파일을 로드합니다
 *
 * @param configPath 설정 파일 경로 (생략 시 자동 탐색)
 * @returns 로드된 설정 (기본값과 병합됨)
 */
export async function loadConfig(configPath?: string): Promise<I18nConfig> {
  const resolvedPath = configPath ?? findConfigFile();

  if (!resolvedPath) {
    console.warn(
      "⚠️  No i18n config file found. Using default configuration.",
    );
    console.warn("   Create i18n.config.ts in your project root to customize.");
    return mergeWithDefaults(DEFAULT_CONFIG);
  }

  try {
    // JSON 파일인 경우
    if (resolvedPath.endsWith(".json")) {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(resolvedPath, "utf-8");
      const config = JSON.parse(content) as I18nConfig;
      return mergeWithDefaults(config);
    }

    // TypeScript/JavaScript 파일인 경우
    const fileUrl = pathToFileURL(resolvedPath).href;
    const module = await import(fileUrl);
    const config = (module.default ?? module) as I18nConfig;
    return mergeWithDefaults(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config from ${resolvedPath}: ${message}`);
  }
}

/**
 * 특정 앱의 로케일 경로를 반환합니다
 *
 * @param config 설정 객체
 * @param appName 앱 이름 (monorepo용)
 * @returns 로케일 디렉토리 경로
 */
export function getLocalePathForApp(
  config: I18nConfig,
  appName?: string,
): string {
  // 앱 이름이 지정되고 apps 설정이 있으면 해당 앱의 경로 반환
  if (appName && config.apps?.[appName]) {
    return config.apps[appName];
  }

  // 단일 앱 설정인 경우
  if (config.localePath) {
    return config.localePath;
  }

  // 앱 이름이 지정되었지만 apps 설정이 없으면 기본 패턴 사용
  if (appName) {
    return `apps/${appName}/src/messages/locales`;
  }

  // 기본값
  return "src/messages/locales";
}

/**
 * 설정된 언어 목록을 반환합니다
 */
export function getLanguages(config: I18nConfig): string[] {
  return config.languages ?? DEFAULT_CONFIG.languages;
}

/**
 * 소스 언어를 반환합니다
 */
export function getSourceLanguage(config: I18nConfig): string {
  return config.sourceLanguage ?? DEFAULT_CONFIG.sourceLanguage;
}

/**
 * CSV 디렉토리 경로를 반환합니다
 */
export function getCsvDir(config: I18nConfig): string {
  return config.csvDir ?? DEFAULT_CONFIG.csvDir;
}

/**
 * JSON 출력 디렉토리 경로를 반환합니다
 */
export function getOutputDir(config: I18nConfig): string {
  return config.outputDir ?? DEFAULT_CONFIG.outputDir;
}

/**
 * Google Sheets 시트 이름을 반환합니다
 */
export function getSheetName(config: I18nConfig, fallback?: string): string {
  const sheetName = config.googleSheets?.sheetName ?? fallback;
  
  if (!sheetName) {
    throw new Error(
      "Sheet name is required.\n" +
      "Either set googleSheets.sheetName in i18n.config.ts or use --app option.\n" +
      "Example: pnpm i18n:push -- --app landing-page"
    );
  }
  
  return sheetName;
}

/**
 * 프로젝트 컨텍스트 정보를 포함한 설정 로더
 */
export interface ConfigContext {
  config: I18nConfig;
  projectRoot: string;
  configPath: string | null;
}

export async function loadConfigWithContext(
  configPath?: string,
): Promise<ConfigContext> {
  const projectRoot = findProjectRoot();
  const resolvedConfigPath = configPath ?? findConfigFile();
  const config = await loadConfig(resolvedConfigPath ?? undefined);

  return {
    config,
    projectRoot,
    configPath: resolvedConfigPath,
  };
}

