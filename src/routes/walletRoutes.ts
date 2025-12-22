import { Router } from "express";
import { sequelize } from "../config";
import { auth, AuthRequest } from "../utils/authUtils";
import { User, Wallet } from "../models/modelRelations";
import { WalletTransaction } from "../models/trasactionsModel";
import { checkDailyLimit, convertCurrency } from "../utils/commonUtils";

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


router.post("/addtowallet", auth, async (req: AuthRequest, res) => {
  const { amount, currency } = req.body;
  const wallet = await Wallet.findOne({ where: { userId: req.userId } });
  const currencyWithFallback = currency || "USD";
  if (!wallet) {
    return res.status(404).json({ message: "Wallet not found" });
  }
  const converted = convertCurrency(amount, currencyWithFallback, wallet!.currency);
  wallet!.balance = Number(wallet!.balance) + converted;
  await wallet!.save();
  await WalletTransaction.create({
    walletId: wallet!.id,
    type: "CREDIT",
    amount: converted,
    currency: wallet!.currency,
    description: "Add funds"
  });
res.json({ message: "Funds added to wallet" });
});

router.post(
  "/wallettransfer",
  auth,
  async (req: AuthRequest, res,) => {
    try {
      const fromUserId = req.userId;
      const { toEmail, amount } = req.body;
      if (!fromUserId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!toEmail || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const toUser = await User.findOne({ where: { email: toEmail } });
      if (!toUser) {
        return res.status(404).json({ message: "Recipient not found" });
      }
      if (toUser.id === fromUserId) {
        return res.status(400).json({ message: "Cannot transfer to yourself" });
      }
      const fromWallet = await Wallet.findOne({ where: { userId: fromUserId } });
      const toWallet = await Wallet.findOne({ where: { userId: toUser.id } });
      if (!fromWallet || !toWallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      if (fromWallet.balance < amount) {
        return res.status(400).json({ message: "Insufficient funds" });
      }
      await sequelize.transaction(async (t) => {
      await toWallet.increment(
        { balance: amount },
        { transaction: t }
      );
      await fromWallet.decrement(
        { balance: amount },
        { transaction: t }
      );
      await WalletTransaction.create(
        {
          walletId: fromWallet.id,
          type: "DEBIT",
          amount,
          currency: fromWallet.currency
        },
        { transaction: t }
      );
      await WalletTransaction.create(
        {
          walletId: toWallet.id,
          type: "CREDIT",
          amount,
          currency: toWallet.currency
        },
        { transaction: t }
      );
    });
      return res.json({ message: "Transfer successful" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get("/wallettransactions", auth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOne({ where: { userId: req.userId } });
  const tx = await WalletTransaction.findAll({
    where: { walletId: wallet!.id },
    order: [["createdAt", "DESC"]]
  });
  res.json(tx);
});

export default router;
