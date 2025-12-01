# Rinda i18n Tools

Universal i18n management tool for Rinda projects. Supports AI-powered translation, CSV/JSON conversion, and Google Sheets synchronization.

## Features

- **AI Translation**: Automatic translation using OpenAI GPT models
- **CSV ↔ JSON Conversion**: Manage translations in CSV format for easy editing
- **Google Sheets Sync**: Collaborate with translators via Google Sheets
- **Key Scanning**: Auto-detect translation keys from source code (i18next-scanner)
- **Watch Mode**: Auto-build on file changes
- **Monorepo Support**: Configure different locale paths for each app

## Installation

### As Git Submodule (Recommended)

```bash
# Add as submodule (SSH)
git submodule add git@github.com:FINGU-GRINDA/rinda-i18n-tools.git tools/i18n
# Or using HTTPS
git submodule add https://github.com/FINGU-GRINDA/rinda-i18n-tools.git tools/i18n

# Install dependencies
cd tools/i18n && pnpm install

# For pnpm workspace (monorepo) - use --ignore-workspace
cd tools/i18n && pnpm install --ignore-workspace
```

### For Existing Clones (After Adding Submodule)

```bash
# Initialize and update submodules
git submodule update --init --recursive

# Install dependencies
cd tools/i18n && pnpm install
```

### Direct Clone

```bash
git clone https://github.com/FINGU-GRINDA/rinda-i18n-tools.git
cd rinda-i18n-tools
pnpm install
```

## Quick Start

### 1. Initialize Configuration

```bash
# In your project root
tsx tools/i18n/bin/cli.ts init
```

This creates `i18n.config.ts` in your project root.

### 2. Configure Your Project

Edit `i18n.config.ts`:

```typescript
import { defineConfig } from "rinda-i18n-tools";

export default defineConfig({
  // Single app project
  localePath: "src/i18n/locales",
  
  // OR Monorepo
  apps: {
    "landing-page": "apps/landing-page/src/messages/locales",
    "frontend": "apps/frontend/public/locales",
  },
  
  languages: ["ko", "en", "ja"],
  sourceLanguage: "ko",
  csvDir: "locales",
  outputDir: "src/i18n/generated",
  
  googleSheets: {
    sheetName: "my-project",
  },
  
  openai: {
    model: "gpt-4o-mini",
  },
});
```

### 3. Set Environment Variables

Create `.env` file:

```env
# OpenAI (for AI translation)
OPENAI_API_KEY=sk-proj-...

# Google Sheets (for sync)
GOOGLE_SHEET_ID=your-spreadsheet-id
GOOGLE_CREDENTIALS='{"type":"service_account",...}'
```

### 4. Add Scripts to package.json

```json
{
  "scripts": {
    "i18n:build": "tsx tools/i18n/bin/cli.ts build",
    "i18n:scan": "tsx tools/i18n/bin/cli.ts scan --merge",
    "i18n:translate": "tsx tools/i18n/bin/cli.ts translate",
    "i18n:push": "tsx tools/i18n/bin/cli.ts push",
    "i18n:pull": "tsx tools/i18n/bin/cli.ts pull",
    "i18n:check": "tsx tools/i18n/bin/cli.ts check",
    "i18n:watch": "tsx tools/i18n/bin/cli.ts watch"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `i18n init` | Initialize config file |
| `i18n build` | Build JSON from CSV files |
| `i18n export` | Export JSON locale files to CSV |
| `i18n scan` | Scan source code for translation keys |
| `i18n translate -t <lang>` | AI translate to target language |
| `i18n push` | Upload to Google Sheets |
| `i18n pull` | Download from Google Sheets |
| `i18n check` | Check sync status |
| `i18n watch` | Watch for file changes |

### Command Options

```bash
# Translate to Japanese
i18n translate --target ja

# Force overwrite existing translations
i18n translate --target ja --force

# Dry run (preview without changes)
i18n translate --target ja --dry-run

# Push with force (overwrite sheet)
i18n push --force

# Pull and merge local-only keys
i18n pull --merge

# Use custom sheet ID
i18n push --sheet-id YOUR_SHEET_ID

# Watch CSV files only
i18n watch --csv
```

## Directory Structure

```
your-project/
├── i18n.config.ts          # Configuration file
├── .env                    # Environment variables
├── locales/                # CSV files
│   ├── common.csv
│   ├── pages.csv
│   └── .i18n-sync.json     # Sync metadata
├── src/i18n/
│   └── generated/          # Built JSON files
│       ├── ko.json
│       ├── en.json
│       └── ja.json
└── tools/i18n/             # This tool (submodule)
```

## CSV Format

```csv
key,ko,en,ja
common.title,제목,Title,タイトル
common.button.save,저장,Save,保存
common.button.cancel,취소,Cancel,キャンセル
```

## Google Sheets Setup

### 1. Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable Google Sheets API
4. Create Service Account (IAM & Admin > Service Accounts)
5. Create JSON key and download

### 2. Share Spreadsheet

1. Create a new Google Spreadsheet
2. Share with service account email (Editor permission)
3. Copy spreadsheet ID from URL

### 3. Configure Environment

```env
GOOGLE_SHEET_ID=your-spreadsheet-id
GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
```

## Supported Languages

| Code | Language |
|------|----------|
| ko | Korean (한국어) |
| en | English |
| ja | Japanese (日本語) |
| zh-CN | Chinese Simplified (简体中文) |
| zh-TW | Chinese Traditional (繁體中文) |
| id | Indonesian (Bahasa Indonesia) |
| vi | Vietnamese (Tiếng Việt) |
| th | Thai (ไทย) |
| es | Spanish (Español) |
| fr | French (Français) |
| de | German (Deutsch) |
| pt | Portuguese (Português) |
| ar | Arabic (العربية) |

## Workflow Examples

### Adding New Features

```bash
# 1. Add new keys to ko/*.json
# 2. Export to CSV
i18n export

# 3. Push to Google Sheets
i18n push

# 4. Notify translators
```

### Pulling Translations

```bash
# 1. Check status
i18n check

# 2. Pull from Sheets
i18n pull

# 3. Build JSON
i18n build

# 4. Review and commit
git diff
git add .
git commit -m "chore: update translations"
```

### AI Translation

```bash
# Translate to all languages
i18n translate --target en
i18n translate --target ja
i18n translate --target zh-CN

# Force re-translate
i18n translate --target en --force
```

## Development Mode

```bash
# Start watch mode for auto-build
i18n watch

# Or with concurrent processes (recommended)
concurrently "vite" "i18n watch"
```

## Troubleshooting

### OpenAI API Error

```
Error: OPENAI_API_KEY environment variable is not set
```

Solution: Add `OPENAI_API_KEY` to `.env` file

### Google Sheets Error

```
GOOGLE_CREDENTIALS environment variable is not set
```

Solution: Add `GOOGLE_CREDENTIALS` and `GOOGLE_SHEET_ID` to `.env` file

### Config Not Found

```
No i18n config file found
```

Solution: Run `i18n init` to create config file

## Cost Estimation

Using gpt-4o-mini (2025 pricing):
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

Typical project translation: **~$0.01-$0.05 per language**

## Submodule Management

### Update Submodule to Latest

```bash
cd tools/i18n
git pull origin main
cd ../..
git add tools/i18n
git commit -m "chore: update i18n tools"
```

### Remove Submodule

```bash
git submodule deinit -f tools/i18n
rm -rf .git/modules/tools/i18n
git rm -f tools/i18n
```

## License

Private - FINGU-GRINDA

