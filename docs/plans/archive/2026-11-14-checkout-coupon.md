# 2026-11-14 結帳優惠碼

> Issue #1。已完成，已移至 archive。

## User Story
作為會員，我希望結帳時能輸入一組優惠碼折抵商品金額，以便享有促銷優惠。

## Spec
### API 規格
- `POST /api/orders`（JWT）：新增選填 `couponCode`（string，不分大小寫）
  - 201 回應 `data` 新增 `discount`（未使用為 0）、`coupon_code`（大寫，未使用為 null）
  - 400：`VALIDATION_ERROR`（非字串）、`COUPON_INVALID`、`COUPON_EXPIRED`、`COUPON_MIN_SUBTOTAL_NOT_MET`
- `GET /api/orders/:id`、`GET /api/admin/orders/:id`：回傳 `discount`、`coupon_code`

### 資料庫變更
- `orders` 新增 `discount INTEGER NOT NULL DEFAULT 0 CHECK(discount >= 0)`、`coupon_code TEXT`
- 以可重複執行的 migration 新增，舊訂單回填 0 / NULL；`total_amount` 不變

### 業務規則
| 優惠碼 | 折扣 | 條件 |
|---|---|---|
| FLOWER100 | 折 100 | 小計滿 800 |
| SPRING10 | 9 折，最多折 300 | 無門檻 |
| SUMMER50 | 折 50 | 已失效 |

- 每張訂單最多 1 組；只折抵商品小計，不折抵運費
- 免運門檻（1,500）以折扣後小計判斷
- 折扣四捨五入至整數，不超過小計
- `total_amount = subtotal - discount + shipping_fee`
- 優惠碼錯誤在 transaction 前回 400：不建立訂單、不扣庫存、不清空購物車

## Tasks
- [x] `src/utils/coupon.js` 純邏輯模組
- [x] `orders` 欄位 migration
- [x] `POST /api/orders` 套用優惠碼、以折扣後小計計算運費、寫入快照
- [x] 回應與 JSDoc / `openapi.json`
- [x] 前台、後台訂單詳情顯示折扣列
- [x] `tests/coupon.test.js` 單元測試、Integration Test（持久化、綠界金額、無效優惠碼不寫入）
- [x] `npm run test:acceptance -- coupon` 全數通過（未修改驗收測試）
- [x] 更新 FEATURES、ARCHITECTURE、TESTING、CHANGELOG
