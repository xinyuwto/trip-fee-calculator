# UI 改造：原型风格全局应用

## 背景

以 `docs/prototype/settlement-explain.html` 为视觉原型，改造计算依据(DetailView)页面——完整实现原型中的 per-member 交互视角，并将纸张质感的配色/字体/卡片风格统一应用到所有页面和组件。

## 设计 Token（`src/styles/theme.css`）

### CSS 变量

| 变量 | 值 | 用途 |
|------|-----|------|
| `--paper` | `#f4ecd8` | 页面底色 |
| `--paper-2` | `#ece1c4` | 次底色 |
| `--ink` | `#1c1917` | 主文字色 |
| `--ink-soft` | `#57534e` | 次级文字 |
| `--ink-faint` | `#a8a29e` | 辅助文字/分割线 |
| `--rule` | `#c9b896` | 边框/分割线 |
| `--indigo` | `#2b3a67` | 强调色一 |
| `--vermilion` | `#b54b3a` | 负值/支出色 |
| `--moss` | `#4a6b3a` | 正值/收入色 |
| `--gold` | `#a87c2c` | 装饰色 |
| `--shadow` | `0 1px 0 rgba(28,25,23,.06), 0 12px 28px -18px rgba(28,25,23,.4)` | 卡片投影 |

### 字体回退链

- 正文：`"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`
- 标题：`"Noto Serif SC", "STSong", "SimSun", serif`
- 数字：`"SF Mono", "Menlo", "Consolas", "IBM Plex Mono", monospace`

### Body 纸纹背景

三层叠加：两个径向渐变 + SVG feTurbulence noise 纹理。与原型 HTML 一致。

### 引入方式

`App.vue` 中 `@import './styles/theme.css'`，所有组件通过 `var(--xxx)` 引用变量。

## DetailView 重写

### 组件树

```
DetailView.vue
├── ReceiptHead        — 票据头：标题、总支出、账单数、转账笔数
├── MemberTabRow       — 成员 tab 横滚条（按原始成员顺序，与 members 数组一致）
├── MemberPanel × N    — v-show 切换
│   ├── NetCard        — 净额大数字卡片
│   ├── TaskBar        — 转账任务（应收来源 / 应付去向）
│   ├── RelCard × M    — 与他人往来（可展开 → 垫付/被垫付账单明细）
│   ├── WhyCard        — 部分成员有解释卡片
│   └── AlgoFoot       — 算法脚注
```

### 交互

- **Tab 切换**：点击 tab 切换 MemberPanel，CSS fade 动画，自动滚到顶部
- **RelCard 展开/折叠**：点击表头切换 `.open` class，CSS max-height 过渡

### 数据来源

`settlement.js` 新增 `analyzeSettlement(members, expenses)` 函数，计算每个成员的：
- 净额卡片数据
- 转账任务列表
- 与每个人的双向垫付明细（含具体账单）
- 解释文案所需的结构化数据

## settlement.js 扩展

### `analyzeSettlement(members, expenses)` 返回值

```
{
  memberBalances: [...],    // 现有
  transactions: [...],      // 现有（已按 fromName 排序）
  members: [{
    memberId, memberName,
    paid, owed, balance,
    netCard: { isPositive, ... },
    tasks: [{ fromName, toName, amount, direction }],
    relations: [{
      peerId, peerName,
      iPaidForPeer: [{ expenseId, purpose, totalAmount, share, beneficiaryCount, time }],
      peerPaidForMe: [{ expenseId, purpose, totalAmount, share, payerName, beneficiaryCount, time }],
      iGave, theyGave, net
    }],
    why: {
      isNetCreditor, totalPaidForOthers, totalOthersPaidForMe,
      maxCreditorName, relevantPeers, narrativeHint
    }
  }]
}
```

### `shareOf(expense, memberId)` — 按整数除法 + 余数分配

与 `calculateSettlement` 已有逻辑一致。从支出中提取为独立函数供复用。

### 测试

所有新函数通过 `settlement.test.js` 覆盖，包括：
- shareOf 整数精度
- analyzeSettlement 双向流水正确性
- ralations 数据完整性

## 其他页面改造

### SettlementView（中等改造）

- 转账方案卡片：纸张色背景 + 投影，等宽数字，from/to 用 vermilion/moss
- 净收支列表：统一卡片风格
- 页头改为票据头风格

### ExpenseView（中等改造）

- 页头改为票据头（旅行名 + "已入账"印章）
- ExpenseForm / ExpenseList 嵌入纸张卡片风格背景
- 导入弹窗背景色改为纸张色系

### InitView（轻度改造）

- 标题字体切到衬线
- 按钮改为 `var(--ink)` 色
- 整体纸张底色 + 卡片化表单区

### ExpenseForm（中等改造）

- 表单控件统一样式：border-color → `var(--rule)`，focus → `var(--indigo)`
- 选中按钮从蓝色改为 ink 色
- 日期/备注 inputs 统一风格

### ExpenseList（轻度改造）

- 金额用等宽字体
- 备注色 → `var(--ink-faint)`
- 卡片纸张底色

### MemberSelector（轻度改造）

- 选中态从 `#1677ff` 改为 `var(--ink)`

### ConfirmDialog（轻度改造）

- 背景从 `#fff` 改为 `var(--paper)`

### 不改的内容

布局结构、交互逻辑、数据流、路由守卫。纯视觉换肤。

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/styles/theme.css` | 新增 | 全局 CSS 变量 + body 背景 |
| `src/App.vue` | 修改 | 引入 theme.css |
| `src/views/DetailView.vue` | 重写 | 完整原型交互 |
| `src/utils/settlement.js` | 修改 | 新增 analyzeSettlement、shareOf |
| `src/utils/__tests__/settlement.test.js` | 修改 | 覆盖新函数 |
| `src/views/SettlementView.vue` | 修改 | 新风格 |
| `src/views/ExpenseView.vue` | 修改 | 新风格 |
| `src/views/InitView.vue` | 修改 | 新风格 |
| `src/components/ExpenseForm.vue` | 修改 | 新风格 |
| `src/components/ExpenseList.vue` | 修改 | 新风格 |
| `src/components/MemberSelector.vue` | 修改 | 新风格 |
| `src/components/ConfirmDialog.vue` | 修改 | 新风格 |

## 测试策略

- `settlement.test.js`：TDD 覆盖 `analyzeSettlement` 和 `shareOf`
- 所有现有测试在改造过程中保持通过
- UI 改造后通过浏览器预览验证视觉一致性
