/**
 * export command
 * JSON → CSV 변환
 */

import { join } from "node:path";
import chalk from "chalk";
import { loadConfigWithContext, getLocalePathForApp } from "../config/loader.js";
import { CsvManager } from "../core/csv.js";

interface ExportOptions {
  app?: string;
}

export async function exportCommand(options: ExportOptions): Promise<void> {
  try {
    console.log(chalk.blue("📤 Exporting JSON files to CSV..."));

    const { config, projectRoot } = await loadConfigWithContext();
    
    // 모노레포 여부 확인: apps 설정이 있으면 모노레포
    const isMonorepo = config.apps && Object.keys(config.apps).length > 0;
    
    if (isMonorepo && !options.app) {
      throw new Error(
        "App name is required for monorepo export.\n" +
        "Example: pnpm i18n:export -- --app landing-page\n" +
        `Available apps: ${Object.keys(config.apps || {}).join(", ")}`
      );
    }

    const csvManager = new CsvManager(config, projectRoot, options.app);

    const localePath = join(
      projectRoot,
      getLocalePathForApp(config, options.app),
    );

    console.log(chalk.gray(`   Source: ${localePath}`));
    console.log(chalk.gray(`   Target: ${csvManager.csvDir}`));

    await csvManager.exportCsvFromJson(localePath);

    console.log(chalk.green("\n✅ Export completed!"));
  } catch (error) {
    console.error(
      chalk.red("❌ Export failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

