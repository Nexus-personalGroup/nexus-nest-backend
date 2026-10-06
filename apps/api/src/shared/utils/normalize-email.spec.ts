import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it.each([
    ['Foo@Example.com', 'foo@example.com'],
    ['  foo@example.com  ', 'foo@example.com'],
    ['\tFOO@EXAMPLE.COM\n', 'foo@example.com'],
    ['foo@example.com', 'foo@example.com'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('大小寫不同的寫法會收斂成同一個值（查重與限流計數靠這個性質）', () => {
    expect(normalizeEmail('Foo@x.com')).toBe(normalizeEmail('foo@X.com'));
  });

  // 以下兩條是**邊界宣告**：不是忘了做，是刻意不做。
  // 少了它們，日後有人「順手補上」會讓兩個不同的帳號被當成同一個
  it('不做 Gmail 的 dot 正規化——那是 Gmail 的規則不是信箱的規則', () => {
    expect(normalizeEmail('a.b@gmail.com')).not.toBe(
      normalizeEmail('ab@gmail.com'),
    );
  });

  it('不做 plus 標籤正規化', () => {
    expect(normalizeEmail('a+tag@x.com')).not.toBe(normalizeEmail('a@x.com'));
  });
});
