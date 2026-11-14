// Checkout coupon rules. Coupons only discount the product subtotal, never shipping.

const COUPON_TYPES = Object.freeze({
  FIXED: 'fixed',
  PERCENT: 'percent'
});

const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({ type: COUPON_TYPES.FIXED, amount: 100, minSubtotal: 800, active: true }),
  SPRING10: Object.freeze({ type: COUPON_TYPES.PERCENT, percentOff: 10, maxDiscount: 300, minSubtotal: 0, active: true }),
  SUMMER50: Object.freeze({ type: COUPON_TYPES.FIXED, amount: 50, minSubtotal: 0, active: false })
});

const COUPON_ERRORS = Object.freeze({
  INVALID: 'COUPON_INVALID',
  EXPIRED: 'COUPON_EXPIRED',
  MIN_SUBTOTAL_NOT_MET: 'COUPON_MIN_SUBTOTAL_NOT_MET'
});

class CouponError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CouponError';
    this.code = code;
  }
}

/**
 * Normalize a coupon code input. Returns null when no coupon was given
 * (undefined, null or a blank string); throws TypeError for non-strings.
 */
function normalizeCouponCode(code) {
  if (code === undefined || code === null) {
    return null;
  }
  if (typeof code !== 'string') {
    throw new TypeError('couponCode 必須為字串');
  }
  const normalized = code.trim().toUpperCase();
  return normalized === '' ? null : normalized;
}

function calculateDiscount(coupon, subtotal) {
  // Integer math keeps rounding exact: 1234 * 10 / 100 = 123.4 → 123
  const raw = coupon.type === COUPON_TYPES.PERCENT
    ? Math.round((subtotal * coupon.percentOff) / 100)
    : coupon.amount;
  const capped = coupon.maxDiscount === undefined ? raw : Math.min(raw, coupon.maxDiscount);
  // A discount can never exceed the subtotal it applies to
  return Math.min(capped, subtotal);
}

/**
 * Apply a coupon to a product subtotal.
 * Returns { couponCode, discount, discountedSubtotal }; couponCode is null and
 * discount is 0 when no coupon was given. Throws CouponError when the coupon
 * is unknown, inactive, or the subtotal is below its threshold.
 */
function applyCoupon({ code, subtotal }) {
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負整數');
  }

  const couponCode = normalizeCouponCode(code);
  if (couponCode === null) {
    return Object.freeze({ couponCode: null, discount: 0, discountedSubtotal: subtotal });
  }

  if (!Object.prototype.hasOwnProperty.call(COUPONS, couponCode)) {
    throw new CouponError(COUPON_ERRORS.INVALID, '優惠碼無效');
  }

  const coupon = COUPONS[couponCode];
  if (!coupon.active) {
    throw new CouponError(COUPON_ERRORS.EXPIRED, '優惠碼已失效');
  }

  if (subtotal < coupon.minSubtotal) {
    throw new CouponError(
      COUPON_ERRORS.MIN_SUBTOTAL_NOT_MET,
      `商品小計未滿 ${coupon.minSubtotal.toLocaleString('en-US')} 元，無法使用此優惠碼`
    );
  }

  const discount = calculateDiscount(coupon, subtotal);
  return Object.freeze({ couponCode, discount, discountedSubtotal: subtotal - discount });
}

module.exports = {
  COUPONS,
  COUPON_ERRORS,
  CouponError,
  normalizeCouponCode,
  applyCoupon
};
