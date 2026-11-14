# AI Review：訂單 / 付款 / 運費 / 購物車

- 日期：2026-11-14
- 範圍：`src/routes/{orderRoutes,cartRoutes,adminOrderRoutes,pageRoutes}.js`、`src/services/{orderService,paymentService}.js`、`src/utils/{shipping,ecpay,validators}.js`、`src/middleware/*`、`src/database.js`、`app.js`，以及對應的 unit / integration / acceptance 測試與 Vitest / Playwright / CI 設定
- 方式：
  - `security-reviewer`（唯讀）負責安全審查
  - `code-reviewer`（唯讀）負責業務邏輯、規格與測試完整性
  - `test-runner` 執行 `test:unit` 和 `test:integration`
  - 主對話逐項對照原始碼抽查，並用記憶體 SQLite 實測有疑問的行為
- 本階段**只記錄問題，未修改任何程式碼**

> 來源標記：`SEC` = security-reviewer、`CR` = code-reviewer、`TR` = test-runner。「已驗證」= 主對話已讀原始碼確認，或實際執行確認。

---

## 1. 測試執行結果

| 指令 | 通過 | 失敗 | 跳過 |
|---|---|---|---|
| `npm run test:unit` | 54 | 0 | **1** |
| `npm run test:integration` | 10 | 0 | 0 |

- 首次執行時專案沒有 `node_modules`，測試無法啟動。已用 `npm ci` 依 `package-lock.json` 安裝後重跑。
- `npm ci` 的稽核回報 **18 個套件弱點（2 critical、6 high、10 moderate）**，尚未逐一評估，見 L-6。
- 沒有執行 `test:e2e`（會寫入開發 DB 並連綠界 staging），也沒有執行 `test:acceptance`（驗收題尚未實作，預期失敗）。
- 全綠**不代表**邏輯正確：被跳過的那一個測試正好遮住了 H-1 的 bug。

---

## 2. 問題總覽

| ID | 嚴重度 | 標題 | 位置 | 來源 | 狀態 |
|---|---|---|---|---|---|
| H-1 | High | 免運門檻用 `>` 而非 `>=`，邊界測試被 `it.skip` 掩蓋 | `src/utils/shipping.js:40`、`tests/shipping.test.js:29` | CR、TR | 已驗證 |
| H-2 | High | 訂單詳情 IDOR：任何會員可讀取他人訂單 | `src/routes/orderRoutes.js:350` | SEC、CR | 已驗證 |
| H-3 | High | 購物車 PATCH 數量沒有驗證正整數 | `src/routes/cartRoutes.js:296-315` | SEC、CR | 已驗證（實測） |
| M-1 | Medium | 綠界查詢結果缺 `CheckMacValue` 時跳過驗簽，且沒有比對 `MerchantID` | `src/services/paymentService.js:15` | SEC、CR | 已驗證 |
| M-2 | Medium | 綠界金鑰與管理員帳密有寫死的 fallback | `src/utils/ecpay.js:4-6`、`src/database.js:116-117` | SEC | 已驗證 |
| M-3 | Medium | 付款頁 `/ecpay/payment/:orderId` 沒有登入驗證與擁有者檢查 | `src/routes/pageRoutes.js:61-72` | SEC | 已驗證 |
| M-4 | Medium | `ReturnURL` 指向不存在的 `/ecpay/notify` | `src/utils/ecpay.js:114` | SEC | 已驗證 |
| M-5 | Medium | pending / failed 訂單永久佔用庫存，沒有取消、逾期或回補機制 | `src/services/orderService.js:67-112` | SEC、CR | 已驗證 |
| M-6 | Medium | 庫存檢查在 transaction 外，庫存不足時 DB CHECK 拋錯變成 500 | `src/routes/orderRoutes.js:167`、`src/services/orderService.js:86` | CR | 已驗證 |
| M-7 | Medium | 角色取自 JWT 內容而非 DB，token 7 天有效且無法撤銷 | `src/middleware/authMiddleware.js:18-31` | SEC | 已驗證 |
| M-8 | Medium | `GET /api/orders` 沒有分頁 | `src/services/orderService.js:29-35` | CR | 已驗證 |
| L-1 | Low | `X-Session-Id` 由客戶端自選，沒有格式或強度要求 | `src/middleware/sessionMiddleware.js` | SEC | 未逐行驗證 |
| L-2 | Low | 沒有 rate limit、helmet，收件欄位沒有長度上限，登入有時間差可探測帳號 | `app.js`、`src/routes/orderRoutes.js:114-132` | SEC、CR | 未逐行驗證 |
| L-3 | Low | 購物車 PATCH 時商品已被刪除會拋 TypeError（500） | `src/routes/cartRoutes.js:310-311` | CR | 已驗證 |
| L-4 | Low | `markOrderPaid` / mock pay 的 `changes` 結果被忽略，併發時訊息不準確 | `src/routes/orderRoutes.js:433-523` | CR | 未逐行驗證 |
| L-5 | Low | `order_items.quantity` 沒有 `CHECK(quantity > 0)` | `src/database.js` order_items | CR | 已驗證 |
| L-6 | Low | npm audit：18 個依賴弱點 | `package-lock.json` | 主對話 | 待評估 |
| N-x | Nit | 其他細節（見第 6 節） | — | CR、SEC | — |

---

## 3. High

### H-1 免運門檻邊界錯誤，且測試被跳過掩蓋

- **位置**：`src/utils/shipping.js:40`

  ```js
  return subtotal > SHIPPING_RATES.FREE_SHIPPING_THRESHOLD; // 1500
  ```

- **規格**：「滿 1,500 免運」，見 `docs/FEATURES.md:232`、`views/pages/checkout.ejs:84`。`tests/orders.test.js:48` 的期望也是 `>= 1500`。
- **失敗情境**：小計剛好 1,500 元、宅配 → 實際運費 120、總額 1,620；規格應為運費 0、總額 1,500。顧客被多收 120 元。
- **測試完整性問題**：
  - `tests/shipping.test.js:29` 的 `it.skip('商品小計 1,500 元時免基本運費')` 斷言是正確的；錯的是程式，測試卻被跳過。
  - 種子商品沒有剛好 1,500 元的價格，所以 `orders.test.js` 也抓不到。
- **建議**：改成 `>=`；取消 `it.skip`；補一個訂單層級小計 = 1,500 的測試。

### H-2 訂單詳情 IDOR

- **位置**：`src/routes/orderRoutes.js:350`

  ```js
  router.get('/:id', (req, res) => {
    const order = findOrderById(req.params.id); // 沒有 user_id 條件
  ```

  同檔的 `/pay`、`/check-payment` 都正確使用了 `findOrderForUser`。
- **攻擊情境**：會員 B 用自己的 token 呼叫 `GET /api/orders/<A 的訂單 id>`，回應 200，內容含 A 的姓名、Email、地址、金額與品項。訂單 id 是 UUID，但它出現在 `/ecpay/payment/:orderId`、`/orders/:id` 等網址中，不是機密。
- **建議**：改用 `findOrderForUser(req.params.id, req.user.userId)`，查不到一律回 404。補一個「B 讀取 A 的訂單 → 404」測試。

### H-3 購物車 PATCH 數量沒有驗證正整數

- **位置**：`src/routes/cartRoutes.js:296-315`。PATCH 只做 `Number(quantity)` 與 `isNaN` 檢查；POST 則使用 `parsePositiveInteger`，兩者不一致。
- **實測結果**（`cart_items.quantity INTEGER CHECK(quantity > 0)`，better-sqlite3）：

  | 輸入 | 結果 |
  |---|---|
  | `-5`、`0`、`""`、`null`、`false` | 通過 JS 檢查 → `SQLITE_CONSTRAINT_CHECK` → errorHandler 回 **500**（應為 400） |
  | `1.5`、`0.001` | **成功寫入**，以 REAL 型別存放 |
  | `true`、`"1e1"`、`[5]` | 被 `Number()` 轉成數字後接受 |

  > code-reviewer 原本認為負數會寫入並讓庫存增加。實測後確認 DB CHECK 會擋下負數與 0，所以修正為 500 問題；小數寫入則屬實。

- **影響**：
  - 小數數量讓結帳時 `subtotal = price × 0.001`（`orderRoutes.js:178`），訂單金額變成小數或接近 0。
  - 庫存被扣成小數。
  - `total_amount` 的整數語意被破壞，`isTradePaid` 的 `TradeAmt` 比對也因此失準。
- **建議**：改用 `parsePositiveInteger`，非法值回 400；設定合理上限；`createOrderFromCart` 也防禦性檢查數量為正整數。補 PATCH 的 0、負數、小數、字串、null 測試。

---

## 4. Medium

### M-1 綠界查詢結果的驗簽是選擇性的

- **位置**：`src/services/paymentService.js:15`

  ```js
  if (tradeInfo.CheckMacValue && !verifyCheckMacValue(...)) throw ...
  ```

- **問題**：回應沒有 `CheckMacValue` 欄位時直接略過驗簽，也沒有比對 `MerchantID`。目前資料來源是伺服器主動以 HTTPS 呼叫綠界，被偽造的難度高，但這是縱深防禦缺口；日後若加入 notify 回呼（見 M-4）並共用這個函式，就能被直接利用。
- **建議**：`if (!tradeInfo.CheckMacValue || !verify(...)) throw`，並加上 `tradeInfo.MerchantID !== config.merchantId` 檢查。現有整合測試（`order-checkout.integration.test.js:428`）只測了錯誤簽章，要補「缺少 CheckMacValue」與「MerchantID 不符」。

### M-2 寫死的金鑰與管理員帳密 fallback

- **位置**：
  - `src/utils/ecpay.js:4-6`：缺少環境變數時，`MerchantID`、`HashKey`、`HashIV` 會退回公開的 staging 測試值。
  - `src/database.js:116-117`：管理員帳密預設為 `admin@hexschool.com` / `12345678`。
- **風險**：
  - 正式環境漏設環境變數時，預設帳密可直接登入後台。
  - `ECPAY_ENV=production` 但漏設金鑰時，會使用公開的 HashKey，任何人都能偽造簽章。
- **建議**：比照 `server.js` 對 `JWT_SECRET` 的做法，`NODE_ENV=production` 時缺少這些變數就拒絕啟動。

### M-3 付款表單頁沒有身分驗證

- **位置**：`src/routes/pageRoutes.js:61-72`。`/ecpay/payment/:orderId` 只用 `findOrderById`。
- **風險**：知道 orderId 的任何人都能取得付款表單，內容含金額、品項名稱與 `merchant_trade_no`。輸出已做 HTML 跳脫，沒有 XSS 問題。
- **建議**：加上登入驗證與擁有者檢查。頁面路由的認證方式和 API 不同，需要先確定設計。

### M-4 `ReturnURL` 指向不存在的路由

- **位置**：`src/utils/ecpay.js:114` 設定 `ReturnURL: baseUrl + '/ecpay/notify'`，但專案中沒有這個路由，只有一個測試字串提到它。
- **影響**：付款確認完全依賴使用者自行觸發 `check-payment`。綠界的伺服器端通知會收到 404。
- **建議**：實作 notify 端點時，必須強制驗證 `CheckMacValue`、`MerchantID`、`TradeAmt`、`MerchantTradeNo`，可沿用已具冪等性的 `markOrderPaid`（`WHERE status='pending'`），並回應綠界要求的 `1|OK`。

### M-5 訂單永久佔用庫存

- **問題**：建單當下就扣庫存，但沒有以下任何機制：
  - 取消訂單（acceptance 的 cancel-order 尚未實作）
  - pending 訂單逾期失效
  - failed 訂單回補庫存
- **風險**：攻擊者註冊多個帳號、下單不付款，就能把熱門商品庫存佔滿（庫存 DoS）。
- **建議**：實作取消功能，在同一個 transaction 內以 `WHERE status='pending'` 更新狀態並回補庫存；加上逾期自動 failed 與回補；限制每位會員的 pending 訂單數。

### M-6 庫存檢查在 transaction 外，例外變成 500

- **位置**：`findInsufficientItems` 在 `orderRoutes.js:167` 執行，transaction 內的 `updateStock`（`orderService.js:98`）沒有 `WHERE stock >= ?`，也沒有檢查 `changes`；`POST /api/orders` 的建單呼叫沒有 try/catch。
- **影響**：better-sqlite3 是同步 API，在單一 process 中幾乎不會發生競爭，DB 的 `CHECK(stock >= 0)` 也確保不會超賣。但多 process 部署時，庫存不足會變成 500 `INTERNAL_ERROR`，而不是 400 `STOCK_INSUFFICIENT`。
- **建議**：改用 `UPDATE ... WHERE id = ? AND stock >= ?` 並檢查 `changes`，不足時拋出自訂錯誤，由路由轉成 400。

### M-7 角色信任 JWT 內容

- **位置**：`src/middleware/authMiddleware.js:18-31`。只用 `SELECT id` 確認使用者存在，`role` 直接採用 token 裡的值；token 有效期 7 天，沒有撤銷機制。
- **風險**：管理員被降權或帳號外洩後，舊 token 在最長 7 天內仍保有 admin 權限。
- **建議**：改成 `SELECT id, role`，以 DB 的值為準；縮短 token 效期。

### M-8 會員訂單列表沒有分頁

- **位置**：`listOrdersForUser`（`orderService.js:29-35`）沒有 LIMIT。這與 acceptance 的 Issue C（order-filter：狀態篩選與分頁）重疊，實作 Issue C 時一併處理。

---

## 5. Low

- **L-1**：`X-Session-Id` 可以是任意字串。訪客如果使用可預測的值，別人帶同樣的 header 就能操作他的購物車；登入時的 `mergeGuestCart` 也可能把別人的訪客購物車併入自己帳號（未逐行驗證）。建議限制為 UUID 格式，最好改由伺服器簽發。
- **L-2**：
  - 沒有 rate limit 與 helmet。
  - 收件人姓名、Email、地址沒有長度上限，Email 驗證的 regex 也很寬鬆。
  - 登入時帳號不存在就不跑 bcrypt，回應時間的差異可用來探測帳號是否存在。
- **L-3**：購物車 PATCH 時，若商品已被後台刪除，`product` 會是 `undefined`，`product.stock` 拋出 TypeError，回 500；應回 404。
- **L-4**：付款狀態更新的 `changes` 結果被忽略。資料狀態不會倒退，只是回應訊息可能不準確。
- **L-5**：`order_items.quantity` 沒有 CHECK 約束，DB 層無法擋下 H-3 的小數或異常值。
- **L-6**：`npm ci` 回報 18 個依賴弱點（2 critical、6 high、10 moderate），需執行 `npm audit` 評估哪些實際影響執行環境。

---

## 6. Nit

- `src/routes/adminOrderRoutes.js:91-92`：`parseInt` 沒有指定 radix；`page` 沒有上限。
- `src/routes/adminOrderRoutes.js:100`：`status` 為非法值時靜默忽略篩選，回傳全部訂單，而不是 400；建議與 Issue C 的篩選行為對齊。
- `src/routes/cartRoutes.js:9-47`：`dualAuth` 定義在路由檔內，不在 `src/middleware/`。
- `generateOrderNo` 的隨機部分只有 5 碼；`order_no` 有 UNIQUE 約束，碰撞時會變成 500。
- OpenAPI 的 `GET /api/orders` schema 沒有列出 `is_remote_area`、`is_express`。
- `public/js/header-init.js:26` 的 `innerHTML` 若包含使用者名稱，需要確認有跳脫（待確認）。

---

## 7. 測試完整性

| 檢查項目 | 結果 |
|---|---|
| 被跳過的測試 | **有**：`tests/shipping.test.js:29` `it.skip`，掩蓋 H-1 |
| `.only` / `.todo` / `xit` / `xdescribe` / `skipIf` | 沒有 |
| 被註解掉的 `expect` / `it` | 沒有 |
| 斷言被放寬 | 沒有；`toBeDefined`、`toBeTruthy`、`toBeGreaterThan(0)` 的用法都合理 |
| 測試數量 | unit 為 55 項（含 1 skip），與 `docs/TESTING.md` 的「7 個檔案、55 項」一致；integration 為 10 項，一致 |
| Vitest 設定 | include / exclude 與文件一致，沒有用 timeout 排除測試；三份設定都使用記憶體 DB |
| Playwright | 沒有設定 `webServer`，符合規範 |
| CI | 只跑 unit 與 integration，符合規範 |
| acceptance 是否被修改以配合實作 | 沒有 git 歷史可比對（只有 initial commit）；三個驗收功能都尚未實作 |

### 缺少的測試

- B 讀取 A 的訂單詳情 → 404（H-2）；B 對 A 的訂單呼叫 `/pay`、`/check-payment`（程式已正確，但沒有測試）
- 購物車 PATCH 的 0、負數、小數、字串、null（H-3）
- 小計剛好 1,500 的運費與訂單測試（H-1）
- 綠界查詢結果缺少 `CheckMacValue`、`MerchantID` 不符（M-1）
- 訪客 A 的 session 操作訪客 B 的購物車項目
- admin 路由：未登入回 401、一般會員回 403 的完整覆蓋

---

## 8. 已確認沒有問題的部分

- 建單 transaction 的順序正確：建立訂單 → 品項快照 → 扣庫存 → 清空購物車（`orderService.js:86-109`）。
- `POST /api/orders` 只接受 JWT，無法用 `X-Session-Id` 繞過。
- dualAuth：帶了無效的 Bearer token 時直接回 401，不會降級成訪客 session。
- 購物車 GET、PATCH、DELETE 都有擁有者條件；動態欄位名稱只可能是程式內寫死的值，沒有注入風險。
- 所有金額（小計、運費、總額）都由伺服器計算，body 不接受價格。
- JWT 固定使用 HS256，secret 沒有 fallback，缺少時拒絕啟動。
- 註冊時 `role` 固定寫入 `'user'`，沒有 mass assignment。
- 回應不包含 `password_hash`。
- 所有 SQL 都使用參數綁定；ORDER BY 是固定字串。
- `markOrderPaid` 與 mock pay 都以 `status='pending'` 為條件，具冪等性；mock pay 只在 test 環境開放。
- `verifyCheckMacValue` 使用 `timingSafeEqual`。
- EJS 沒有用 `<%-` 輸出使用者資料。
- 回應格式 `{ data, error, message }` 一致；errorHandler 遇到 5xx 不洩漏內部細節。

---

## 9. 非缺陷備註

acceptance 的 coupon、cancel-order、order-filter 三個驗收功能尚未實作，`npm run test:acceptance` 預期會失敗（`docs/TESTING.md:48`）。實作時**不得修改 `tests/acceptance/*`**。

## 10. 建議修正順序

1. **H-1**：修正 `>=` 並取消 `it.skip`（改動最小、直接影響金額）
2. **H-2**：IDOR
3. **H-3**：PATCH 數量驗證，並加上 L-5 的 DB 約束
4. **M-1、M-2**：金流驗簽與正式環境設定檢查
5. **M-5、M-8**：與 acceptance 的 cancel-order、order-filter 一起實作
6. 其餘 Medium / Low 與測試缺口
