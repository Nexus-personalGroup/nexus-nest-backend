import { directKeyOf } from './direct-key';

describe('directKeyOf', () => {
  // 這是 1:1 唯一性的全部基礎：unique index 只認「值相同」，
  // 一旦兩個方向產生不同的鍵，同一組人就會有兩個私聊房間
  it('與參數順序無關', () => {
    expect(directKeyOf('b', 'a')).toBe(directKeyOf('a', 'b'));
  });

  it('以冒號串接排序後的兩個 ID', () => {
    expect(directKeyOf('b', 'a')).toBe('a:b');
  });

  it('不同組合產生不同的鍵', () => {
    expect(directKeyOf('a', 'b')).not.toBe(directKeyOf('a', 'c'));
  });

  // uuid 是等長的，但這裡不假設——排序若退化成長度比較，等長輸入不會顯示症狀
  it('對 uuid 一樣對稱', () => {
    const x = '550e8400-e29b-41d4-a716-446655440000';
    const y = '110e8400-e29b-41d4-a716-446655440999';
    expect(directKeyOf(x, y)).toBe(directKeyOf(y, x));
    expect(directKeyOf(x, y)).toBe(`${y}:${x}`);
  });
});
