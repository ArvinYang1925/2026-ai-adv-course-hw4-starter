---
name: work-issue
description: 依固定流程處理一個 GitHub Issue：確認標籤與作者 → 開分支 → 實作與測試 → test-runner 驗證 → 更新文件 → 開 PR → reviewer 審查 → 改標籤為 in-review 後停止。不合併 PR。以 /work-issue <編號> 呼叫。
argument-hint: <issue 編號>
---

# work-issue：處理 Issue #$ARGUMENTS

依下列步驟處理 Issue **#$ARGUMENTS**。每一步完成後才進入下一步；遇到「停止條件」時依「轉交人工」處理後立即停止。

## 標籤狀態機

| Label | 意義 | 由誰設定 |
|---|---|---|
| `ready` | 可交給 AI 處理 | 人 |
| `in-progress` | AI 正在處理 | 本 Skill（步驟 1） |
| `in-review` | PR 等待人工審核與合併 | 本 Skill（步驟 8） |
| `needs-human` | 需要人工介入 | 本 Skill（停止條件） |

換標籤一律「移除舊的 + 加上新的」，同一時間只保留一個流程標籤：
`gh issue edit <n> --remove-label <舊> --add-label <新>`

## 前置檢查

- `$ARGUMENTS` 必須是正整數；若為空或非數字，詢問使用者 Issue 編號後再開始。
- `gh auth status` 已登入；未登入就請使用者執行 `! gh auth login`，然後停止。
- 工作目錄乾淨（`git status --short` 為空）；有未提交的變更就停止，詢問使用者如何處理，不可自行 stash 或丟棄。
- 沒有 `node_modules` 時執行 `npm ci`（依 `package-lock.json`，不會改動受版控檔案）。

## 步驟

### 1. 讀 Issue、確認資格、改標籤

```bash
gh api user --jq .login
gh issue view <n> --json number,title,body,author,labels,state
```

以下全部成立才繼續，否則**停止**（不改任何標籤，只回報原因）：
- Issue 為 `OPEN`
- 帶有 `ready` 標籤
- `author.login` 等於目前 `gh` 登入的帳號（只處理使用者本人開的 Issue）

成立後：把 `ready` 改為 `in-progress`。

完整閱讀 Issue 的功能說明、規格、驗收條件與「不在本次範圍」，之後實作以此為準。

### 2. 從最新 main 開分支

```bash
git checkout main && git pull --ff-only origin main
git checkout -b issue-<n>-<名稱>
```

- `<名稱>` 為 Issue 標題的英文 kebab-case 簡稱（例：`issue-1-checkout-coupon`）。
- 分支已存在時不要覆蓋，改為停止並詢問使用者。

### 3. 實作並補上 Unit 或 Integration Test

先讀規範：`CLAUDE.md`、`docs/DEVELOPMENT.md`、`docs/ARCHITECTURE.md`、`docs/TESTING.md`，以及 Issue 對應的驗收測試（見步驟 4 對照表）。

實作原則：
- 業務規則（金額、折扣、狀態轉換）放 `src/utils/` 的無狀態模組；讀寫 DB 且共用的邏輯放 `src/services/`；路由只做驗證、呼叫與組合回應。
- API 回應統一 `{ data, error, message }`，錯誤時 `data: null`；欄位 snake_case。
- 金額一律整數、由伺服器計算，不接受前端傳入的金額。
- 錯誤情境（400 等）必須在 `db.transaction()` **之前**回傳，確保不寫入任何資料。
- DB 新欄位：同時更新 `CREATE TABLE` 與可重複執行的 migration（以 `PRAGMA table_info` 判斷），並規劃舊資料回填值；用記憶體 DB 模擬舊表確認 migration 可執行。
- 若新欄位會影響既有頁面的金額顯示（例如「小計 + 運費 ≠ 總計」），同步更新該頁面，維持畫面一致。
- 只做 Issue 範圍內的事；「不在本次範圍」的項目不實作。

測試：
- 純邏輯模組 → `tests/<module>.test.js`（邊界值、四捨五入、非法輸入各自有案例）。
- 路由 / DB / 交易 / 金流 → `tests/*.test.js` 或 `tests/integration/*.integration.test.js`。
- 所有 Vitest 測試使用記憶體 / 獨立 SQLite，**不得**動到專案 `database.sqlite`。

### 4. 派 test-runner 驗證

用 Agent 工具派 `test-runner` 依序執行：
1. `npm run test:unit`
2. `npm run test:integration`
3. 該 Issue 的驗收測試：

| Issue | 驗收測試檔 | 指令 |
|---|---|---|
| A：結帳優惠碼 | `tests/acceptance/coupon.test.js` | `npm run test:acceptance -- coupon` |
| B：取消未付款訂單 | `tests/acceptance/cancel-order.test.js` | `npm run test:acceptance -- cancel-order` |
| C：訂單篩選與分頁 | `tests/acceptance/order-filter.test.js` | `npm run test:acceptance -- order-filter` |

對照不到時，依 Issue 內文「驗收測試」段落指定的檔案執行。

- 有失敗 → 回到步驟 3 修正，再派 test-runner 重跑。
- 任何測試都**不得**為了通過而刪除、`skip`、放寬斷言或改用避開邊界的數值。

### 5. 更新 docs 與 openapi.json

- `docs/FEATURES.md`：功能總覽、API 欄位、業務邏輯、錯誤碼、測試數量
- `docs/ARCHITECTURE.md`：目錄結構、資料表欄位、資料流
- `docs/TESTING.md`：測試檔案表與各指令的測試數量（以 test-runner 實際回報數字為準）
- `docs/CHANGELOG.md`：`[Unreleased]` 下新增條目，註明 Issue 編號
- 計畫文件：`docs/plans/archive/YYYY-MM-DD-<feature-name>.md`（User Story → Spec → Tasks，Tasks 打勾）
- 路由 JSDoc 補齊後執行 `npm run openapi` 重生 `openapi.json`

### 6. Commit、push、開 PR

```bash
git add <具體檔案或目錄>          # 不要 git add -A 整個專案根目錄
git commit                         # 訊息結尾加 Co-Authored-By 行
git push -u origin issue-<n>-<名稱>
gh pr create --base main --head issue-<n>-<名稱> --title "<type>: <標題>（Issue #<n>）" --body-file -
```

PR 描述必須包含：
- 第一行 `Closes #<n>`
- 變更內容摘要
- 測試結果表（unit / integration / 驗收測試的通過數）
- 不在本次範圍的項目
- 結尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

### 7. 派 reviewer 檢查 PR

同時派 `code-reviewer` 與 `security-reviewer`（兩者無法執行 git，提示中要列出所有變更檔案、Issue 規格重點與測試結果）。

- 有「高」嚴重度問題（code-reviewer 的 **Blocker / Major**，security-reviewer 的 **Critical / High**）：
  1. 先讀原始碼確認問題屬實（reviewer 可能誤判）
  2. 修正並補回歸測試
  3. 派 test-runner 重跑步驟 4 的三組測試
  4. commit、push 到同一分支
  5. 再派 reviewer 複查
- Minor / Low / Nit 不在此 Skill 中修正，列入最後回報。
- 自行確認驗收測試與測試設定未被修改：
  ```bash
  git diff --stat main -- tests/acceptance 'vitest*.config.js' playwright.config.js .github
  ```
  輸出必須為空。
- 查看 CI：`gh pr checks <PR 編號>`；CI 失敗視同測試失敗，回到步驟 3。

### 8. 改標籤為 in-review 後停止

把 `in-progress` 改為 `in-review`，回報後**停止**。不要合併。

最後回報內容：
- PR 連結
- 每個步驟的結果（表格）
- 主要設計決策
- reviewer 提出但未處理的 Minor / Low 項目
- 過程中發現、但不屬於本 Issue 的既有問題（只回報，不修）

## 停止條件與轉交人工

發生下列任一情況時，轉交人工並停止：
- 步驟 4 或 CI 經兩輪修正仍失敗
- 驗收測試看起來必須修改才能通過（驗收測試即規格，不可改）
- Issue 規格有矛盾或缺漏，無法從 Issue、程式或文件合理推斷
- 「高」嚴重度問題修正兩輪後 reviewer 仍判定未解決
- 需要的操作被權限拒絕，或需要使用者的帳號 / 金鑰

轉交方式：
1. 把目前的流程標籤（`in-progress`）改為 `needs-human`
2. 用 `gh issue comment <n>` 留言說明卡在哪一步、原因、已嘗試的做法與需要人決定的事
3. 已有的變更 commit 並 push 到 Issue 分支（若已開 PR 則保留 PR），不要丟棄
4. 向使用者回報後停止

步驟 1 資格不符（非本人開立、沒有 `ready`、Issue 已關閉）時**不**套用此流程：不改標籤、不留言，只回報原因。

## 邊界（絕對不做）

- **不合併 PR**（不執行 `gh pr merge`、不在 GitHub 上合併），也不關閉 Issue；合併由人工審核後進行
- 不 commit 或 push 到 `main`，不 force push，不改寫已 push 的歷史
- 不修改 `tests/acceptance/*`、`vitest*.config.js`、`playwright.config.js`、`.github/workflows/*`
- 不刪除、跳過或放寬任何既有測試
- 不執行 `npm run test:e2e`（會寫入開發 DB 並連綠界 staging），除非使用者明確要求
- 不修改專案的 `database.sqlite`
- 不處理「不在本次範圍」的項目，也不順手修其他既有問題
- 不處理非本人開立、或未帶 `ready` 的 Issue
- 不建立新的 Issue 或 Label
