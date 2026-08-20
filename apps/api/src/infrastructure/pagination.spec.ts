import { getPagination, buildPaginationMeta } from './pagination';

jest.mock('./validate-env', () => ({
  getEnv: () => ({ DEFAULT_PAGE_LIMIT: 15 }),
}));

describe('pagination', () => {
  describe('getPagination', () => {
    it('未給值 → page=1、limit=預設、offset=0', () => {
      expect(getPagination({})).toEqual({ page: 1, limit: 15, offset: 0 });
    });

    it('第 3 頁 → offset=(page-1)*limit', () => {
      expect(getPagination({ page: 3, limit: 10 })).toEqual({
        page: 3,
        limit: 10,
        offset: 20,
      });
    });

    it('字串輸入 → 正確解析', () => {
      expect(getPagination({ page: '2', limit: '20' })).toEqual({
        page: 2,
        limit: 20,
        offset: 20,
      });
    });

    it('page<1 → 夾回 1；limit 超過 maxLimit → 夾到上限', () => {
      expect(getPagination({ page: 0, limit: 999 })).toEqual({
        page: 1,
        limit: 100,
        offset: 0,
      });
    });

    it('customLimit 作為未指定 limit 時的預設', () => {
      expect(getPagination({}, 50)).toEqual({
        page: 1,
        limit: 50,
        offset: 0,
      });
    });
  });

  describe('buildPaginationMeta', () => {
    it('totalPages 向上取整', () => {
      expect(buildPaginationMeta(1, 10, 25)).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('total=0 → totalPages 至少 1', () => {
      expect(buildPaginationMeta(1, 10, 0).totalPages).toBe(1);
    });
  });
});
