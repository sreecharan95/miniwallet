import express from "express";
import cookieParser from "cookie-parser";
import { limiter } from "./utils/ratelimiter";
import userRoutes from "./routes/userRoutes";
import walletRoutes from "./routes/walletRoutes";
import cors from "cors";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000"], 
    credentials: true,
  })
);


app.use(express.json());
app.use(cookieParser());
app.use(limiter);

app.use("/auth", userRoutes);
app.use("/wallet", walletRoutes);

export default app;
