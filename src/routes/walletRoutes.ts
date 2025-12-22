import { Router } from "express";
import { sequelize } from "../config";
import { auth, AuthRequest } from "../utils/authUtils";
import { User, Wallet } from "../models/modelRelations";
import { WalletTransaction } from "../models/trasactionsModel";
import { checkDailyLimit, convertCurrency } from "../utils/commonUtils";
import { z } from "zod";

export const validateAmount = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be a positive number")
});

const router = Router();

router.get("/walletbalance", auth, async (req: AuthRequest, res) => {
  try {
    const wallet = await Wallet.findOne({
      where: { userId: req.userId },
      attributes: ["balance", "currency"] 
    });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    res.json(wallet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/currency", auth, async (req: AuthRequest, res) => {
  const userId = req.userId;
  const { currency } = req.body;
  if (!currency) {
    return res.status(400).json({ message: "Currency required" });
  }
  const newCurrency = currency.toUpperCase();
  const wallet = await Wallet.findOne({ where: { userId } });
  if (!wallet) {
    return res.status(404).json({ message: "Wallet not found" });
  }
  if (!wallet.currency) {
    wallet.currency = newCurrency;
    await wallet.save();
    return res.json({
      message: "Currency set",
      balance: wallet.balance,
      currency: wallet.currency
    });
  }
  if (wallet.currency === newCurrency) {
    return res.json({
      message: "Currency same as previous",
      balance: wallet.balance,
      currency: wallet.currency
    });
  }
  const convertedBalance = convertCurrency(
    Number(wallet.balance),
    wallet.currency,
    newCurrency
  );
  wallet.balance = convertedBalance;
  wallet.currency = newCurrency;
  await wallet.save();
  return res.json({
    message: "Balance converted",
    balance: wallet.balance,
    currency: wallet.currency
  });
});

router.post("/addtowallet", auth, async (req: AuthRequest, res) => {
  try {
    const { amount, currency } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    const wallet = await Wallet.findOne({ where: { userId: req.userId } });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    const inputCurrency = (currency || wallet.currency).toUpperCase();
    const convertedAmount = convertCurrency(amount, inputCurrency, wallet.currency);
    await wallet.increment({ balance: convertedAmount });
    await WalletTransaction.create({
      walletId: wallet.id,
      type: "CREDIT",
      amount: convertedAmount,
      currency: wallet.currency,
      description: `Add funds (${amount} ${inputCurrency})`
    });
    res.json({
      message: "Funds added to wallet",
      balance: wallet.balance + convertedAmount,
      currency: wallet.currency
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/wallettransfer", auth, async (req: AuthRequest, res) => {
  try {
    const fromUserId = req.userId;
    const { toEmail, amount, currency } = req.body;
    if (!fromUserId) return res.status(401).json({ message: "Unauthorized" });
    if (!toEmail || !amount || amount <= 0) return res.status(400).json({ message: "Invalid request" });
    const toUser = await User.findOne({ where: { email: toEmail } });
    if (!toUser) return res.status(404).json({ message: "Recipient not found" });
    if (toUser.id === fromUserId) return res.status(400).json({ message: "Cannot transfer to yourself" });
    const fromWallet = await Wallet.findOne({ where: { userId: fromUserId } });
    const toWallet = await Wallet.findOne({ where: { userId: toUser.id } });
   try {
    await checkDailyLimit(fromWallet!.id, amount);
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
    if (!fromWallet || !toWallet) return res.status(404).json({ message: "Wallet not found" });
    const inputCurrency = (currency || fromWallet.currency).toUpperCase();
    const amountInFromCurrency = convertCurrency(amount, inputCurrency, fromWallet.currency);
    if (fromWallet.balance < amountInFromCurrency) {
      return res.status(400).json({ message: "Insufficient funds" });
    }
    const amountInToCurrency = convertCurrency(amount, inputCurrency, toWallet.currency);
    await sequelize.transaction(async (t) => {
      await fromWallet.decrement({ balance: amountInFromCurrency }, { transaction: t });
      await WalletTransaction.create(
        {
          walletId: fromWallet.id,
          type: "DEBIT",
          amount: amountInFromCurrency,
          currency: fromWallet.currency,
          description: `Transfer to ${toUser.email}`
        },
        { transaction: t }
      );
      await toWallet.increment({ balance: amountInToCurrency }, { transaction: t });
      await WalletTransaction.create(
        {
          walletId: toWallet.id,
          type: "CREDIT",
          amount: amountInToCurrency,
          currency: toWallet.currency,
          description: `Transfer from ${fromWallet.userId}`
        },
        { transaction: t }
      );
    });
    res.json({ message: "Transfer successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/withdraw", auth, async (req: AuthRequest, res) => {
  try {
    const parsed = validateAmount.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid request",
      });
    }
    const userId = req.userId;
    const { amount } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });
    const result = await sequelize.transaction(async (t) => {
      const wallet = await Wallet.findOne({
        where: { userId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!wallet) throw new Error("WALLET_NOT_FOUND");
      if (Number(wallet.balance) < amount) throw new Error("INSUFFICIENT_FUNDS");
      const balanceBefore = wallet.balance;
      await wallet.decrement({ balance: amount }, { transaction: t });
      await WalletTransaction.create(
        {
          walletId: wallet.id,
          type: "DEBIT",
          amount,
          currency: wallet.currency,
          balanceBefore,
          balanceAfter: balanceBefore - amount
        },
        { transaction: t }
      );
      return wallet;
    });
    await result.reload(); 
    return res.json({
      message: "Withdrawal successful",
      balance: result.balance,
      currency: result.currency
    });
  } catch (error: any) {
    if (error.message === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({ message: "Insufficient funds" });
    }
    if (error.message === "WALLET_NOT_FOUND") {
      return res.status(404).json({ message: "Wallet not found" });
    }
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


router.get("/wallettransactions", auth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOne({ where: { userId: req.userId } });
  const tx = await WalletTransaction.findAll({
    where: { walletId: wallet!.id },
    order: [["createdAt", "DESC"]]
  });
  res.json(tx);
});

export default router;
