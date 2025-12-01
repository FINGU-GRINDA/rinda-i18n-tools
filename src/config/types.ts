/**
 * i18n Configuration Types
 * 각 repo에서 i18n.config.ts 파일을 통해 커스터마이징 가능한 설정 타입 정의
 */

/**
 * 지원 언어 정보
 */
export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * 기본 지원 언어 목록
 */
export const DEFAULT_LANGUAGES: Record<string, LanguageInfo> = {
  ko: { code: "ko", name: "Korean", nativeName: "한국어" },
  en: { code: "en", name: "English", nativeName: "English" },
  ja: { code: "ja", name: "Japanese", nativeName: "日本語" },
  id: { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  "zh-CN": { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
  "zh-TW": { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文" },
  vi: { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  th: { code: "th", name: "Thai", nativeName: "ไทย" },
  es: { code: "es", name: "Spanish", nativeName: "Español" },
  fr: { code: "fr", name: "French", nativeName: "Français" },
  de: { code: "de", name: "German", nativeName: "Deutsch" },
  pt: { code: "pt", name: "Portuguese", nativeName: "Português" },
  ar: { code: "ar", name: "Arabic", nativeName: "العربية" },
};

/**
 * 앱별 로케일 경로 설정 (monorepo용)
 */
export interface AppLocaleConfig {
  [appName: string]: string;
}

/**
 * Google Sheets 연동 설정
 */
export interface GoogleSheetsConfig {
  /** Google Sheets 탭 이름 (기본값: 프로젝트 이름) */
  sheetName?: string;
  /** 스프레드시트 ID (환경변수 GOOGLE_SHEET_ID로 대체 가능) */
  spreadsheetId?: string;
}

/**
 * OpenAI 번역 설정
 */
export interface OpenAIConfig {
  /** 사용할 모델 (기본값: gpt-4o-mini) */
  model?: string;
  /** 번역 온도 (0-1, 기본값: 0.3) */
  temperature?: number;
  /** 커스텀 시스템 프롬프트 (기본 프롬프트에 추가됨) */
  systemPrompt?: string;
  /** 분당 요청 수 제한 (기본값: 800) */
  rpmLimit?: number;
  /** 동시 처리 수 (기본값: 10) */
  concurrency?: number;
}

/**
 * i18next-scanner 설정
 */
export interface ScannerConfig {
  /** 스캔할 파일 패턴 (기본값: ['src/**\/*.{ts,tsx,js,jsx}']) */
  input?: string[];
  /** 제외할 파일 패턴 */
  exclude?: string[];
  /** 스캔 결과 출력 경로 */
  output?: string;
  /** 기본 네임스페이스 */
  defaultNamespace?: string;
  /** i18next-scanner 추가 옵션 */
  scannerOptions?: Record<string, unknown>;
}

/**
 * Watch 모드 설정
 */
export interface WatchConfig {
  /** CSV 파일 변경 감지 */
  csv?: boolean;
  /** 소스 파일 변경 감지 (스캔용) */
  source?: boolean;
  /** debounce 시간 (ms) */
  debounce?: number;
}

/**
 * 메인 i18n 설정 타입
 */
export interface I18nConfig {
  /**
   * 단일 앱용 로케일 경로
   * @example 'src/i18n/locales'
   */
  localePath?: string;

  /**
   * Monorepo용 앱별 로케일 경로
   * @example { 'landing-page': 'apps/landing-page/src/messages/locales' }
   */
  apps?: AppLocaleConfig;

  /**
   * 지원할 언어 코드 목록
   * @default ['ko', 'en']
   */
  languages?: string[];

  /**
   * 소스 언어 (번역 원본)
   * @default 'ko'
   */
  sourceLanguage?: string;

  /**
   * CSV 파일 디렉토리 경로
   * @default 'locales'
   */
  csvDir?: string;

  /**
   * JSON 출력 디렉토리 경로
   * @default 'src/i18n/generated'
   */
  outputDir?: string;

  /**
   * Google Sheets 연동 설정
   */
  googleSheets?: GoogleSheetsConfig;

  /**
   * OpenAI 번역 설정
   */
  openai?: OpenAIConfig;

  /**
   * i18next-scanner 설정
   */
  scanner?: ScannerConfig;

  /**
   * Watch 모드 설정
   */
  watch?: WatchConfig;

  /**
   * 커스텀 언어 정보 (기본 언어 목록에 추가/덮어쓰기)
   */
  customLanguages?: Record<string, LanguageInfo>;
}

/**
 * 설정 파일을 위한 헬퍼 함수
 * TypeScript 자동완성 및 타입 검사 지원
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
export function defineConfig(config: I18nConfig): I18nConfig {
  return config;
}

/**
 * 기본 설정값
 */
export const DEFAULT_CONFIG: Required<
  Pick<I18nConfig, "languages" | "sourceLanguage" | "csvDir" | "outputDir">
> = {
  languages: ["ko", "en"],
  sourceLanguage: "ko",
  csvDir: "locales",
  outputDir: "src/i18n/generated",
};

/**
 * 설정값을 기본값과 병합
 */
export function mergeWithDefaults(config: I18nConfig): I18nConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    openai: {
      model: "gpt-4o-mini",
      temperature: 0.3,
      rpmLimit: 800,
      concurrency: 10,
      ...config.openai,
    },
    scanner: {
      input: ["src/**/*.{ts,tsx,js,jsx}"],
      defaultNamespace: "translation",
      ...config.scanner,
    },
    watch: {
      csv: true,
      source: true,
      debounce: 500,
      ...config.watch,
    },
  };
}

