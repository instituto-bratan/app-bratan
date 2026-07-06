import test from "node:test";
import assert from "node:assert/strict";

function approvedBalance(transactions, now = new Date("2026-06-29T12:00:00.000Z")) {
  return transactions.reduce((sum, transaction) => {
    if (transaction.status !== "approved") return sum;
    if (transaction.expiresAt && new Date(transaction.expiresAt) <= now) return sum;
    return sum + transaction.amount;
  }, 0);
}

function makeGymCheckin(userId, date, createdAt = `${date}T10:00:00.000Z`, status = "valid") {
  return {
    id: `${userId}-${date}-${status}`,
    userId,
    checkinType: "gym",
    checkinDate: date,
    status,
    checkpointsAwarded: status === "valid" ? 1 : 0,
    createdAt,
  };
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + amount);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function bestRun(dateKeys) {
  if (!dateKeys.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < dateKeys.length; index += 1) {
    if (dateKeys[index] === addDays(dateKeys[index - 1], 1)) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function monthlyRanking(checkins, reference = new Date("2026-06-29T12:00:00.000Z")) {
  const month = `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}`;
  const monthCheckins = checkins.filter((checkin) => checkin.checkinType === "gym" && checkin.checkinDate.startsWith(month));
  const userIds = [...new Set(monthCheckins.map((checkin) => checkin.userId))];
  return userIds
    .map((userId) => {
      const valid = monthCheckins
        .filter((checkin) => checkin.userId === userId && checkin.status === "valid")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const invalid = monthCheckins.filter((checkin) => checkin.userId === userId && checkin.status === "invalid");
      const dates = [...new Set(valid.map((checkin) => checkin.checkinDate))].sort();
      return {
        userId,
        validGymCheckins: valid.length,
        bestMonthStreak: bestRun(dates),
        firstReachedFinalAt: valid.at(-1)?.createdAt ?? "",
        invalidCheckins: invalid.length,
      };
    })
    .filter((entry) => entry.validGymCheckins > 0)
    .sort((a, b) => {
      if (a.validGymCheckins !== b.validGymCheckins) return b.validGymCheckins - a.validGymCheckins;
      if (a.bestMonthStreak !== b.bestMonthStreak) return b.bestMonthStreak - a.bestMonthStreak;
      if (a.firstReachedFinalAt !== b.firstReachedFinalAt) return a.firstReachedFinalAt.localeCompare(b.firstReachedFinalAt);
      if (a.invalidCheckins !== b.invalidCheckins) return a.invalidCheckins - b.invalidCheckins;
      return a.userId.localeCompare(b.userId);
    })
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

function performCheckin({ userId, type, date, checkins, transactions }) {
  const existing = checkins.find((checkin) => checkin.userId === userId && checkin.checkinType === type && checkin.checkinDate === date);
  if (existing) return { created: false, checkins, transactions };
  const transaction = {
    id: `tx-${userId}-${type}-${date}`,
    userId,
    type: "checkin",
    source: type === "gym" ? "gym_checkin" : "church_checkin",
    amount: type === "gym" ? 15 : 10,
    status: "approved",
    createdAt: `${date}T10:00:00.000Z`,
  };
  return {
    created: true,
    checkins: [...checkins, makeGymCheckin(userId, date)],
    transactions: [...transactions, transaction],
  };
}

function normalizeCode(code) {
  return code
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function localCodeHash(code) {
  const normalized = normalizeCode(code);
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(index);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isActiveCode(code, input, date) {
  return code.active && code.eventDate === date && code.codeHash === localCodeHash(input);
}

function milestoneRewardIfNeeded({ userId, checkins, rewards }) {
  const total = checkins
    .filter((checkin) => checkin.userId === userId && checkin.checkinType === "gym" && checkin.status === "valid")
    .reduce((sum, checkin) => sum + checkin.checkpointsAwarded, 0);
  const alreadyRewarded = rewards.some((reward) => reward.userId === userId && reward.rewardType === "milestone_500");
  if (total >= 500 && !alreadyRewarded) {
    return { rewardType: "milestone_500", userId };
  }
  return null;
}

function reversalOriginalIds(transactions) {
  return transactions
    .filter((transaction) => transaction.type === "reversal" && transaction.metadata?.originalTransactionId)
    .map((transaction) => transaction.metadata.originalTransactionId);
}

function canCreateReversal(transactions, originalTransactionId) {
  return !reversalOriginalIds(transactions).includes(originalTransactionId);
}

function canApproveTransaction(transactions, candidate) {
  if (candidate.status !== "approved" || candidate.amount >= 0) return true;
  const currentBalance = approvedBalance(
    transactions.filter((transaction) => transaction.userId === candidate.userId && transaction.id !== candidate.id),
  );
  return currentBalance + candidate.amount >= 0;
}

function calculateCashbackAmount(purchaseAmount, percent, maxAmount) {
  return Math.max(1, Math.min(maxAmount, Math.floor((purchaseAmount * percent) / 100)));
}

function canCreateManualReward(form) {
  return Boolean(form.userId && form.title?.trim() && form.description?.trim() && form.reason?.trim().length >= 8);
}

test("ledger soma apenas transações aprovadas e não expiradas", () => {
  const balance = approvedBalance([
    { amount: 100, status: "approved" },
    { amount: 50, status: "pending" },
    { amount: 25, status: "rejected" },
    { amount: 30, status: "approved", expiresAt: "2026-06-01T00:00:00.000Z" },
    { amount: -20, status: "approved" },
  ]);
  assert.equal(balance, 80);
});

test("check-in diário é idempotente e não duplica Estalecas", () => {
  const first = performCheckin({ userId: "u1", type: "gym", date: "2026-06-29", checkins: [], transactions: [] });
  const second = performCheckin({ userId: "u1", type: "gym", date: "2026-06-29", checkins: first.checkins, transactions: first.transactions });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.checkins.length, 1);
  assert.equal(second.transactions.length, 1);
});

test("check-in por código exige código ativo do dia", () => {
  const activeCode = {
    active: true,
    eventDate: "2026-06-29",
    codeHash: localCodeHash("BRATAN-ABCD"),
  };
  const inactiveCode = {
    active: false,
    eventDate: "2026-06-29",
    codeHash: localCodeHash("BRATAN-WXYZ"),
  };

  assert.equal(isActiveCode(activeCode, "bratan abcd", "2026-06-29"), true);
  assert.equal(isActiveCode(activeCode, "BRATAN-ERRADO", "2026-06-29"), false);
  assert.equal(isActiveCode(activeCode, "BRATAN-ABCD", "2026-06-30"), false);
  assert.equal(isActiveCode(inactiveCode, "BRATAN-WXYZ", "2026-06-29"), false);
});

test("ranking mensal usa desempate determinístico por sequência", () => {
  const checkins = [
    ...["2026-06-01", "2026-06-02", "2026-06-03"].map((date) => makeGymCheckin("u1", date)),
    ...["2026-06-01", "2026-06-03", "2026-06-05"].map((date) => makeGymCheckin("u2", date)),
  ];
  const ranking = monthlyRanking(checkins);
  assert.equal(ranking[0].userId, "u1");
  assert.equal(ranking[0].position, 1);
});

test("ranking não cria dois vencedores para o mesmo mês", () => {
  const ranking = monthlyRanking([
    makeGymCheckin("u2", "2026-06-01", "2026-06-01T09:00:00.000Z"),
    makeGymCheckin("u1", "2026-06-01", "2026-06-01T09:00:00.000Z"),
  ]);
  const winners = ranking.filter((entry) => entry.position === 1);
  assert.equal(winners.length, 1);
  assert.equal(winners[0].userId, "u1");
});

test("marco de 500 checkpoints é entregue uma única vez", () => {
  const checkins = Array.from({ length: 500 }, (_, index) => makeGymCheckin("u1", `2026-06-${String((index % 29) + 1).padStart(2, "0")}`));
  const firstReward = milestoneRewardIfNeeded({ userId: "u1", checkins, rewards: [] });
  const secondReward = milestoneRewardIfNeeded({ userId: "u1", checkins, rewards: [firstReward] });
  assert.equal(firstReward.rewardType, "milestone_500");
  assert.equal(secondReward, null);
});

test("cashback pendente não entra no saldo, aprovado entra, recusado não entra", () => {
  const pending = { amount: 90, status: "pending", type: "cashback" };
  const approved = { amount: 90, status: "approved", type: "cashback" };
  const rejected = { amount: 90, status: "rejected", type: "cashback" };
  assert.equal(approvedBalance([pending]), 0);
  assert.equal(approvedBalance([approved]), 90);
  assert.equal(approvedBalance([rejected]), 0);
});

test("cashback respeita percentual configurado e teto por transação", () => {
  assert.equal(calculateCashbackAmount(1000, 3, 500), 30);
  assert.equal(calculateCashbackAmount(50000, 3, 500), 500);
});

test("estorno de cashback cria lançamento separado no ledger", () => {
  const cashback = {
    id: "cashback-1",
    amount: 120,
    status: "approved",
    type: "cashback",
    source: "cashback",
  };
  const reversal = {
    id: "reversal-1",
    amount: -120,
    status: "approved",
    type: "reversal",
    source: "cashback",
    metadata: { originalTransactionId: cashback.id },
  };

  assert.equal(cashback.status, "approved");
  assert.equal(approvedBalance([cashback, reversal]), 0);
  assert.equal(reversal.metadata.originalTransactionId, cashback.id);
});

test("estorno de cashback só pode existir uma vez por transação original", () => {
  const existingTransactions = [
    {
      id: "reversal-1",
      amount: -120,
      status: "approved",
      type: "reversal",
      metadata: { originalTransactionId: "cashback-1" },
    },
  ];

  assert.equal(canCreateReversal(existingTransactions, "cashback-1"), false);
  assert.equal(canCreateReversal(existingTransactions, "cashback-2"), true);
});

test("transação negativa aprovada não pode deixar saldo abaixo de zero", () => {
  const transactions = [
    {
      id: "earn-1",
      userId: "u1",
      amount: 80,
      status: "approved",
      type: "earn",
    },
  ];

  assert.equal(canApproveTransaction(transactions, { id: "spend-1", userId: "u1", amount: -50, status: "approved" }), true);
  assert.equal(canApproveTransaction(transactions, { id: "spend-2", userId: "u1", amount: -90, status: "approved" }), false);
});

test("prêmio manual exige colaborador, descrição e motivo administrativo", () => {
  assert.equal(canCreateManualReward({ userId: "u1", title: "Brinde", description: "Suplemento", reason: "meta batida" }), true);
  assert.equal(canCreateManualReward({ userId: "u1", title: "Brinde", description: "Suplemento", reason: "curto" }), false);
});

test("conquistas com prova têm valores padrão e rótulos definidos", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const vm = await import("node:vm");
  const url = await import("node:url");
  const ts = (await import("typescript")).default;
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.resolve(root, "src/features/estalecas/estalecasData.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return { readLocalValue: (_k, fallback) => fallback, writeLocalValue: () => undefined, todayISO: () => "2026-07-06" };
    if (request.startsWith("@/types")) return {};
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Array, Intl, crypto: globalThis.crypto }, { filename: "estalecasData.ts" });
  const { estalecaClaimConfig, estalecaClaimStatusLabels } = module.exports;
  assert.equal(estalecaClaimConfig.LEITURA.defaultAmount, 100);
  assert.equal(estalecaClaimConfig.ALIMENTACAO.defaultAmount, 10);
  assert.equal(estalecaClaimConfig.OUTRO.defaultAmount, 0);
  assert.deepEqual(Object.keys(estalecaClaimStatusLabels).sort(), ["APPROVED", "PENDING", "REJECTED"]);
});

test("check-in de academia exige código do dia validado (anti-fraude)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const vm = await import("node:vm");
  const url = await import("node:url");
  const ts = (await import("typescript")).default;
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.resolve(root, "src/features/estalecas/estalecasData.ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === "@/lib/localStore") return { readLocalValue: (_k, fallback) => fallback, writeLocalValue: () => undefined, todayISO: () => "2026-07-06" };
    if (request.startsWith("@/types")) return {};
    throw new Error(`import inesperado: ${request}`);
  };
  vm.runInNewContext(output, { module, exports: module.exports, require: localRequire, console, Date, JSON, Object, String, Number, Math, Map, Array, Intl, crypto: globalThis.crypto }, { filename: "estalecasData.ts" });
  const { performLocalCheckin, simpleCheckinCodeHash, defaultEstalecaConfig } = module.exports;

  const now = new Date(2026, 6, 6, 12, 0, 0);
  const eventDate = "2026-07-06";
  const pessoa = { id: "u1" };
  const profile = { userId: "u1", checkinsConsentAt: "2026-07-06T10:00:00.000Z", rankingOptIn: true };
  const eventCodes = [{
    id: "code-1",
    checkinType: "gym",
    label: "Treino do dia",
    codeHash: simpleCheckinCodeHash("TREINO-0607"),
    codePreview: "TR-07",
    eventDate,
    active: true,
  }];
  const base = { pessoa, transactions: [], checkins: [], rewards: [], eventCodes, profile, config: defaultEstalecaConfig, now };

  assert.throws(() => performLocalCheckin({ ...base, checkinType: "gym" }), /gym_code_required/);
  assert.throws(() => performLocalCheckin({ ...base, checkinType: "gym", validationCode: "QUALQUER-COISA" }), /invalid_checkin_code/);
  assert.throws(() => performLocalCheckin({ ...base, checkinType: "church", validationCode: "TREINO-0607" }), /invalid_checkin_code/);

  const ok = performLocalCheckin({ ...base, checkinType: "gym", validationCode: "treino 0607" });
  assert.equal(!!ok.alreadyExists, false);
  assert.equal(ok.checkin.checkinType, "gym");
  assert.equal(ok.transaction.amount, defaultEstalecaConfig.gymCheckinEstalecas);
  assert.equal(ok.transaction.metadata.validationMethod, "event_code");
  assert.equal(ok.checkin.validationMethod, "event_code");
});
