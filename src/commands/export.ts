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
    const csvManager = new CsvManager(config, projectRoot);

    const localePath = join(
      projectRoot,
      getLocalePathForApp(config, options.app),
    );

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

