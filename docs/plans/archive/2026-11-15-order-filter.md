# 2026-11-15 我的訂單篩選與分頁

> Issue #3。已完成，已移至 archive。

## User Story
作為會員，我希望查詢自己的訂單時能依狀態篩選並分頁，以便快速找到特定訂單。

## Spec
### API 規格
- `GET /api/orders`（JWT）
  - Query：`status`（`pending`/`paid`/`failed`，選填）、`page`（正整數，預設 1）、`limit`（正整數，預設 10，超過 50 以 50 計）
  - 200：`{ data: { orders: [...], pagination: { page, limit, total, totalPages } }, error: null, message }`
  - 400 `VALIDATION_ERROR`：`status` 不在允許值內，或 `page`、`limit` 不是正整數

### 資料庫變更
- 無

### 業務規則
- 只回傳自己的訂單，依 `created_at` 由新到舊；`created_at` 精度為秒，同秒以 `rowid DESC` 決定先後，確保換頁穩定
- `page` 過大導致 OFFSET 超出安全整數範圍時回 400
- 前端訂單頁沿用 `data.orders`，篩選與分頁 UI 不在本次範圍

## Tasks
- [x] `src/utils/orderListQuery.js`：參數驗證、預設值、上限與分頁資訊
- [x] `listOrdersForUser` 支援 status / page / limit 並回傳 total
- [x] `GET /api/orders` 路由、JSDoc 與 `openapi.json`
- [x] `tests/orderListQuery.test.js` 單元測試、`orders.test.js` API 測試、同秒訂單換頁 Integration Test
- [x] `npm run test:acceptance -- order-filter` 全數通過（未修改驗收測試）
- [x] 更新 FEATURES、ARCHITECTURE、TESTING、CHANGELOG
