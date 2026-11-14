const {
  ORDER_LIST_LIMITS,
  parseOrderListQuery,
  buildPagination
} = require('../src/utils/orderListQuery');

describe('Order list query module', () => {
  describe('預設值', () => {
    it('不帶參數時為第 1 頁、每頁 10 筆、不篩選狀態', () => {
      expect(parseOrderListQuery({})).toEqual({ value: { status: null, page: 1, limit: 10 } });
      expect(parseOrderListQuery()).toEqual({ value: { status: null, page: 1, limit: 10 } });
    });
  });

  describe('status', () => {
    it.each(['pending', 'paid', 'failed'])('接受 %s', (status) => {
      expect(parseOrderListQuery({ status }).value.status).toBe(status);
    });

    it.each(['unknown', '', 'PAID', 'cancelled', ['paid']])('拒絕 %j', (status) => {
      expect(parseOrderListQuery({ status })).toHaveProperty('error');
    });
  });

  describe('page 與 limit', () => {
    it('接受正整數字串', () => {
      expect(parseOrderListQuery({ page: '3', limit: '5' }).value).toEqual({ status: null, page: 3, limit: 5 });
    });

    it.each([
      ['50', 50],
      ['51', 50],
      ['100', 50]
    ])('limit=%s 時以 %i 計', (limit, expected) => {
      expect(parseOrderListQuery({ limit }).value.limit).toBe(expected);
    });

    it('上限常數為 50', () => {
      expect(ORDER_LIST_LIMITS.MAX_LIMIT).toBe(50);
    });

    it.each(['0', '-1', '1.5', 'abc', '', ' 2', '1e2', ['1', '2']])('page=%j 回傳錯誤', (page) => {
      expect(parseOrderListQuery({ page })).toHaveProperty('error');
    });

    it.each(['0', '-1', '1.5', 'abc', '', ['10']])('limit=%j 回傳錯誤', (limit) => {
      expect(parseOrderListQuery({ limit })).toHaveProperty('error');
    });

    it('超出安全整數範圍的 page 回傳錯誤，不會產生非整數的 OFFSET', () => {
      expect(parseOrderListQuery({ page: '99999999999999999999' })).toHaveProperty('error');
      expect(parseOrderListQuery({ page: String(Number.MAX_SAFE_INTEGER), limit: '50' })).toHaveProperty('error');
    });
  });

  describe('buildPagination', () => {
    it.each([
      [{ page: 1, limit: 10, total: 12 }, 2],
      [{ page: 3, limit: 5, total: 12 }, 3],
      [{ page: 1, limit: 10, total: 10 }, 1],
      [{ page: 1, limit: 10, total: 0 }, 0]
    ])('%j → totalPages %i', (input, totalPages) => {
      expect(buildPagination(input)).toEqual({ ...input, totalPages });
    });
  });
});
