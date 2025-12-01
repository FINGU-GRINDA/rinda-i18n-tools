/**
 * watch command
 * 파일 변경 감지 및 자동 빌드
 */

import { join } from "node:path";
import chalk from "chalk";
import chokidar from "chokidar";
import { loadConfigWithContext, getCsvDir } from "../config/loader.js";
import { CsvManager } from "../core/csv.js";

interface WatchOptions {
  app?: string;
  csv?: boolean;
  source?: boolean;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  try {
    console.log(chalk.blue("👀 Starting watch mode..."));

    const { config, projectRoot } = await loadConfigWithContext();
    const csvManager = new CsvManager(config, projectRoot);

    const debounce = config.watch?.debounce ?? 500;
    const watchCsv = options.csv ?? config.watch?.csv ?? true;
    const watchSource = options.source ?? config.watch?.source ?? false;

    // CSV 파일 감지
    if (watchCsv) {
      const csvDir = join(projectRoot, getCsvDir(config));
      const csvPattern = join(csvDir, "*.csv");

      console.log(chalk.gray(`   Watching CSV: ${csvPattern}`));

      let csvTimeout: NodeJS.Timeout | null = null;

      const csvWatcher = chokidar.watch(csvPattern, {
        ignoreInitial: true,
        ignored: /(^|[\/\\])\../,
      });

      csvWatcher.on("change", (path) => {
        if (csvTimeout) {
          clearTimeout(csvTimeout);
        }

        csvTimeout = setTimeout(async () => {
          console.log("");
          console.log(chalk.blue(`📝 CSV changed: ${path}`));
          console.log(chalk.gray("   Building JSON..."));

          try {
            await csvManager.buildJsonFromCsv();
            console.log(chalk.green("✅ Build completed"));
          } catch (error) {
            console.error(
              chalk.red("❌ Build failed:"),
              error instanceof Error ? error.message : error,
            );
          }
        }, debounce);
      });

      csvWatcher.on("add", (path) => {
        console.log(chalk.gray(`   New CSV file: ${path}`));
      });

      csvWatcher.on("error", (error) => {
        console.error(chalk.red("Watch error:"), error);
      });
    }

    // 소스 파일 감지 (스캔용)
    if (watchSource) {
      const sourcePatterns = config.scanner?.input ?? ["src/**/*.{ts,tsx,js,jsx}"];
      const excludePatterns = config.scanner?.exclude ?? ["node_modules/**"];

      console.log(chalk.gray(`   Watching source: ${sourcePatterns.join(", ")}`));

      let sourceTimeout: NodeJS.Timeout | null = null;

      const sourceWatcher = chokidar.watch(
        sourcePatterns.map((p) => join(projectRoot, p)),
        {
          ignoreInitial: true,
          ignored: [
            /(^|[\/\\])\../,
            ...excludePatterns.map((p) => new RegExp(p.replace("**", ".*"))),
          ],
        },
      );

      sourceWatcher.on("change", (path) => {
        if (sourceTimeout) {
          clearTimeout(sourceTimeout);
        }

        sourceTimeout = setTimeout(async () => {
          console.log("");
          console.log(chalk.blue(`📝 Source changed: ${path}`));
          console.log(chalk.gray("   To scan for new keys, run: i18n scan --merge"));
        }, debounce * 2); // 소스는 더 긴 debounce
      });
    }

    console.log("");
    console.log(chalk.green("✅ Watch mode started"));
    console.log(chalk.gray("   Press Ctrl+C to stop"));
    console.log("");

    // 프로세스가 종료되지 않도록 유지
    process.on("SIGINT", () => {
      console.log("");
      console.log(chalk.yellow("👋 Watch mode stopped"));
      process.exit(0);
    });

    // 무한 대기
    await new Promise(() => {});
  } catch (error) {
    console.error(
      chalk.red("❌ Watch failed:"),
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

