/**
 * scan command
 * 소스 코드에서 번역 키 스캔 (i18next-scanner 연동)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import { loadConfigWithContext } from "../config/loader.js";
import { CsvManager } from "../core/csv.js";

interface ScanOptions {
  app?: string;
  merge?: boolean;
}

export async function scanCommand(options: ScanOptions): Promise<void> {
  try {
    console.log(chalk.blue("🔍 Scanning source code for translation keys..."));

    const { config, projectRoot } = await loadConfigWithContext();

    // i18next-scanner 설정 파일 확인
    const scannerConfigPath = join(projectRoot, "i18next-scanner.config.cjs");
    const scannerConfigAltPath = join(projectRoot, "i18next-scanner.config.js");

    const configExists =
      existsSync(scannerConfigPath) || existsSync(scannerConfigAltPath);

    if (!configExists) {
      console.log(chalk.yellow("⚠️  No i18next-scanner config found."));
      console.log("   Create i18next-scanner.config.cjs to enable key scanning.");
      console.log("");
      console.log("   Example config:");
      console.log(chalk.gray(`
module.exports = {
  input: ['src/**/*.{ts,tsx,js,jsx}'],
  output: './',
  options: {
    lngs: ['ko', 'en'],
    defaultLng: 'ko',
    resource: {
      loadPath: 'locales/.scanned/{{lng}}/{{ns}}.json',
      savePath: 'locales/.scanned/{{lng}}/{{ns}}.json',
    },
    func: {
      list: ['t', 'i18next.t', 'i18n.t'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    trans: {
      component: 'Trans',
      extensions: ['.tsx', '.jsx'],
    },
  },
};
`));
      return;
    }

    // i18next-scanner 실행
    console.log("Running i18next-scanner...");

    await new Promise<void>((resolve, reject) => {
      const scanner = spawn("npx", ["i18next-scanner", "--config", configExists ? scannerConfigPath : scannerConfigAltPath], {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true,
      });

      scanner.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`i18next-scanner exited with code ${code}`));
        }
      });

      scanner.on("error", reject);
    });

    console.log(chalk.green("✅ Scan completed!"));

    // --merge 옵션이 있으면 CSV에 병합
    if (options.merge) {
      console.log("");
      console.log(chalk.blue("📝 Merging scanned keys to CSV..."));

      const csvManager = new CsvManager(config, projectRoot);

      // 스캔 결과 경로 찾기
      const sourceLanguage = config.sourceLanguage ?? "ko";
      const scannedPath = join(
        projectRoot,
        config.scanner?.output ?? "locales/.scanned",
        sourceLanguage,
        "translation.json",
      );

      if (!existsSync(scannedPath)) {
        console.log(chalk.yellow("⚠️  No scanned keys found."));
        return;
      }

      const newKeysCount = await csvManager.mergeScannedKeys(scannedPath);

      if (newKeysCount === 0) {
        console.log(chalk.green("✅ No new keys found. CSV files are up to date!"));
      } else {
        console.log(chalk.green(`✅ Added ${newKeysCount} new key(s) to CSV files`));
      }
    }
  } catch (error) {
    console.error(
      chalk.red("❌ Scan failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

