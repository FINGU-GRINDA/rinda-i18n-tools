/**
 * i18n Configuration Template
 * 이 파일을 프로젝트 루트에 복사하고 필요에 맞게 수정하세요.
 */

import { defineConfig } from "rinda-i18n-tools";

export default defineConfig({
  // ═══════════════════════════════════════════════════════════════════════════
  // 기본 설정
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 로케일 파일 경로 (단일 앱 프로젝트용)
   * monorepo인 경우 아래 apps 설정을 사용하세요
   */
  localePath: "src/i18n/locales",

  /**
   * Monorepo용 앱별 로케일 경로
   * 단일 앱 프로젝트인 경우 이 설정은 무시됩니다
   */
  // apps: {
  //   'landing-page': 'apps/landing-page/src/messages/locales',
  //   'frontend': 'apps/frontend/public/locales',
  //   'admin': 'apps/admin/src/i18n/locales',
  // },

  /**
   * 지원할 언어 목록
   */
  languages: ["ko", "en"],

  /**
   * 소스 언어 (번역 원본)
   */
  sourceLanguage: "ko",

  /**
   * CSV 파일 디렉토리
   */
  csvDir: "locales",

  /**
   * JSON 출력 디렉토리 (CSV → JSON 변환 결과)
   */
  outputDir: "src/i18n/generated",

  // ═══════════════════════════════════════════════════════════════════════════
  // Google Sheets 연동 설정
  // ═══════════════════════════════════════════════════════════════════════════

  googleSheets: {
    /**
     * Google Sheets 탭 이름
     * 하나의 스프레드시트에 여러 프로젝트를 탭으로 관리할 때 사용
     */
    sheetName: "my-project",

    /**
     * 스프레드시트 ID (선택)
     * 환경변수 GOOGLE_SHEET_ID로 대체 가능
     */
    // spreadsheetId: 'your-spreadsheet-id',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OpenAI 번역 설정
  // ═══════════════════════════════════════════════════════════════════════════

  openai: {
    /**
     * 사용할 모델
     * - gpt-4o-mini: 빠르고 저렴 (기본값)
     * - gpt-4o: 높은 품질
     */
    model: "gpt-4o-mini",

    /**
     * 번역 온도 (0-1)
     * 낮을수록 일관성 있는 번역, 높을수록 창의적인 번역
     */
    temperature: 0.3,

    /**
     * 커스텀 시스템 프롬프트 (선택)
     * 프로젝트 맥락을 추가하면 더 정확한 번역 가능
     */
    // systemPrompt: `
    //   이 프로젝트는 B2B SaaS 플랫폼입니다.
    //   전문적이고 비즈니스에 적합한 톤으로 번역해주세요.
    // `,

    /**
     * 분당 요청 수 제한 (Rate limit)
     * OpenAI API 티어에 맞게 조정
     */
    rpmLimit: 800,

    /**
     * 동시 처리 수
     */
    concurrency: 10,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // i18next-scanner 설정 (키 자동 스캔)
  // ═══════════════════════════════════════════════════════════════════════════

  scanner: {
    /**
     * 스캔할 파일 패턴
     */
    input: ["src/**/*.{ts,tsx,js,jsx}"],

    /**
     * 제외할 파일 패턴
     */
    exclude: ["node_modules/**", "**/*.test.*", "**/*.spec.*"],

    /**
     * 스캔 결과 출력 경로
     */
    output: "locales/.scanned",

    /**
     * 기본 네임스페이스
     */
    defaultNamespace: "translation",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Watch 모드 설정
  // ═══════════════════════════════════════════════════════════════════════════

  watch: {
    /**
     * CSV 파일 변경 감지 (CSV → JSON 자동 빌드)
     */
    csv: true,

    /**
     * 소스 파일 변경 감지 (자동 키 스캔)
     */
    source: true,

    /**
     * debounce 시간 (ms)
     */
    debounce: 500,
  },
});

