/**
 * build command
 * CSV → JSON 변환
 */

import chalk from "chalk";
import { loadConfigWithContext } from "../config/loader.js";
import { CsvManager } from "../core/csv.js";

interface BuildOptions {
  app?: string;
}

export async function buildCommand(options: BuildOptions): Promise<void> {
  try {
    console.log(chalk.blue("📦 Building JSON files from CSV..."));

    const { config, projectRoot } = await loadConfigWithContext();
    const csvManager = new CsvManager(config, projectRoot);

    await csvManager.buildJsonFromCsv();
  } catch (error) {
    console.error(
      chalk.red("❌ Build failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

