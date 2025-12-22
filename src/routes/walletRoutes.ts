import { Router } from "express";
import { sequelize } from "../config";
import { auth, AuthRequest } from "../utils/auth";
import { Wallet } from "../models/modelRelations";
import { WalletTransaction } from "../models/trasactionsModel";
import { checkDailyLimit, convertCurrency } from "./commonUtils";

const router = Router();

router.get("/walletbalance", auth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  res.json(wallet);
});

router.post("/addtowallet", auth, async (req: AuthRequest, res) => {
  const { amount, currency } = req.body;
  const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  const converted = convertCurrency(amount, currency, wallet!.currency);
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

router.post("/wallettransfer", auth, async (req: AuthRequest, res) => {
  const { toUserId, amount } = req.body;
  const t = await sequelize.transaction();
  
  try {
    const fromWallet = await Wallet.findOne({ where: { userId: req.user.id }, lock: true, transaction: t });
    const toWallet = await Wallet.findOne({ where: { userId: toUserId }, lock: true, transaction: t });
    if (!fromWallet || !toWallet) throw new Error("Wallet not found");
    if (fromWallet.balance < amount) throw new Error("Insufficient funds");
    await checkDailyLimit(fromWallet.id, amount);
    fromWallet.balance -= amount;
    toWallet.balance += amount;
    await fromWallet.save({ transaction: t });
    await toWallet.save({ transaction: t });
    await WalletTransaction.create({
      walletId: fromWallet.id,
      type: "DEBIT",
      amount,
      currency: fromWallet.currency,
      description: "Transfer"
    }, { transaction: t });
    await t.commit();
    res.json({ message: "Transfer successful" });
  } catch (e:any) {
    await t.rollback();
    res.status(400).json({ error: e.message });
  }
});

router.get("/wallettransactions", auth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOne({ where: { userId: req.user.id } });
  const tx = await WalletTransaction.findAll({
    where: { walletId: wallet!.id },
    order: [["createdAt", "DESC"]]
  });
  res.json(tx);
});

export default router;
