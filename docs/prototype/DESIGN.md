# 票据账本风 · 设计规范

> 适用于 trip-fee-calculator 及同类记账/分账类 H5 页面。本规范配套 [prototype.css](./prototype.css) 与 [docs/prototype/](.) 下各原型页使用。

---

## 一、设计调性

| 维度 | 取向 |
|---|---|
| 隐喻 | 复古纸质账本 / 票据存根 |
| 情绪 | 严谨、可信赖、有温度、不浮夸 |
| 反向规避 | 通用 AI 蓝白风、扁平 SaaS 仪表盘、霓虹/玻璃拟态 |
| 适用场景 | 记账、分账、对账、报销、流水明细 |

核心印象：**一张被穿孔装订、盖了红章的米黄牛皮纸账单**。

---

## 二、色彩系统

```css
--paper:#f4ecd8;        /* 主底色：米黄牛皮纸 */
--paper-2:#ece1c4;      /* 次底色：深米黄 */
--paper-light:#fbf6e8;  /* 卡片底：浅米黄 */
--ink:#1c1917;          /* 主文字：墨黑 */
--ink-soft:#57534e;     /* 次文字：暖灰 */
--ink-faint:#a8a29e;    /* 弱文字：浅灰 */
--rule:#c9b896;         /* 分割线：米色 */

--vermilion:#b54b3a;    /* 朱砂红：支出/删除/应付/印章 */
--moss:#4a6b3a;         /* 松绿：应收/正数/收入 */
--indigo:#2b3a67;       /* 靛蓝：主操作/金额/链接 */
--gold:#a87c2c;         /* 金棕：点缀（少用） */
```

### 色彩语义约定

| 语义 | 颜色 | 用法 |
|---|---|---|
| 支出 / 应付 / 删除 / 危险 | `--vermilion` | 金额、删除按钮、负净额、印章 |
| 应收 / 正数 / 成功 | `--moss` | 正净额、"已对账"印章 |
| 主操作 / 链接 / 强调金额 | `--indigo` | 主按钮、转账金额、"查看依据" |
| 中性主操作 | `--ink`（黑底白字） | 步进器、chip 选中态 |

**禁止**：使用纯蓝 `#1677ff`、纯绿 `#52c41a`、纯红 `#ff4d4f` 等 Ant Design 默认色。

---

## 三、字体系统

```css
/* 衬线 — 标题、人名、印章 */
font-family:"Noto Serif SC",serif;
font-weight:500/700/900;

/* 无衬线 — 正文、表单、按钮 */
font-family:"Noto Sans SC",-apple-system,sans-serif;
font-weight:400/500/700;

/* 等宽 — 数字、金额、时间、元数据 */
font-family:"IBM Plex Mono",monospace;
font-weight:400/500/600/700;
```

### 字体用途矩阵

| 元素 | 字体 | 字重 | 字号 |
|---|---|---|---|
| 页面大标题（结算依据等） | Serif SC | 900 | 22px / letter-spacing:2px |
| 卡片标题 | Serif SC | 700 | 15px / letter-spacing:2px |
| 人名 / 成员名 | Serif SC | 700-900 | 14-28px |
| 金额（大） | Plex Mono | 700 | 16-34px |
| 金额（小） | Plex Mono | 600 | 13-15px |
| 时间 / 元数据 | Plex Mono | 400 | 10-11px |
| 正文 / 表单 | Sans SC | 400-500 | 13-15px |
| 按钮文字 | Sans SC | 600 | 12-17px / letter-spacing:1px |

### 排版习惯

- 中文标题字间加 `letter-spacing:2px` 营造印章感
- 数字一律用等宽字体，保证金额对齐
- 大数字用 `letter-spacing:-1px` 收紧

---

## 四、核心视觉元素

### 1. 纸张底纹（必备）

body 必须叠加三层背景：径向暖光 + 径向冷光 + SVG 噪点。**不可省略**，否则失去纸质感。

```css
background-image:
  radial-gradient(circle at 20% 10%, rgba(168,124,44,.06), transparent 40%),
  radial-gradient(circle at 80% 80%, rgba(43,58,103,.05), transparent 45%),
  url("data:image/svg+xml;utf8,<svg ...feTurbulence baseFrequency='0.9'...>");
```

### 2. 票据头 `.receipt-head`（每页必备）

页面顶部锚点，含：
- 左右两侧 **红色穿孔边**（`::before`/`::after` 重复线性渐变，6px 实 6px 虚）
- 顶部虚线分割
- 标题（Serif）+ 副标题（Mono）
- 右上角 **印章** `.rh-stamp`（旋转 4°，1.5px 边框）
- 底部 meta 行（Mono 字体）

印章文案按页面状态：
- 初始化页：`待启程`
- 记账页：`记账中`（indigo 色）
- 结算页：`已对账`（moss 色）
- 详情页：`16 笔` / `已对账`

### 3. 卡片 `.card`

- 1px 米色边框 + 10px 圆角
- 浅米黄底 `--paper-light`
- 柔和投影 `--shadow`
- 标题左侧 3px 朱砂红竖条 `.card-title::before`

### 4. 分节标题 `.sec-title`

两侧延伸的米色横线 + 中央 Serif 标题 + 右侧 Mono 计数。
```html
<div class="sec-title"><span class="bar"></span><h2>账 单 明 细</h2><span class="num">16 笔</span><span class="bar"></span></div>
```

### 5. 账单条目 `.bill-item`

- 卡片底 + 顶部"用途 / 金额"两栏
- 中部 Mono 元数据行（付款人 · 时间）
- 受益人一行（Serif "受益" 标签 + 名字）
- 底部虚线分割的操作区

### 6. 弹窗 `.dialog`

- 居中浮层 + 半透明黑遮罩
- 左侧红色穿孔边（与票据头呼应）
- Serif 标题 + Sans 正文
- 右下角操作按钮

### 7. 头像 / 成员标识

5 色调色板，按成员序固定：
```css
.av-A{background:#2b3a67}  /* 靛蓝 */
.av-B{background:#7a5c3a}  /* 棕褐 */
.av-C{background:#4a6b3a}  /* 松绿 */
.av-D{background:#a87c2c}  /* 金棕 */
.av-E{background:#b54b3a}  /* 朱砂 */
```
圆形 32-36px，Serif 白字。

---

## 五、组件规范

### 按钮

| 类名 | 用途 | 外观 |
|---|---|---|
| `.btn.primary` | 主提交 | 黑底白字 |
| `.btn.vermilion` | 危险确认 | 朱砂红底白字 |
| `.btn.indigo` | 次主操作 | 靛蓝底白字 |
| `.btn.ghost` | 取消 | 透明底 |
| `.btn.danger` | 删除 | 朱砂红字 + 浅红底 |
| `.btn.link` | 跳转链接 | 虚线边 + 靛蓝字 |
| `.btn.sm` | 行内小按钮 | 缩小尺寸 |
| `.btn.block` | 块级 | 100% 宽 |

按钮文字统一加 `letter-spacing:1px`，中文之间留空格（如"添 加"）。

### 表单

- 输入框**无边框**，仅底部 1.5px 米色下划线
- 聚焦时下划线变靛蓝
- 数字输入加 `.mono` 类用等宽字体
- 下拉框去除默认箭头，自定义 SVG 箭头
- 字段标签用 `.field-label`（11px、暖灰、letter-spacing:2px）

### 步进器

- 圆形按钮 44×44px（满足触摸目标）
- 中央数字用 Serif 900 字重 34px
- 禁用态 opacity:0.35

### Chip / 标签

- 圆角 20px 胶囊形
- 未选：米色边 + 浅底 + 暖灰字
- 选中：黑底白字
- 用于受益人多选、成员切换 Tab

---

## 六、布局规范

```
.stage
  ├ max-width:430px        /* 移动端 H5 宽度 */
  ├ margin:0 auto
  ├ padding:18px 16px 80px
  └ 内含：receipt-head → card* → sec-title → list → foot-note
```

- 所有内容限制在 430px 内居中
- 卡片间距 10-14px
- 分节标题上下 margin 22px / 12px
- 页脚留 80px padding 防止内容贴底

---

## 七、交互规范

### 动效

| 场景 | 动效 |
|---|---|
| Tab 切换面板 | `fade .35s`（opacity + translateY 6px） |
| 卡片展开 | `max-height .35s ease` |
| 箭头旋转 | `transform .25s`（展开时 rotate 90°） |
| 导航卡 hover | `translateY(-2px)` |
| 印章 | 静态旋转 4°，无动效 |

### 反馈

- 删除/重置必须二次确认弹窗
- 临时提示用底部 `hint` 条（2.6s 自动消失）
- 禁用态统一 opacity:0.5

### 触摸目标

所有可点击元素 ≥44px（步进器按钮、对话框按钮、chip 高度均满足）。

---

## 八、原型文件结构

```
docs/prototype/
├── DESIGN.md                    # 本文件
├── prototype.css                # 公共样式（必引）
├── index.html                   # 导航总览
├── init.html                    # InitView 原型
├── expense.html                 # ExpenseView 原型
├── settlement.html              # SettlementView 原型
├── detail.html                  # DetailView 原型（= settlement-explain.html）
└── settlement-explain.html      # 交互式结算依据（detail.html 的源）
```

### 新建页面模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>页面名 · 原型</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@500;700;900&family=Noto+Sans+SC:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="prototype.css">
</head>
<body>
<div class="stage">
  <div class="receipt-head">
    <div class="rh-top">
      <div>
        <div class="rh-title">页 面 标 题</div>
        <div class="rh-sub">PAGE · ENGLISH SUBTITLE</div>
      </div>
      <div class="rh-stamp">印章文案</div>
    </div>
    <div class="rh-meta">
      <span>step N / 4</span>
      <span>辅助信息</span>
    </div>
  </div>

  <!-- 内容区 -->

  <div class="foot-note">
    <strong>说明</strong><br>
    页面功能说明
  </div>
</div>
</body>
</html>
```

---

## 九、设计检查清单

新建/评审页面时逐项确认：

- [ ] body 有三层背景（暖光 + 冷光 + 噪点）
- [ ] 页面以 `.receipt-head` 开头，含穿孔边与印章
- [ ] 标题用 Serif SC，数字用 Plex Mono，正文用 Sans SC
- [ ] 中文标题加 letter-spacing:2px
- [ ] 支出/应付用朱砂红，应收用松绿，主操作用靛蓝或墨黑
- [ ] 卡片有 1px 米色边框 + 浅米黄底 + 柔和投影
- [ ] 弹窗左侧有红色穿孔边
- [ ] 触摸目标 ≥44px
- [ ] 危险操作有二次确认
- [ ] 页脚有 `.foot-note` 说明
- [ ] 宽度限制 430px 居中
- [ ] 未使用 Ant Design / Tailwind 默认色

---

## 十、落地到 Vue 的映射建议

| 原型类名 | Vue 落地位置 |
|---|---|
| `.receipt-head` | 各 View 顶部 / 抽成 `AppHeader.vue` |
| `.card` / `.bill-item` | 各组件根容器 |
| `.btn.*` | 抽成 `BaseButton.vue`，prop: variant |
| `.chip` | 复用现有 `MemberSelector.vue` 改样式 |
| `.stepper` | `InitView.vue` 内联 |
| `.dialog` | 复用 `ConfirmDialog.vue` 改样式 |
| `.tab-row` + `.panel` | `DetailView.vue` 升级为交互式结算依据 |
| `prototype.css` | 拆为 `src/styles/ledger.css` 全局引入 + 各组件 scoped |

落地时保留各 View 的 `<script setup>` 逻辑不变，仅替换 `<template>` 结构与 `<style>` 内容。
