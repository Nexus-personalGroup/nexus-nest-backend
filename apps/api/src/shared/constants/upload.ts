/**
 * 上傳白名單與規則（安全核心）。
 *
 * 三道把關，缺一不可：
 *
 * 1. **MIME 白名單**（`isAllowedMime`）——比對的是 multipart part 裡 **client 自行宣告**
 *    的 Content-Type，不是檔案內容。
 * 2. **magic byte 比對**（`sniffMime`）——讀檔案開頭判斷實際類型，與宣告不符即拒。
 *    沒有這一步，「白名單通過」只代表攻擊者填對了字串。
 * 3. **副檔名由 MIME 推導**（`EXT_BY_MIME`），**絕不取 client 原始檔名的副檔名**，
 *    擋掉 `evil.png.html` 這類雙副檔名。
 *
 * 另有 `main.ts` 對本機媒體路徑設的 `nosniff` + CSP 作為縱深防禦——但那**只在
 * `STORAGE_DRIVER=local` 時存在**；走 S3 presigned URL 時該 header 不在路徑上，
 * 需在 bucket / CDN 端補等效設定。大小上限由 env `MAX_UPLOAD_BYTES` 控制。
 */

/** 允許上傳的資料夾（key 前綴），未列入者一律拒絕 */
export const UPLOAD_FOLDERS = ['avatars', 'attachments'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

/** 允許的 MIME → 正規副檔名（此表同時作為 MIME 白名單） */
export const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
} as const;

export type AllowedMime = keyof typeof EXT_BY_MIME;

export const isUploadFolder = (v: string): v is UploadFolder =>
  (UPLOAD_FOLDERS as readonly string[]).includes(v);

export const isAllowedMime = (v: string): v is AllowedMime =>
  Object.prototype.hasOwnProperty.call(EXT_BY_MIME, v);

/** 由驗過的 MIME 取正規副檔名（呼叫前須先以 isAllowedMime 確認） */
export const extForMime = (mime: AllowedMime): string => EXT_BY_MIME[mime];

/** 各允許類型的檔案開頭特徵（magic byte） */
const MAGIC_BYTES: ReadonlyArray<{
  mime: AllowedMime;
  matches: (b: Buffer) => boolean;
}> = [
  {
    mime: 'image/jpeg',
    matches: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  },
  {
    mime: 'image/png',
    matches: (b) =>
      b
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/gif',
    matches: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8',
  },
  {
    mime: 'application/pdf',
    matches: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-',
  },
];

/**
 * 由檔案開頭的 magic byte 判斷實際類型
 *
 * 用途是驗證「client 宣告的 MIME」與「檔案真實內容」相符——白名單只擋得住
 * 宣告值，擋不住內容偽造（宣告 image/png 但 body 是 HTML 或 SVG）。
 *
 * @param buffer - 檔案內容
 * @returns 對應的允許類型；無法辨識時為 null
 */
export const sniffMime = (buffer: Buffer): AllowedMime | null =>
  MAGIC_BYTES.find(({ matches }) => matches(buffer))?.mime ?? null;
