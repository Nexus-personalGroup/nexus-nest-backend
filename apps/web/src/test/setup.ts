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

// 每個 test 後清掉 DOM，避免相互污染
afterEach(() => {
  cleanup();
});
