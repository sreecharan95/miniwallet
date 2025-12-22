import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User, Wallet } from "../models/modelRelations";
import { auth, AuthRequest } from "../utils/auth";


const router = Router();

router.post("/registeruser", async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, password: hash });
  await Wallet.create({ userId: user.id });
  res.json({ message: "User registered" });
});

router.post("/loginuser", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email } });
  if (!user) return res.sendStatus(401);
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.sendStatus(401);
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET!);
  res.json({ token });
});

router.get("/currentuswaller", auth, async (req: AuthRequest, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ["id", "name", "email"]
  });
  res.json(user);
});

export default router;
