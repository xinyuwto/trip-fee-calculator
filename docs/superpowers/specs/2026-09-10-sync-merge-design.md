# 合并式同步设计（sync-merge）

> 状态：已与用户对齐设计方向（2026-09-10），测试用例先行评审
> 日期：2026-09-10
> 分支：dev/sync-merge（基于 dev/trip-sync，暂不合并 main）
> 前置设计：`docs/superpowers/specs/2026-09-09-trip-sync-design.md`（v1 整包同步，已实现并部署）

## 1. 背景与目标

v1 同步为整包推/拉 + 手动触发 + revision 冲突二选一。本设计将其演进为：

- **合并式同步**：服务端按付款记录 id 逐条合并，双向同步差异（远端有本地无 → 补本地；本地有远端无 → 补远端）
- **自动触发**：记账变更后、进入/刷新页面时自动同步
- **重复检测**：新增/修改/同步时四要素比对（支付人+受益人+金额+项目），疑似重复逐条弹窗确认
- **状态可见**：界面右上角同步状态指示（同步中/同步成功/同步失败/待确认）

用户已确认的关键决策：

| 决策点 | 结论 |
|---|---|
| 同 id 双端都改过 | 记录级 LWW（每条记录 `updatedAt`，新者胜） |
| 合并逻辑位置 | **服务端**（云函数内原子合并，409 冲突机制随之删除） |
| 自动同步打扰 | 可以弹窗（去重确认）+ 右上角状态指示 |
| 分支 | 新开 `dev/sync-merge`，基于 dev/trip-sync，暂不合并 main |

**非目标**：实时同步（WebSockets）、离线队列持久化（失败等下次触发）、逐条文档存储（维持一旅行一文档）、并发编辑的强一致保证（LWW 即可）。

## 2. 数据模型 v2

云端仍为一旅行一文档，payload 升级为 v2：

```json
{
  "_id": "K3X9QA2M",
  "schemaVersion": 2,
  "payload": {
    "name": "我的旅行",
    "members": [...],
    "metaUpdatedAt": "2026-09-10T10:00:00.000Z",
    "expenses": [
      { "id": "uuid", "purpose": "正餐", "amount": 5000, "payerId": "m1",
        "beneficiaryIds": ["m1","m2"], "note": "", "createdAt": "...",
        "updatedAt": "..." }
    ],
    "deletedIds": [ { "id": "uuid", "deletedAt": "..." } ]
  },
  "revision": 12,
  "updatedAt": "...", "updatedBy": "成员1"
}
```

| 字段 | 说明 |
|---|---|
| `expenses[].updatedAt` | 记录级修改时间，LWW 裁决依据；新增记录 = createdAt |
| `deletedIds` | 删除墓碑清单（id + deletedAt），删除传播的依据 |
| `metaUpdatedAt` | trip 元数据（名称/成员）的修改时间，元数据整块 LWW |
| `revision` | 每次实际变更的合并 +1（无变化同步不增），仅作展示/可观测 |

**迁移规则**（v1 → v2，透明执行）：

- 云端文档 schemaVersion 1：首次合并时逐条 backfill `updatedAt = createdAt`、`deletedIds = []`、`metaUpdatedAt = createdAt`，合并后写回 v2
- 本地 localStorage（v1 记录）：加载时同样 backfill
- 本地 sync 状态 v1（含 baseRevision）：加载时丢弃 `baseRevision`（v2 无此概念），结构变为 `{ code, myMemberId, lastSyncedAt }`

## 3. 合并算法（云函数内）

`mergeTrips(localTrip, remoteTrip, dedupDecisions)` → `{ merged, duplicates, changed }`，纯函数（core.js，单测覆盖全矩阵）：

1. **记录合并**：以 `id` 为键取并集
   - 仅一端有 → 该记录进 merged
   - 双端都有 → `updatedAt` 新者胜；时间相同（极端时钟碰撞）→ 远端胜（已持久化方优先，确定性）
2. **删除传播**：`deletedIds` 取并集进 merged
   - 某 id 在墓碑中 → 双端该记录均剔除
   - 例外：该记录 `updatedAt` > 墓碑 `deletedAt`（删除后又发生编辑的竞态）→ 记录复活（LWW 全局一致）
3. **元数据合并**：`name`/`members` 整块比较，`metaUpdatedAt` 新者胜；时间相同 → 远端胜
4. **revision**：merged 与远端文档比对，有实际差异 → `revision + 1` 并写回；无差异 → 原样返回（幂等）

## 4. API 规格

### 新端点：POST /trip-sync（body 含 `mode: "merge"`）

**阶段 1（常规/探测）**：

```json
{ "mode": "merge", "code": "K3X9QA2M", "payload": <本地 trip v2>, "myMemberId": "m1" }
```

- 无疑似重复 → `200 { "status": "merged", "payload": <合并结果>, "revision": 13 }`，**服务端已写入**，客户端用 payload 整体替换本地
- 发现疑似重复 → `200 { "status": "duplicates_found", "payload": <合并结果（不含任何候选记录的裁决）>, "revision": 13, "duplicates": [ { "local": {...}, "remote": {...} } ] }`
  - 服务端已合并**无争议部分**并写入（候选记录保持原状：本地的留在本地、远端的留在云端）
  - 客户端**不替换本地**，弹出逐条确认

**阶段 2（带裁决）**：

```json
{ "mode": "merge", "code": "...", "payload": <本地 trip v2>, "myMemberId": "...",
  "dedupDecisions": [ { "localId": "e1", "remoteId": "e9", "action": "duplicate" | "keep" } ] }
```

- `duplicate` 裁决规则（**保留非新到方**）：
  - 本地新增 vs 远端已有 → 保留远端条；本地条不入库（最终 merged 中不含它，客户端替换本地后自然消失，无需墓碑——该 id 从未上过云端）
  - 远端新增 vs 本地已有 → 保留本地条；远端条加**墓碑**（从云端删除并阻止其他设备再拉取）
  - 双端各自新增（不同 id、四要素相同）→ 保留 `createdAt` 较早者；相同则保留远端条；被丢弃的本地条不入库 / 远端条加墓碑
- `keep` → 两条都进 merged（真实场景：两顿一样的饭）
- 响应同 `merged`，客户端整体替换本地

**错误**：沿用 `INVALID_CODE` / `INVALID_PAYLOAD` / `PAYLOAD_TOO_LARGE` / `TRIP_NOT_FOUND`（payload 无 members 等基础结构校验不变）；新增 `mode: "merge"` 但 payload 缺 v2 必需结构 → 400 `INVALID_PAYLOAD`。

### 保留端点（过渡兼容）

- `GET ?code=` 不变（加入旅行/摘要用）
- 旧 `POST`（无 `mode` 字段，含 `baseRevision`/`force`）→ 维持 v1 推送行为，直到线上 H5 更新到 v2 后清理（预计本分支合并 main 并重新部署后，下一个版本删除）

## 5. 去重检测

**匹配规则**（`matchDuplicate(a, b)`）：`payerId` 相同 + `beneficiaryIds` **集合**相等（忽略顺序）+ `amount`（分）相等 + `purpose` 字符串全等。note、createdAt、id 不参与。

**触发点**：

| 时机 | 比对范围 | 行为 |
|---|---|---|
| 本地新增/修改记录 | 本地其余记录（自动同步后本地≈远端） | 弹窗「与现有记录疑似重复？」→ 确认重复则放弃本次新增/修改；不重复则继续 |
| 服务端合并（阶段 1） | 本次合并中的"新到记录" vs 对端全部记录 | 返回 duplicates 列表，客户端逐条弹窗（阶段 2 裁决） |

去重比对只针对**本次新到**的记录（本地新增 vs 远端全部、远端新增 vs 本地全部），已在双端共存的记录不重复提示。

## 6. 自动同步与状态指示

**触发点**：`addExpense` / `updateExpense` / `removeExpense` 成功后；ExpenseView `onMounted`（进入/刷新）。

**串行队列**：同一时刻仅一个在途同步请求；触发时若在途 → 置 pending，完成后自动补跑（合并为一次）。防弱网下请求风暴。

**状态指示**（ExpenseView receipt-head 右上角状态 chip）：

- `同步中`（请求在途）
- `同步成功`（最近一次成功；2 秒后淡化为平常态或显示时间）
- `同步失败 · 点击重试`
- `待确认 N 条`（有未裁决的重复项，点击打开确认弹窗）
- 未开启同步时不显示

**失败处理**：网络失败/超时/5xx → 本地数据不动，状态置失败，**无弹窗**；下次任意触发点自动重试。阶段 1 的 duplicates_found 后用户关闭弹窗未裁决 → 记录为待确认（pendingDecisions 存内存，不持久化——下次同步重新探测重新提示）。

## 7. UI 变更

### SyncDialog 改造

- **active 视图**：同步码（复制）+ 我的身份/上次同步时间 + 单一「同 步」按钮（合并语义，替代原 推送/拉取 两按钮）+ 解除同步
- **conflict 视图删除**（服务端合并无 409）
- **join-summary / idle 视图**：保持 v1 形态
- 新增「待确认重复项」列表视图（阶段 1 返回后逐条展示 local vs remote 卡片，选择 重复/保留）

### InitView

- 新增「加入旅行」次级入口（与「开 始 旅 行」并列，ghost 样式）→ 复用 SyncDialog 的输码加入流程：输码 → GET 摘要确认（覆盖本地，若有本地数据则二次确认）→ 选身份 → 进入记账页 → 首次自动同步

### ExpenseView

- 头部「同 步」按钮保留（手动触发合并）
- 右上角状态 chip（见 §6）

## 8. 导入导出联动

- **导出**：随 trip 数据自然升级为 v2 格式（含 updatedAt/deletedIds/metaUpdatedAt），无需改代码——`exportData` 序列化整个 trip
- **导入**：`importData` 校验放宽为同时接受 v1/v2——缺 `updatedAt` 的记录 backfill `= createdAt`，缺 `deletedIds`/`metaUpdatedAt` 补默认；其余校验不变
- 导入**不触发**自动同步（不在触发点清单）；下一次任意同步时导入数据与远端合并
- **已知限制（接受并记录）**：导入 v1 旧 JSON（无墓碑）可能复活远端已删除的记录——墓碑信息无法凭空补出

## 9. 兼容与迁移策略

| 场景 | 处理 |
|---|---|
| 云端 v1 文档 | 首次合并自动迁移 v2（§2） |
| 本地 v1 localStorage | 加载时 backfill（§2） |
| 本地 v1 sync 状态 | 丢弃 baseRevision（§2） |
| 线上 H5（v1 客户端）| 函数保留旧 GET/POST 端点直至 H5 重新部署（本分支合并 main 后），避免开发期间线上同步中断 |
| 部署时机 | 新函数随本分支开发部署（本地 dev 立即用 v2）；线上 H5 仍走旧端点 |

## 10. 风险与边界

| 风险 | 应对 |
|---|---|
| 设备时钟偏差导致 LWW 选错 | 依赖 `updatedAt`，偏差大的设备可能覆盖新改动；记录在已知限制，量级（家庭出游几天）内可接受 |
| 阶段 1 已写入但阶段 2 失败 | 无争议部分已同步成功（正确状态）；候选记录留在原端，下次同步重新探测重新确认——幂等安全 |
| 墓碑清单无限增长 | 每次旅行记录量级百条，墓碑 ≤ 记录数，几十 KB 内，不清理（YAGNI） |
| 大 payload | 单文档上限 512KB / 请求体 560KB 不变；20 人 × 数百笔 ≈ 远低于上限 |
| 并发同步（多设备同时 POST） | 服务端单请求内 读→合→写，TOCTOU 窗口毫秒级且 LWW 收敛；接受（非目标强一致） |

## 11. 测试策略

测试用例先行评审（用户要求）：`docs/测试用例-合并式同步.md` 覆盖合并矩阵、删除传播、去重两阶段、自动触发与状态、弱网异常、大数据差异、兼容迁移、回归——**评审通过后**进入 writing-plans。

开发遵循 TDD：合并算法（core.js 纯函数）单测矩阵 → sync.js 客户端（mock fetch）→ 自动同步队列/状态（store）→ UI（E2E）→ 云函数冒烟。
