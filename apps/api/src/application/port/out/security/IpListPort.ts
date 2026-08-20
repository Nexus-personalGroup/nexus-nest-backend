export const IP_LIST_PORT = 'IP_LIST_PORT';

export interface ListIpParams {
  page: number;
  limit: number;
  /** IP 模糊（contains）；trim 後若空字串視為未提供 */
  search?: string;
}

export interface ListIpResult<T> {
  list: T[];
  total: number;
}

export interface IpListItem {
  id: string;
  ipAddress: string;
  description?: string | null;
  createdBy?: string | null;
  createdAt: Date;
}

export interface IpBlacklistItem {
  id: string;
  ipAddress: string;
  reason?: string | null;
  isAutoBlock: boolean;
  createdBy?: string | null;
  createdAt: Date;
}

export interface IpListPort {
  /** 檢查 IP 是否在白名單中（middleware / guard 用） */
  isWhitelisted(ip: string): Promise<boolean>;

  /** 檢查 IP 是否在黑名單中（middleware / guard 用） */
  isBlacklisted(ip: string): Promise<boolean>;

  /**
   * 新增 IP 到白名單，回新建（或既有）紀錄的 id
   */
  addToWhitelist(
    ip: string,
    description?: string,
    createdBy?: string,
  ): Promise<{ id: string }>;

  /**
   * 新增 IP 到黑名單，回新建（或既有）紀錄的 id
   */
  addToBlacklist(
    ip: string,
    reason?: string,
    isAutoBlock?: boolean,
    createdBy?: string,
  ): Promise<{ id: string }>;

  /** 從白名單移除指定 id 的紀錄（不存在時靜默通過，硬刪） */
  removeWhitelist(id: string): Promise<void>;

  /** 從黑名單移除指定 id 的紀錄（不存在時靜默通過，硬刪） */
  removeBlacklist(id: string): Promise<void>;

  /** 分頁查詢白名單 + IP 模糊搜尋 */
  listWhitelist(params: ListIpParams): Promise<ListIpResult<IpListItem>>;

  /** 分頁查詢黑名單 + IP 模糊搜尋 */
  listBlacklist(params: ListIpParams): Promise<ListIpResult<IpBlacklistItem>>;

  /** 取單筆白名單；null = 找不到 */
  findWhitelistById(id: string): Promise<IpListItem | null>;

  /** 取單筆黑名單；null = 找不到 */
  findBlacklistById(id: string): Promise<IpBlacklistItem | null>;

  /**
   * 更新白名單可變欄位（目前僅 description）
   * @throws IpListNotFoundException - 該 id 不存在時拋出
   */
  updateWhitelist(id: string, data: { description?: string }): Promise<void>;

  /**
   * 更新黑名單可變欄位（目前僅 reason）
   * @throws IpListNotFoundException - 該 id 不存在時拋出
   */
  updateBlacklist(id: string, data: { reason?: string }): Promise<void>;
}
