import { z } from 'zod';

/** IPv4 或 IPv6 字串；用於 IP 黑白名單的 body 與 path 參數 */
export const ipSchema = z.union([z.ipv4(), z.ipv6()], {
  error: '請輸入合法的 IPv4 或 IPv6 位址',
});
