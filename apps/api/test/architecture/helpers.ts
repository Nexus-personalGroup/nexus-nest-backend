import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/** apps/api 根目錄（本檔位於 test/architecture/） */
export const API_ROOT = join(__dirname, '..', '..');

/** 原始碼掃描命中的單一位置 */
export type Violation = {
  /** 相對 apps/api 的路徑，一律以 / 分隔，例：src/domain/model/Member.ts */
  file: string;
  /** 1-based 行號 */
  line: number;
  /** 該行去除前後空白後的內容 */
  text: string;
};

type CollectOptions = {
  /** 只收這些副檔名，預設 ['.ts'] */
  extensions?: string[];
  /** 相對路徑包含任一片段即排除 */
  exclude?: string[];
};

/**
 * 將絕對路徑轉為相對 apps/api、一律以 / 分隔的路徑
 * @param absolute - 絕對路徑
 * @returns 相對路徑
 */
export const toRelative = (absolute: string): string =>
  relative(API_ROOT, absolute).split(sep).join('/');

/**
 * 讀取原始碼檔案內容
 * @param file - 相對 apps/api 的檔案路徑
 * @returns 檔案文字內容
 */
export const readSource = (file: string): string =>
  readFileSync(join(API_ROOT, file), 'utf8');

/**
 * 遞迴收集指定目錄下的原始碼檔案
 * @param dirs - 相對 apps/api 的目錄清單，例：['src', 'scripts']
 * @param options - 副檔名與排除設定
 * @returns 相對 apps/api 的檔案路徑陣列（已排序，確保失敗訊息順序穩定）
 */
export const collectSourceFiles = (
  dirs: string[],
  options: CollectOptions = {},
): string[] => {
  const extensions = options.extensions ?? ['.ts'];
  const exclude = options.exclude ?? [];
  const found: string[] = [];

  const walk = (absoluteDir: string): void => {
    for (const entry of readdirSync(absoluteDir)) {
      const absolute = join(absoluteDir, entry);
      if (statSync(absolute).isDirectory()) {
        walk(absolute);
        continue;
      }
      if (extensions.some((ext) => entry.endsWith(ext))) {
        found.push(toRelative(absolute));
      }
    }
  };

  for (const dir of dirs) {
    const absolute = join(API_ROOT, dir);
    // 目錄不存在不在此處拋錯：交由各規則的「掃描數 > 0」檢查回報，訊息較貼近該規則
    if (existsSync(absolute)) {
      walk(absolute);
    }
  }

  return found
    .filter((file) => !exclude.some((fragment) => file.includes(fragment)))
    .sort();
};

/**
 * 逐行比對樣式，回傳所有命中位置
 * @param files - 相對 apps/api 的檔案路徑清單
 * @param pattern - 逐行比對的正規表示式
 * @returns 命中位置清單
 */
export const findViolations = (
  files: string[],
  pattern: RegExp,
): Violation[] => {
  // 去掉 g flag：帶 g 的 RegExp 在 test() 之間會殘留 lastIndex，導致隔行漏判
  const matcher = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  const violations: Violation[] = [];

  for (const file of files) {
    readSource(file)
      .split('\n')
      .forEach((text, index) => {
        if (matcher.test(text)) {
          violations.push({ file, line: index + 1, text: text.trim() });
        }
      });
  }

  return violations;
};

/** 取出 import / export ... from '路徑' 與 import '路徑' 的模組路徑 */
const IMPORT_PATH_PATTERN =
  /^\s*(?:import|export)\s[^'"]*?['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/;

/**
 * 從單行程式碼取出 import 的模組路徑
 * @param line - 原始碼單行
 * @returns 模組路徑；該行不是 import 時回傳 null
 */
export const importPathOf = (line: string): string | null => {
  const matched = IMPORT_PATH_PATTERN.exec(line);
  return matched ? (matched[1] ?? matched[2] ?? null) : null;
};

/**
 * 將違規清單格式化為可定位的多行訊息
 * @param violations - 違規位置清單
 * @returns 每行為 `檔案:行號  內容` 的字串
 */
export const formatViolations = (violations: Violation[]): string =>
  violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join('\n');

/**
 * 組出供斷言使用的違規報告：無違規時為空字串。
 *
 * 各規則一律寫成 `expect(violationReport(...)).toBe('')` —— 失敗時 jest 的 diff 會直接
 * 印出修正指引與每筆 `檔案:行號`，比 `expect(list).toEqual([])` 的物件傾印好讀得多。
 *
 * @param violations - 違規位置清單
 * @param guidance - 繁中修正指引，說明應該改成什麼
 * @returns 違規報告字串，無違規時為空字串
 */
export const violationReport = (
  violations: Violation[],
  guidance: string,
): string =>
  violations.length === 0
    ? ''
    : `${guidance}（共 ${violations.length} 處）\n${formatViolations(violations)}`;
