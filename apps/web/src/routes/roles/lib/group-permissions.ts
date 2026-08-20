/**
 * 把 GET /api/roles/permissions 回的扁平陣列依 platform → module 分組
 * 並提供「EDIT 蘊含 VIEW」的判斷 helper 供 PermissionsField 使用
 */

/**
 * 與 @app/api-client 產生型別對齊（所有欄位 optional），helper 內部會 skip 不完整資料
 */
export type PermissionItem = {
  permissionCode?: string;
  name?: string;
  platform?: string;
  module?: string;
  action?: string;
};

/** ModuleGroup 內保證有 permissionCode；name 仍可能 undefined（後端少回時顯示用 fallback） */
export type ResolvedPermission = {
  permissionCode: string;
  name: string | undefined;
};

export type ModuleGroup = {
  module: string;
  view?: ResolvedPermission;
  edit?: ResolvedPermission;
};

export type PlatformGroup = {
  platform: string;
  modules: ModuleGroup[];
};

/**
 * 將扁平 permissions 陣列分組成 platform → module 結構
 * 同 module 的 VIEW / EDIT 收斂到同一個 ModuleGroup 內
 */
export const groupPermissions = (
  items: readonly PermissionItem[],
): PlatformGroup[] => {
  // platform -> module -> ModuleGroup
  const map = new Map<string, Map<string, ModuleGroup>>();
  for (const item of items) {
    // 必要欄位缺失就 skip（理論上後端不會少回，僅型別安全保險）
    if (!item.permissionCode || !item.platform || !item.module || !item.action)
      continue;
    if (!map.has(item.platform)) map.set(item.platform, new Map());
    const moduleMap = map.get(item.platform)!;
    if (!moduleMap.has(item.module)) {
      moduleMap.set(item.module, { module: item.module });
    }
    const group = moduleMap.get(item.module)!;
    const resolved: ResolvedPermission = {
      permissionCode: item.permissionCode,
      name: item.name,
    };
    if (item.action === 'VIEW') group.view = resolved;
    else if (item.action === 'EDIT') group.edit = resolved;
  }
  return Array.from(map.entries()).map(([platform, moduleMap]) => ({
    platform,
    modules: Array.from(moduleMap.values()).sort((a, b) =>
      a.module.localeCompare(b.module),
    ),
  }));
};

/**
 * 判斷某 module 的 VIEW 是否因 EDIT 已勾而被鎖
 * 用於 PermissionsField：EDIT 勾選時 VIEW checkbox disabled + 仍勾選
 */
export const isViewLockedByEdit = (
  group: ModuleGroup,
  selected: ReadonlySet<string>,
): boolean => {
  // 只有當同 module 同時有 VIEW 與 EDIT 兩個 permission 時才適用「鎖定」規則
  if (!group.view || !group.edit) return false;
  return selected.has(group.edit.permissionCode);
};
