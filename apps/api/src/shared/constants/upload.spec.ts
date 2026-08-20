import { sniffMime, isAllowedMime, extForMime, isUploadFolder } from './upload';

/**
 * `sniffMime` 是擋「宣告 image/png、body 是 HTML」的那道防線——白名單只比對
 * client 宣告值，擋不住內容偽造。這支測試存在的理由是：把 `sniffMime` 的呼叫
 * 整段刪掉時，必須有東西變紅。
 */
describe('upload 白名單與內容比對', () => {
  describe('sniffMime', () => {
    it.each([
      ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
      [
        'image/png',
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ],
      ['image/gif', Buffer.from('GIF89a')],
      ['image/gif', Buffer.from('GIF87a')],
      ['application/pdf', Buffer.from('%PDF-1.7')],
    ])('辨識 %s', (mime, buffer) => {
      expect(sniffMime(buffer)).toBe(mime);
    });

    it('辨識 WEBP：須同時符合 RIFF 與 WEBP 兩段', () => {
      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from('WEBP'),
      ]);
      expect(sniffMime(webp)).toBe('image/webp');
    });

    // 只看 RIFF 會把 WAV / AVI 誤判成 WEBP
    it('RIFF 開頭但非 WEBP（如 WAV）不得誤判', () => {
      const wav = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from('WAVE'),
      ]);
      expect(sniffMime(wav)).toBeNull();
    });

    it('HTML 內容不匹配任何允許類型', () => {
      expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    });

    // SVG 刻意不在白名單——它是 stored XSS 的經典載體
    it('SVG 不得被辨識為允許類型', () => {
      expect(
        sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">')),
      ).toBeNull();
    });

    it('buffer 短於特徵長度不得誤判', () => {
      expect(sniffMime(Buffer.from([0x89, 0x50]))).toBeNull();
      expect(sniffMime(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('白名單與副檔名推導', () => {
    it('允許的 MIME 各自對應正規副檔名', () => {
      expect(extForMime('image/jpeg')).toBe('jpg');
      expect(extForMime('application/pdf')).toBe('pdf');
    });

    it('未列入的 MIME 一律拒絕', () => {
      expect(isAllowedMime('text/html')).toBe(false);
      expect(isAllowedMime('image/svg+xml')).toBe(false);
    });

    it('資料夾白名單只認 avatars 與 attachments', () => {
      expect(isUploadFolder('avatars')).toBe(true);
      expect(isUploadFolder('../../etc')).toBe(false);
    });
  });
});
