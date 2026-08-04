<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTripStore } from '../stores/trip'
import { analyzeSettlement } from '../utils/settlement'

const router = useRouter()
const { trip } = useTripStore()

if (!trip.value) {
  router.replace('/')
}

const analysis = analyzeSettlement(trip.value.members, trip.value.expenses)
const activeMemberId = ref(analysis.members[0]?.memberId || '')

function money(cents) {
  return (cents / 100).toFixed(2)
}

function selectMember(id) {
  activeMemberId.value = id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function isOpen(id) {
  return activeMemberId.value === id
}

const expandedRel = ref({})

function toggleRel(memberId, peerId) {
  const key = memberId + '-' + peerId
  expandedRel.value[key] = !expandedRel.value[key]
}

const avatarColors = ['#2b3a67', '#7a5c3a', '#4a6b3a', '#a87c2c', '#b54b3a']
function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function whyTitle(m) {
  const hint = m.why.narrativeHint
  if (hint === 'major_creditor') return '为什么所有人都付给我？'
  if (hint === 'creditor') return '为什么我会收到转账？'
  if (m.tasks.length === 1) return `为什么我只付给 ${m.tasks[0].toName}？`
  return '为什么我的转账方案是这样的？'
}

function whyText(m) {
  const w = m.why
  const balance = Math.abs(m.netCard.balance)
  if (w.isNetCreditor) {
    return `我替他人垫付 <span class="pos">¥${money(w.totalPaidForOthers)}</span>，他人仅替我垫付 ¥${money(w.totalOthersPaidForMe)}。净应收 <span class="pos">+¥${money(balance)}</span>，所有债务人都直接对我结算。`
  }
  const creditors = m.tasks.map(t => `付给 ${t.toName} ¥${money(t.amount)}`).join('　')
  return `我共消费 <strong>¥${money(m.netCard.owed)}</strong>，支付 ¥${money(m.netCard.paid)}，净应付 <strong>−¥${money(balance)}</strong>。系统做<strong>净额抵消</strong>后，我直接付给最终债权人。`
}
</script>

<template>
  <div class="stage" v-if="trip">
    <div class="receipt-head">
      <div class="rh-top">
        <div>
          <div class="rh-title">结 算 依 据</div>
          <div class="rh-sub">SETTLEMENT · BREAKDOWN</div>
        </div>
        <div class="rh-stamp">已对账</div>
      </div>
      <div class="rh-meta">
        <span>旅行 · {{ trip.name }}</span>
        <span>{{ new Date().toLocaleDateString('zh-CN') }}</span>
      </div>
      <div class="rh-summary">
        <div class="rh-sum-item">
          <div class="rh-sum-label">总支出</div>
          <div class="rh-sum-val">¥{{ money(analysis.memberBalances.reduce((s, b) => s + b.paid, 0)) }}</div>
        </div>
        <div class="rh-sum-item">
          <div class="rh-sum-label">账单数</div>
          <div class="rh-sum-val small">{{ trip.expenses.length }}</div>
        </div>
        <div class="rh-sum-item">
          <div class="rh-sum-label">转账笔数</div>
          <div class="rh-sum-val small">{{ analysis.transactions.length }}</div>
        </div>
      </div>
    </div>

    <div class="tab-row">
      <button
        v-for="m in analysis.members"
        :key="m.memberId"
        :class="['tab', { active: isOpen(m.memberId) }]"
        @click="selectMember(m.memberId)"
      >
        <div class="tab-name">{{ m.memberName }}</div>
        <div class="tab-tag" :class="m.netCard.isPositive ? 'pos' : (m.netCard.balance < 0 ? 'neg' : '')">
          {{ m.netCard.isPositive ? '应收 ¥' + money(m.netCard.balance) : (m.netCard.balance < 0 ? '应付 ¥' + money(-m.netCard.balance) : '已平账') }}
        </div>
      </button>
    </div>

    <div class="panels">
      <div v-for="m in analysis.members" :key="m.memberId" :class="['panel', { active: isOpen(m.memberId) }]">
        <div class="net-card">
          <div class="net-label">成员 · 净额</div>
          <div class="net-name">{{ m.memberName }}</div>
          <div :class="['net-amount', m.netCard.isPositive ? 'pos' : 'neg']">
            {{ m.netCard.isPositive ? '+' : '−' }}¥{{ money(Math.abs(m.netCard.balance)) }}<span class="unit">元</span>
          </div>
          <div class="net-foot">
            <span>已支付 ¥{{ money(m.netCard.paid) }}</span>
            <span>应承担 ¥{{ money(m.netCard.owed) }}</span>
          </div>
        </div>

        <div v-if="m.tasks.length === 0" class="task-bar">
          <div>
            <div class="task-label">转账任务</div>
            <div class="task-item" style="color:var(--ink-soft)">已平账，无需转账</div>
          </div>
        </div>
        <div v-else :class="['task-bar', m.netCard.isPositive ? 'recv' : 'pay']">
          <div>
            <div class="task-label">{{ m.netCard.isPositive ? '应收来源' : '应付去向' }}</div>
            <div class="task-list">
              <div v-for="t in m.tasks" :key="t.fromId + t.toId" class="task-item">
                <span class="who">{{ t.fromName }}</span>
                <span class="arr">→</span>
                <span class="who">{{ t.toName }}</span>
                <span :class="['amt', t.direction === 'out' ? 'neg' : 'pos']" style="float:right">
                  {{ t.direction === 'out' ? '-' : '+' }}¥{{ money(t.amount) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="sec-title">
          <span class="bar"></span>
          <h2>与 他 人 往 来</h2>
          <span class="num">{{ m.relations.length }} 方</span>
          <span class="bar"></span>
        </div>

        <div
          v-for="r in m.relations"
          :key="r.peerId"
          :class="['rel-card', { open: expandedRel[m.memberId + '-' + r.peerId] }]"
        >
          <div
            class="rel-head"
            @click="toggleRel(m.memberId, r.peerId)"
          >
            <div class="rel-avatar" :style="{ background: avatarColor(r.peerName) }">{{ r.peerName[0] }}</div>
            <div class="rel-mid">
              <div class="rel-name">与 {{ r.peerName }} 的往来</div>
              <div class="rel-sub">我垫付 ¥{{ money(r.iGave) }} · Ta 垫付 ¥{{ money(r.theyGave) }}</div>
            </div>
            <div :class="['rel-net', r.net > 0 ? 'pos' : (r.net < 0 ? 'neg' : '')]">
              <span class="lbl">{{ r.net > 0 ? 'Ta 应付我' : (r.net < 0 ? '我 应付 Ta' : '已两清') }}</span>
              {{ r.net !== 0 ? (r.net > 0 ? '+' : '') + money(Math.abs(r.net)) : '¥0.00' }}
            </div>
            <svg class="rel-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 6 15 12 9 18"/>
            </svg>
          </div>
          <div class="rel-body">
            <div class="rel-inner">
              <template v-if="r.iPaidForPeer.length">
                <div class="flow-row">
                  <span class="flow-tag pay">我替 Ta 垫付</span>
                  <span class="flow-amt neg">−¥{{ money(r.iGave) }}</span>
                </div>
                <div class="bill-list">
                  <div v-for="b in r.iPaidForPeer" :key="b.expenseId" class="bill">
                    <div class="bill-l">
                      <div class="bill-purpose">{{ b.purpose }}</div>
                      <div class="bill-meta">{{ b.time }} · 我付款 · {{ b.beneficiaryCount }}人分摊</div>
                    </div>
                    <div class="bill-share">
                      −¥{{ money(b.share) }}<span class="of"> /¥{{ money(b.totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <template v-if="r.peerPaidForMe.length">
                <div class="flow-row">
                  <span class="flow-tag recv">Ta 替我垫付</span>
                  <span class="flow-amt pos">+¥{{ money(r.theyGave) }}</span>
                </div>
                <div class="bill-list">
                  <div v-for="b in r.peerPaidForMe" :key="b.expenseId" class="bill">
                    <div class="bill-l">
                      <div class="bill-purpose">{{ b.purpose }}</div>
                      <div class="bill-meta">{{ b.time }} · {{ b.payerName }}付款 · {{ b.beneficiaryCount }}人分摊</div>
                    </div>
                    <div class="bill-share">
                      +¥{{ money(b.share) }}<span class="of"> /¥{{ money(b.totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <div v-if="!r.iPaidForPeer.length && !r.peerPaidForMe.length" style="color:var(--ink-soft);font-size:13px;padding:4px 0">无往来账单</div>
            </div>
          </div>
        </div>

        <div v-if="m.why.narrativeHint !== 'even'" class="why-card">
          <div class="why-title">{{ whyTitle(m) }}</div>
          <div class="why-text" v-html="whyText(m)"></div>
        </div>

        <div class="algo-foot">
          <strong>净额抵消 · 贪心最小转账</strong><br>
          每人净额 = 总支付 − 总应承担 ｜ 债权人与债务人对冲，最少转账笔数
        </div>
      </div>
    </div>

    <button class="btn-back-bottom" @click="router.push('/settlement')">← 返回结算</button>
  </div>
</template>

<style scoped>
.stage { max-width: 430px; margin: 0 auto; padding: 18px 16px 80px; }

/* receipt head */
.receipt-head {
  position: relative; border: 1px solid var(--rule);
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  padding: 20px 18px 16px; border-radius: 4px; box-shadow: var(--shadow);
}
.receipt-head::before, .receipt-head::after {
  content: ""; position: absolute; top: 8px; width: 4px; height: calc(100% - 16px);
  background: repeating-linear-gradient(180deg, var(--vermilion) 0 6px, transparent 6px 12px);
  opacity: .55;
}
.receipt-head::before { left: 6px }
.receipt-head::after { right: 6px }
.rh-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--rule); padding-bottom: 12px; }
.rh-title { font-family: var(--font-title); font-weight: 900; font-size: 22px; letter-spacing: 2px; }
.rh-sub { font-size: 11px; color: var(--ink-soft); letter-spacing: 1px; margin-top: 2px; }
.rh-stamp {
  border: 1.5px solid var(--vermilion); color: var(--vermilion);
  font-family: var(--font-title); font-weight: 700; font-size: 11px;
  padding: 4px 8px; border-radius: 3px; transform: rotate(4deg);
  letter-spacing: 1px; opacity: .85;
}
.rh-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--ink-soft); margin-top: 10px; font-family: var(--font-mono); }
.rh-summary { display: grid; grid-template-columns: 1fr 1fr 1fr; margin-top: 14px; border-top: 1px solid var(--rule); padding-top: 12px; }
.rh-sum-item { text-align: center; border-right: 1px dashed var(--rule); }
.rh-sum-item:last-child { border-right: none; }
.rh-sum-label { font-size: 10px; color: var(--ink-soft); letter-spacing: 1px; }
.rh-sum-val { font-family: var(--font-mono); font-weight: 700; font-size: 16px; margin-top: 2px; }
.rh-sum-val.small { font-size: 14px; }

/* tabs */
.tab-row { display: flex; gap: 6px; margin-top: 18px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.tab-row::-webkit-scrollbar { display: none; }
.tab {
  flex: 1; min-width: 0; background: #fffdf3; border: 1px solid var(--rule);
  border-radius: 8px; padding: 10px 6px; text-align: center; cursor: pointer;
  transition: all .2s; font: inherit;
}
.tab.active { background: var(--ink); color: #fbf6e8; border-color: var(--ink); }
.tab .tab-name { font-family: var(--font-title); font-weight: 700; font-size: 16px; }
.tab .tab-tag { font-family: var(--font-mono); font-size: 10px; margin-top: 3px; letter-spacing: .5px; }
.tab.active .tab-name { color: #fbf6e8; }
.tab .pos { color: var(--moss); }
.tab .neg { color: var(--vermilion); }
.tab.active .pos, .tab.active .neg { color: inherit; opacity: .85; }

/* panels */
.panels { margin-top: 14px; }
.panel { display: none; animation: fade .35s ease; }
.panel.active { display: block; }
@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* net card */
.net-card {
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 10px;
  padding: 18px 16px; box-shadow: var(--shadow); position: relative; overflow: hidden;
}
.net-card::after { content: ""; position: absolute; right: -30px; top: -30px; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, rgba(43,58,103,.06), transparent 70%); }
.net-label { font-size: 11px; color: var(--ink-soft); letter-spacing: 2px; }
.net-name { font-family: var(--font-title); font-weight: 900; font-size: 28px; margin-top: 2px; }
.net-amount { font-family: var(--font-mono); font-weight: 700; font-size: 34px; margin-top: 8px; letter-spacing: -1px; }
.net-amount.pos { color: var(--moss); }
.net-amount.neg { color: var(--vermilion); }
.net-amount .unit { font-size: 14px; font-weight: 500; margin-left: 4px; opacity: .7; }
.net-foot {
  margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--rule);
  font-size: 11px; color: var(--ink-soft); font-family: var(--font-mono);
  display: flex; justify-content: space-between;
}

/* task bar */
.task-bar {
  margin-top: 12px; border: 1px solid var(--rule); background: #fffdf3;
  border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;
}
.task-bar.recv { border-left: 3px solid var(--moss); }
.task-bar.pay { border-left: 3px solid var(--vermilion); }
.task-label { font-size: 11px; color: var(--ink-soft); letter-spacing: 1px; }
.task-list { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
.task-item { font-family: var(--font-mono); font-weight: 600; font-size: 14px; }
.task-item .arr { color: var(--ink-faint); margin: 0 6px; }
.task-item .who { font-family: var(--font-title); font-weight: 700; }
.task-item .amt.pos { color: var(--moss); }
.task-item .amt.neg { color: var(--vermilion); }

/* section title */
.sec-title { display: flex; align-items: center; gap: 10px; margin: 22px 4px 12px; }
.sec-title .bar { flex: 1; height: 1px; background: var(--rule); }
.sec-title h2 { font-family: var(--font-title); font-weight: 700; font-size: 15px; letter-spacing: 2px; color: var(--ink); }
.sec-title .num { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }

/* relation cards */
.rel-card {
  border: 1px solid var(--rule); background: #fbf6e8; border-radius: 10px;
  margin-bottom: 10px; overflow: hidden; box-shadow: var(--shadow);
}
.rel-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
.rel-avatar {
  width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-title); font-weight: 900; font-size: 16px; color: #fbf6e8;
}
.rel-mid { flex: 1; min-width: 0; }
.rel-name { font-family: var(--font-title); font-weight: 700; font-size: 15px; }
.rel-sub { font-family: var(--font-mono); font-size: 11px; color: var(--ink-soft); margin-top: 2px; }
.rel-net { text-align: right; font-family: var(--font-mono); font-weight: 700; font-size: 15px; }
.rel-net.pos { color: var(--moss); }
.rel-net.neg { color: var(--vermilion); }
.rel-net .lbl { font-size: 9px; color: var(--ink-soft); font-weight: 400; letter-spacing: 1px; display: block; }
.rel-toggle { width: 18px; height: 18px; color: var(--ink-faint); transition: transform .25s; flex-shrink: 0; }
.rel-card.open .rel-toggle { transform: rotate(90deg); }
.rel-body { max-height: 0; overflow: hidden; transition: max-height .35s ease; background: linear-gradient(180deg, #f8f0d8, var(--paper-2)); }
.rel-card.open .rel-body { max-height: 600px; }
.rel-inner { padding: 6px 16px 14px; border-top: 1px dashed var(--rule); }

/* bill rows */
.flow-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; font-size: 12px; }
.flow-row + .flow-row { border-top: 1px dotted rgba(201,184,150,.6); }
.flow-tag { font-family: var(--font-title); font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 3px; letter-spacing: 1px; }
.flow-tag.pay { background: rgba(181,75,58,.12); color: var(--vermilion); }
.flow-tag.recv { background: rgba(74,107,58,.14); color: var(--moss); }
.flow-amt { font-family: var(--font-mono); font-weight: 600; font-size: 13px; }
.flow-amt.pos { color: var(--moss); }
.flow-amt.neg { color: var(--vermilion); }

.bill-list { margin-top: 8px; }
.bill { display: flex; justify-content: space-between; align-items: flex-start; padding: 7px 0; font-size: 12px; border-top: 1px dotted rgba(201,184,150,.5); }
.bill:first-child { border-top: none; }
.bill-l { flex: 1; min-width: 0; }
.bill-purpose { font-weight: 500; font-size: 12.5px; }
.bill-meta { font-family: var(--font-mono); font-size: 10px; color: var(--ink-soft); margin-top: 2px; }
.bill-share { font-family: var(--font-mono); font-weight: 600; font-size: 13px; color: var(--ink); }
.bill-share .of { color: var(--ink-faint); font-weight: 400; font-size: 10px; }

/* why card */
.why-card {
  margin-top: 18px; border: 1px solid var(--rule); border-radius: 10px;
  background: linear-gradient(180deg, #fbf6e8, var(--paper));
  padding: 16px; box-shadow: var(--shadow); position: relative;
}
.why-card::before {
  content: "注"; position: absolute; top: -9px; left: 14px;
  background: var(--ink); color: #fbf6e8; font-family: var(--font-title);
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 3px; letter-spacing: 2px;
}
.why-title { font-family: var(--font-title); font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.why-text { font-size: 12.5px; line-height: 1.7; color: var(--ink); }
.why-text strong { font-family: var(--font-mono); color: var(--vermilion); }
.why-text .pos { font-family: var(--font-mono); color: var(--moss); font-weight: 600; }

/* algo foot */
.algo-foot {
  margin-top: 22px; padding: 14px; border-top: 1px dashed var(--rule);
  font-size: 10.5px; color: var(--ink-soft); line-height: 1.7;
  text-align: center; font-family: var(--font-mono);
}
.algo-foot strong { color: var(--ink); font-family: var(--font-title); font-weight: 700; }

.btn-back-bottom {
  display: block; margin: 24px auto 0; padding: 12px 24px;
  font-size: 14px; color: var(--ink); background: transparent;
  border: 1px dashed var(--rule); border-radius: 8px; cursor: pointer;
  font-family: var(--font-title);
}
</style>
