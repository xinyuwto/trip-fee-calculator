# trip-fee-calculator

## 项目概述

纯前端 H5 小工具，用于多人出游时的费用记账和 AA 分账结算。

- **技术栈**: Vue 3 (Composition API) + Vite + Vue Router 4 (hash 模式)
- **存储**: localStorage（纯前端，无后端）
- **UI**: 手写 CSS，移动端优先，不使用 UI 库
- **数据共享**: JSON 导出/导入（剪贴板 + 文件）

## 关键思路

### 架构

```
Vue 3 SPA (Vite) → Vue Router (hash) → 4 视图 + 1 数据层 composable
                                              └── localStorage 持久化
```

4 个页面：初始化 (`/`) → 记账 (`/expense`) → 结算结果 (`/settlement`) → 结算依据 (`/detail`)

数据层 `useTripStore` composable 统一管理状态，任何变更自动写 localStorage。

### 分账算法

1. 每人净额 = 总支付 - 总应承担（每笔支出在受益人之间均摊）
2. 债权人和债务人贪心匹配 → 最小转账笔数

### 导入导出

- 导出：复制到剪贴板 / 下载 JSON 文件
- 导入：从剪贴板粘贴 / 选择 JSON 文件，校验后覆盖本地数据，需二次确认

## 开发约定

- 用 Composition API (`<script setup>`)，不用 Options API
- 不引入额外依赖库（UI 库、状态管理库等），保持轻量
- 金额精确到分，用整数（分）存储和计算，避免浮点精度问题
- 移动端 first，在手机屏幕上测试交互
- 删除/重置操作需确认弹窗，防误触

## 目录结构

```
src/
├── main.js
├── App.vue
├── router/index.js
├── stores/trip.js          # useTripStore composable
├── utils/
│   ├── settlement.js       # 结算算法
│   └── import-export.js    # JSON 导入导出
├── views/
│   ├── InitView.vue
│   ├── ExpenseView.vue
│   ├── SettlementView.vue
│   └── DetailView.vue
└── components/
    ├── ExpenseForm.vue
    ├── ExpenseList.vue
    ├── MemberSelector.vue
    └── ConfirmDialog.vue
```

## 参考文档

- `docs/PRD-旅行记账分账工具.md`
