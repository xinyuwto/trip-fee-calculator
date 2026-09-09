# 旅行数据同步方案设计（CloudBase 共享码同步）

> 状态：待评审
> 日期：2026-09-09
> 分支：dev/trip-sync

## 1. 背景与目标

trip-fee-calculator 是纯前端 H5，旅行数据仅存 localStorage，多成员协作目前依赖手动的 JSON 导出/导入。本方案为多成员间提供**异步随时同步**能力：任何成员在任意时间拉取/推送最新旅行数据。

**目标**：成员只需输入一个 8 位同步码即可同步，无需账号注册。

**非目标**（明确不做）：

- 实时同步/自动同步（仅手动拉取/推送）
- 增量合并（整包覆盖）
- 多旅行多同步码并存（单设备同一时间只有一个活动同步）
- 用户鉴权体系
- 并发编辑协调（用户已确认无需考虑，冲突时二选一即可）

## 2. 需求与约束

| 约束 | 说明 |
|---|---|
| 数据量 | 单次旅行 JSON，几 KB ~ 几十 KB（20 人 × 数百笔） |
| 用户量 | 2 ~ 20 人 |
| 并发 | 无并发编辑需求，last-write-wins + 冲突时用户二选一 |
| 成本 | CloudBase 体验版（免费，有效期至 2027-01-23） |
| 网络 | 国内直连 |
| 依赖 | 前端**不新增 npm 依赖**，用原生 `fetch` |
| 兼容 | 现有导出/导入功能保留，作为兜底手段 |

## 3. 平台与选型结论

选型过程对比了 Gitee Gist（零部署但每人要 PAT）、自部署边缘函数（EdgeOne/CF，前者政策未验证、后者国内直连不稳）、CloudBase 三个方向，最终选定 **CloudBase**：

- 环境已开通且用户熟悉（H5 本身已部署在同一环境）
- 文档型数据库 + 云函数 + HTTP 网关齐备，国内直连稳定
- 体验版免费，QPS 500，此量级绰绰有余

**环境信息**：

- EnvId：`playground-d0goyj2w0f42a96b8`（上海，BaaS 型）
- 套餐：体验版（baas_trial），**2027-01-23 到期，未开自动续费**
- 后端：NoSQL 文档数据库（无 PG/MySQL）
- H5 生产地址：`trip-fee-calculator-playground-d0goyj2w0f42a96b8.webapps.tcloudbase.com`（GitHub 仓库关联部署，dev 分支合并后自动重新部署）

## 4. 总体架构

```
H5 (原生 fetch)
   │  GET/POST
   ▼
HTTP 网关路由 /trip-sync（匿名，CORS 白名单）
   │
   ▼
云函数 trip-sync（Node.js，服务端校验同步码）
   │  @cloudbase/node-sdk（管理员身份，绕过安全规则）
   ▼
文档数据库 trips 集合（权限：仅管理员读写）
```

要点：

- 前端不直连数据库，**不引入 `@cloudbase/js-sdk`**，纯 `fetch` 调云函数 URL
- 同步码即密钥：持有码即可读写该旅行数据，校验在云函数内完成（对记账数据这个敏感级别可接受）
- `trips` 集合权限设为仅管理员，即使安全规则被误配也无法从浏览器直读

## 5. 数据模型

集合 `trips`，一个文档对应一次旅行，文档 `_id` 即同步码：

```json
{
  "_id": "K3X9QA2M",
  "schemaVersion": 1,
  "payload": { "name": "...", "members": [...], "expenses": [...], "createdAt": "..." },
  "revision": 3,
  "updatedAt": "2026-09-09T12:00:00.000Z",
  "updatedBy": "成员1"
}
```

| 字段 | 说明 |
|---|---|
| `_id` | 8 位同步码，字符集见 §7 |
| `schemaVersion` | 载荷格式版本，当前 1，为将来格式变更预留 |
| `payload` | 完整 trip 对象（与 localStorage 中 `trip` 结构一致） |
| `revision` | 单调递增整数，每次成功推送 +1，新旅行从 1 开始 |
| `updatedAt` / `updatedBy` | 最后推送时间和推送人（成员昵称），用于冲突提示展示 |

云端**只存 payload**，不含任何本地状态（`revision` 基准、上次同步时间等均为设备本地状态）。

## 6. 云函数 API 规格

函数名 `trip-sync`，运行时 Nodejs18.15，类型 HTTP（WEB_SCF），经网关路由 `/trip-sync` 暴露，匿名访问。

### GET /trip-sync?code=XXXX

拉取远端数据。

- `200` → `{ "schemaVersion": 1, "payload": {...}, "revision": 3, "updatedAt": "...", "updatedBy": "..." }`
- `404` → `{ "error": "TRIP_NOT_FOUND" }` 同步码不存在
- `400` → `{ "error": "INVALID_CODE" }` 同步码格式非法

### POST /trip-sync

推送数据。请求体：

```json
{ "code": "K3X9QA2M", "baseRevision": 3, "payload": {...}, "updatedBy": "成员1" }
```

冲突时强制覆盖（用户在前端选择「用我的覆盖」后）：

```json
{ "code": "K3X9QA2M", "baseRevision": 3, "payload": {...}, "updatedBy": "成员1", "force": true }
```

响应：

- `200` → `{ "revision": 4 }` 写入成功（新建时返回 `revision: 1`）
- `409` → `{ "error": "REVISION_CONFLICT", "remoteRevision": 5, "remoteUpdatedAt": "...", "remoteUpdatedBy": "..." }` 远端比本地新，返回远端状态供前端展示
- `404` → `{ "error": "TRIP_NOT_FOUND" }`（仅 force 覆盖一个不存在的码时；正常推送不存在的码 = 新建）
- `400` → `{ "error": "INVALID_CODE" | "INVALID_PAYLOAD" }` 码或载荷非法

### 服务端校验规则

- 同步码必须匹配 `^[2-9A-HJKMNP-Z]{8}$`，否则 400（防乱码探测）
- `payload` 序列化后超过 **512KB** 拒绝（400，函数请求体上限 1MB，留安全余量）
- `payload` 必须含 `name`（string）、`members`（非空数组）、`expenses`（数组）基本结构，否则 400（防止写入垃圾数据）
- `revision` 类型必须为非负整数；`updatedBy` 截断到 20 字符
- 每请求全量替换 payload 字段（无增量逻辑）

## 7. 同步码规范

- 8 位随机字符，字符集 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`（31 个字符，去除 `0/1/I/L/O` 易混淆字符）
- 熵：31⁸ ≈ 2³⁹·⁶ ≈ 8527 亿种，对记账数据足够
- 前端生成函数 `generateSyncCode()` 与校验函数 `validateSyncCode(code)` 放在 `src/utils/sync.js`，单测覆盖
- 大小写不敏感：输入统一转大写处理（服务端同样归一化）

## 8. 前端设计

### 8.1 `src/utils/sync.js`（新增，纯逻辑，TDD）

```js
const SYNC_URL = 'https://<网关域名>/trip-sync'  // 部署后确定，常量维护

export function generateSyncCode()          // → 'K3X9QA2M' 风格 8 位码
export function validateSyncCode(code)      // → boolean
export async function pullTrip(code)
// 成功 → { payload, revision, updatedAt, updatedBy }
// 404 → throw { code: 'TRIP_NOT_FOUND' }
// 网络失败 → throw { code: 'NETWORK_ERROR' }

export async function pushTrip({ code, baseRevision, payload, updatedBy, force = false })
// 成功 → { revision }
// 409 → throw { code: 'REVISION_CONFLICT', remoteRevision, remoteUpdatedAt, remoteUpdatedBy }
```

所有函数不触碰 store / localStorage，可独立 mock `fetch` 单测。

### 8.2 store 扩展（`src/stores/trip.js`）

新增模块级状态（与 `trip` 平级，独立持久化）：

```js
const sync = ref(loadSyncState())  // localStorage key: 'trip-fee-calculator-sync'
// 结构：{ code: 'K3X9QA2M' | null, baseRevision: number, lastSyncedAt: string | null }
```

行为：

- `resetTrip()` 时**同步清空 sync 状态**（重新开始 = 新旅行，旧同步码作废）
- `importData()` 覆盖本地数据时 sync 状态保持不变（导入后 revision 基准未变，若远端没动则推送直接成功；若远端已更新则走冲突流程，无需特殊处理）
- 不做自动同步：所有拉/推由用户手动触发

### 8.3 UI（ExpenseView）

头部 `rh-actions` 增加「同 步」按钮，打开同步对话框。对话框按状态分三种视图：

**未开启同步**：

- [开启同步]：生成新码 → 推送当前 trip（baseRevision=0 → 新建 revision=1）→ 保存 sync 状态 → 显示码
- [输码加入]：输入 8 位码 → 拉取 → 展示远端摘要（旅行名/成员数/最后更新）→ 确认覆盖本地（复用导入的二次确认文案风格）→ 保存 sync 状态

**已开启同步**：

- 显示同步码（点击复制到剪贴板）
- 显示上次同步时间
- [拉 取]：拉取 → 确认覆盖本地 → 更新本地与 baseRevision
- [推 送]：推送本地 trip；409 时进入冲突视图
- [解除同步]：清空 sync 状态（云端文档保留，其他成员不受影响）

**冲突视图**（推送返回 409 时）：

- 展示远端信息：「远端已更新（成员2 · 9/9 14:30，第 5 版），本地基于第 3 版」
- [用我的覆盖]：`force: true` 重推 → 更新 baseRevision
- [拉取远端]：拉取 → 确认覆盖本地 → 更新 baseRevision

所有操作结果用现有 toast 机制反馈成功/失败。

## 9. 部署清单（通过 CloudBase MCP 执行）

1. 创建 `trips` 集合，权限设为仅管理员读写（`ADMINONLY`）
2. 创建云函数 `trip-sync`（Nodejs18.15，HTTP 型，依赖 `@cloudbase/node-sdk`）
3. 开通 HTTP 网关（如未开通，`enableService`），创建路由 `/trip-sync` → `WEB_SCF` → `trip-sync`，鉴权关闭（匿名）
4. 添加环境安全域名（CORS 白名单）：`localhost:5173`（开发）、`trip-fee-calculator-playground-d0goyj2w0f42a96b8.webapps.tcloudbase.com`（生产）
5. 冒烟测试：curl 验证 GET 404 / POST 新建 / POST 409 / force 覆盖全链路
6. 将网关域名写入 `src/utils/sync.js` 的 `SYNC_URL` 常量

## 10. 测试策略（TDD）

| 层 | 内容 |
|---|---|
| 单元（vitest，mock fetch） | `validateSyncCode` 合法/非法码；`generateSyncCode` 字符集与长度；`pullTrip` 成功/404/网络错误；`pushTrip` 成功/409 冲突对象/force；store 的 sync 状态持久化与 resetTrip 清空 |
| 冒烟（真实端点） | 部署后 curl 全链路：新建 → 拉取 → 推送 → 冲突 → force 覆盖 |
| 浏览器验证 | 本地 dev server 走完整 UI 流程：开启同步 → 复制码 → （模拟第二设备）输码加入 → 双端推拉 → 冲突二选一 |

## 11. 风险与边界

| 风险 | 应对 |
|---|---|
| 体验版 2027-01-23 到期 | 到期前升级套餐或迁环境；云端数据仅为 payload 文档，导出迁移容易；本地数据和导出导入功能不受影响 |
| 同步码泄露 = 数据可读写 | 记账数据敏感级别低，可接受；将来可加旅行口令（非本期范围） |
| 函数调用/数据库读写额度 | 20 人 × 每天 20 次同步 = 400 次/天，体验版额度内绰绰有余 |
| 网关域名变化 | `SYNC_URL` 为单一常量，一处维护 |
| 恶意刷接口 | 码格式校验 + 512KB 上限已挡住最基本的滥用；体验版 QPS 500 由平台侧限流兜底 |

## 12. 与现有功能的关系

- **导出/导入保留不动**：无网/跨环境传递场景的兜底
- **结算算法不受影响**：同步的是同一份 trip 数据结构（金额仍为整数分）
- **重新开始**：清空 trip 的同时清空 sync 状态（见 §8.2）
