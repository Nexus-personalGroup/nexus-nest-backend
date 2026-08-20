/**
 * WebSocket gateway 原始碼的解析工具，供多條守則共用。
 *
 * 抽出來的理由不是省行數，是**避免兩份解析漸漸不一致**：同一個 handler 在 A 規則
 * 被切出來、在 B 規則沒切出來，症狀是其中一條規則靜默失效，而沒有任何徵兆。
 */

/**
 * 去掉註解再比對。
 *
 * 說明「這裡有做某個檢查」的文字，最常出現在**真的有做**的檔案裡。用字串比對的話，
 * 偽陰性會集中在本來就正確的位置——等到有人重構把真呼叫拿掉、註解留著，守則依然全綠。
 *
 * **定位任何片段前都要先呼叫它**，順序不能反：註解裡提到的裝飾器會把定位起點拉進
 * 註解內部，讓後續的去註解因為少了 `/*` 開頭而失效。實際踩過。
 */
export const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 取得 gateway 建構子中注入的 use case 欄位名。
 *
 * 只認型別以 `UseCase` 結尾的注入，不是「有呼叫任何 this.x」就算數：
 * `presence`、`eventPublisher` 這些也是 port，但它們是副作用的出口，
 * 不回答業務問題。把它們算進來等於自動放行。
 */
export const useCaseFields = (source: string): string[] => {
  const pattern =
    /(?:private|public|protected)\s+readonly\s+(\w+)\s*:\s*(\w*UseCase)\b/g;
  return [...stripComments(source).matchAll(pattern)].map((m) => m[1]);
};

/** 欄位名 → use case 型別名，用於由 handler 反查對應的 service 檔 */
export const useCaseTypes = (source: string): Map<string, string> => {
  const pattern =
    /(?:private|public|protected)\s+readonly\s+(\w+)\s*:\s*(\w*UseCase)\b/g;
  return new Map(
    [...stripComments(source).matchAll(pattern)].map((m) => [m[1], m[2]]),
  );
};

export type WsHandler = { name: string; line: number; body: string };

/**
 * 切出每個 `@SubscribeMessage` handler。
 *
 * 起點往前吃掉連續的裝飾器行：裝飾器歸錯 handler 會同時造成漏報與誤報
 * （前一支莫名通過、本支莫名被抓），HTTP 版實際踩過。
 */
export const wsHandlersOf = (source: string): WsHandler[] => {
  const lines = source.split('\n');
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (!/^\s*@SubscribeMessage\(/.test(line)) return;
    let begin = index;
    while (begin > 0 && /^\s*@\w+\(/.test(lines[begin - 1])) begin -= 1;
    starts.push(begin);
  });

  return starts.map((start, i) => {
    const end = starts[i + 1] ?? lines.length;
    const block = lines.slice(start, end);
    const signature =
      block.find((l) => /^\s{2}(async\s+)?\w+\(/.test(l)) ??
      block.find((l) => /^\s{2}(async\s+)?handle\w*/.test(l)) ??
      '';
    return {
      name: /\s{2}(?:async\s+)?(\w+)\s*\(/.exec(signature)?.[1] ?? '(未知)',
      line: start + 1,
      body: stripComments(block.join('\n')),
    };
  });
};

/** handler 實際呼叫到的 use case 欄位名 */
export const calledUseCases = (
  handler: WsHandler,
  fields: string[],
): string[] =>
  fields.filter((field) =>
    new RegExp(`this\\.${field}\\.\\w+\\(`).test(handler.body),
  );
