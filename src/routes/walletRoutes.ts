import { Router } from "express";
import { sequelize } from "../config";
import { auth, AuthRequest } from "../utils/authUtils";
import { User, Wallet } from "../models/modelRelations";
import { WalletTransaction } from "../models/trasactionsModel";
import { checkDailyLimit, convertCurrency } from "../utils/commonUtils";
import { z } from "zod";

const router = Router();

const amountSchema = z.object({
  amount: z.coerce.number().positive("Amount must be a positive number"),
  currency: z.string().optional()
});

const transferSchema = z.object({
  toEmail: z.email(),
  amount: z.coerce.number().positive(),
  currency: z.string().optional()
});

router.use(auth);

router.get("/balance", async (req: AuthRequest, res) => {
  try {
    const wallet = await Wallet.findOne({
      where: { userId: req.userId },
      attributes: ["balance", "currency"]
    });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    res.json(wallet);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/currency", async (req: AuthRequest, res) => {
  const currency = req.body.currency?.toUpperCase();
  if (!currency) {
    return res.status(400).json({ message: "Currency required" });
  }
  try {
    const wallet = await Wallet.findOne({ where: { userId: req.userId } });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    if (!wallet.currency) {
      wallet.currency = currency;
      await wallet.save();
      return res.json({
        message: "Currency set",
        balance: wallet.balance,
        currency: wallet.currency
      });
    }
    if (wallet.currency === currency) {
      return res.json({
        message: "Currency unchanged",
        balance: wallet.balance,
        currency: wallet.currency
      });
    }
    const convertedBalance = convertCurrency(
      Number(wallet.balance),
      wallet.currency,
      currency
    );
    wallet.balance = convertedBalance;
    wallet.currency = currency;
    await wallet.save();
    res.json({
      message: "Currency updated",
      balance: wallet.balance,
      currency: wallet.currency
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/deposit", async (req: AuthRequest, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { amount, currency } = parsed.data;
  try {
    const wallet = await Wallet.findOne({ where: { userId: req.userId } });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    const inputCurrency = (currency || wallet.currency).toUpperCase();
    const convertedAmount = convertCurrency(amount, inputCurrency, wallet.currency);
    await sequelize.transaction(async (t) => {
      await wallet.increment({ balance: convertedAmount }, { transaction: t });
      await WalletTransaction.create(
        {
          walletId: wallet.id,
          type: "CREDIT",
          amount: convertedAmount,
          currency: wallet.currency,
          description: `Deposit ${amount} ${inputCurrency}`
        },
        { transaction: t }
      );
    });
    await wallet.reload();
    res.json({
      message: "Deposit successful",
      balance: wallet.balance,
      currency: wallet.currency
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/transfer", async (req: AuthRequest, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { toEmail, amount, currency } = parsed.data;
  try {
    await sequelize.transaction(async (t) => {
      const fromWallet = await Wallet.findOne({
        where: { userId: req.userId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!fromWallet) throw new Error("WALLET_NOT_FOUND");
      await checkDailyLimit(fromWallet.id, amount);
      const toUser = await User.findOne({ where: { email: toEmail }, transaction: t });
      if (!toUser) throw new Error("RECIPIENT_NOT_FOUND");
      if (toUser.id === req.userId) throw new Error("SELF_TRANSFER");
      const toWallet = await Wallet.findOne({
        where: { userId: toUser.id },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!toWallet) throw new Error("RECIPIENT_WALLET_NOT_FOUND");
      const inputCurrency = (currency || fromWallet.currency).toUpperCase();
      const debitAmount = convertCurrency(amount, inputCurrency, fromWallet.currency);
      if (fromWallet.balance < debitAmount) {
        throw new Error("INSUFFICIENT_FUNDS");
      }
      const creditAmount = convertCurrency(amount, inputCurrency, toWallet.currency);
      await fromWallet.decrement({ balance: debitAmount }, { transaction: t });
      await toWallet.increment({ balance: creditAmount }, { transaction: t });
      await WalletTransaction.bulkCreate(
        [
          {
            walletId: fromWallet.id,
            type: "DEBIT",
            amount: debitAmount,
            currency: fromWallet.currency,
            description: `Transfer to ${toEmail}`
          },
          {
            walletId: toWallet.id,
            type: "CREDIT",
            amount: creditAmount,
            currency: toWallet.currency,
            description: `Transfer from user ${req.userId}`
          }
        ],
        { transaction: t }
      );
    });
    res.json({ message: "Transfer successful" });
  } catch (err: any) {
    const map: Record<string, number> = {
      WALLET_NOT_FOUND: 404,
      RECIPIENT_NOT_FOUND: 404,
      RECIPIENT_WALLET_NOT_FOUND: 404,
      INSUFFICIENT_FUNDS: 400,
      SELF_TRANSFER: 400
    };
    const status = map[err.message] || 500;
    res.status(status).json({ message: err.message || "Internal server error" });
  }
});

router.post("/withdraw", async (req: AuthRequest, res) => {
  const parsed = amountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0].message });
  }
  const { amount } = parsed.data;
  try {
    const wallet = await sequelize.transaction(async (t) => {
      const wallet = await Wallet.findOne({
        where: { userId: req.userId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (wallet.balance < amount) throw new Error("INSUFFICIENT_FUNDS");
      await wallet.decrement({ balance: amount }, { transaction: t });
      await WalletTransaction.create(
        {
          walletId: wallet.id,
          type: "DEBIT",
          amount,
          currency: wallet.currency,
          description: "Withdrawal"
        },
        { transaction: t }
      );
      return wallet;
    });
    await wallet.reload();
    res.json({
      message: "Withdrawal successful",
      balance: wallet.balance,
      currency: wallet.currency
    });
  } catch (err: any) {
    if (err.message === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({ message: "Insufficient funds" });
    }
    if (err.message === "WALLET_NOT_FOUND") {
      return res.status(404).json({ message: "Wallet not found" });
    }
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/transactions", async (req: AuthRequest, res) => {
  try {
    const wallet = await Wallet.findOne({ where: { userId: req.userId } });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    const tx = await WalletTransaction.findAll({
      where: { walletId: wallet.id },
      order: [["createdAt", "DESC"]]
    });
    res.json(tx);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
