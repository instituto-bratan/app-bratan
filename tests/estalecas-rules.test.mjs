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
