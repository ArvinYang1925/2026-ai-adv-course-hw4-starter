const {
  COUPON_ERRORS,
  CouponError,
  normalizeCouponCode,
  applyCoupon
} = require('../src/utils/coupon');

function expectCouponError(fn, code) {
  let caught;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(CouponError);
  expect(caught.code).toBe(code);
}

describe('Coupon module', () => {
  describe('未使用優惠碼', () => {
    it.each([undefined, null, '', '   '])('couponCode 為 %j 時不折扣', (code) => {
      expect(applyCoupon({ code, subtotal: 1000 })).toEqual({
        couponCode: null,
        discount: 0,
        discountedSubtotal: 1000
      });
    });
  });

  describe('FLOWER100：滿 800 折 100', () => {
    it.each([
      [800, 100, 700],
      [1600, 100, 1500]
    ])('商品小計 %i 元折抵 %i 元，折後 %i 元', (subtotal, discount, discountedSubtotal) => {
      expect(applyCoupon({ code: 'FLOWER100', subtotal })).toEqual({
        couponCode: 'FLOWER100',
        discount,
        discountedSubtotal
      });
    });

    it('商品小計 799 元未達門檻', () => {
      expectCouponError(
        () => applyCoupon({ code: 'FLOWER100', subtotal: 799 }),
        COUPON_ERRORS.MIN_SUBTOTAL_NOT_MET
      );
    });
  });

  describe('SPRING10：9 折、四捨五入、最多折 300', () => {
    it.each([
      [1000, 100],
      [1234, 123],
      [1235, 124],
      [3000, 300],
      [3500, 300],
      [5, 1],
      [4, 0]
    ])('商品小計 %i 元折抵 %i 元', (subtotal, discount) => {
      const result = applyCoupon({ code: 'SPRING10', subtotal });
      expect(result.discount).toBe(discount);
      expect(result.discountedSubtotal).toBe(subtotal - discount);
    });
  });

  it('SUMMER50 已失效', () => {
    expectCouponError(
      () => applyCoupon({ code: 'SUMMER50', subtotal: 1000 }),
      COUPON_ERRORS.EXPIRED
    );
  });

  it.each(['NOT-A-COUPON', 'FLOWER', 'toString', '__proto__'])('不存在的優惠碼 %s 無效', (code) => {
    expectCouponError(
      () => applyCoupon({ code, subtotal: 1000 }),
      COUPON_ERRORS.INVALID
    );
  });

  it('優惠碼不分大小寫並去除前後空白，記錄為大寫', () => {
    expect(applyCoupon({ code: ' flower100 ', subtotal: 800 }).couponCode).toBe('FLOWER100');
    expect(applyCoupon({ code: 'Spring10', subtotal: 1000 }).couponCode).toBe('SPRING10');
  });

  it.each([123, true, ['FLOWER100'], { code: 'FLOWER100' }])('非字串的 couponCode %j 拋出 TypeError', (code) => {
    expect(() => normalizeCouponCode(code)).toThrow(TypeError);
    expect(() => applyCoupon({ code, subtotal: 1000 })).toThrow(TypeError);
  });

  it.each([-1, 1.5, NaN, '1000'])('subtotal 為 %j 時拋出 TypeError', (subtotal) => {
    expect(() => applyCoupon({ code: 'FLOWER100', subtotal })).toThrow(TypeError);
  });
});
