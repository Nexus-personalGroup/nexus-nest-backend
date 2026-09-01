import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom 缺的幾個 DOM API。
 *
 * Radix 的 Select / DropdownMenu 用 pointer capture 判斷拖曳，用 `scrollIntoView`
 * 把選中項捲進視野——jsdom 兩者都沒有實作，於是**下拉永遠打不開**，
 * 而錯誤訊息是「找不到 role=option 的元素」，指不到真正的原因。
 */
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

/**
 * Radix 的 Tooltip 開啟時會量測觸發元素的尺寸，而 jsdom 沒有 `ResizeObserver`。
 * 缺它的症狀特別難追：錯誤是 **unhandled exception**（不在任何一個 test 的堆疊裡），
 * 而畫面在那之後整個消失，於是後續斷言得到的是「找不到元素」——
 * 看起來像選擇器寫錯，其實是 render 已經掛了。
 */
globalThis.ResizeObserver ??= class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};

// 每個 test 後清掉 DOM，避免相互污染
afterEach(() => {
  cleanup();
});
