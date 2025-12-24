import { Op } from "sequelize";
import { WalletTransaction } from "../models/trasactionsModel";

const DAILY_LIMIT = 10000;

export const checkDailyLimit = async (walletId: string, amount: number) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const total = await WalletTransaction.sum("amount", {
    where: {
      walletId,
      type: "DEBIT",
      createdAt: { [Op.gte]: todayStart }
    }
  });
  if ((Number(total) || 0) + amount > DAILY_LIMIT) {
    throw new Error("Daily limit exceeded");
  }
};

const rates: Record<string, number> = {
  USD: 1,
  EUR: 0.9,
  INR: 83
};

export const convertCurrency = (amount: number, from: string, to: string): number => {
  return (amount / rates[from]) * rates[to];
};
