import express from "express";
import dotenv from "dotenv";
import "./models/modelRelations";
import { limiter } from "./utils/ratelimiter";
import userRoutes from "./routes/userRoutes";
import walletRoutes from "./routes/walletRoutes";
import { sequelize } from "./config";
import { createDatabaseIfNotExists } from "./utils/createDB";

dotenv.config();

const app = express();
app.use(express.json());
app.use(limiter);
app.use("/auth", userRoutes);
app.use("/wallet", walletRoutes);

(async () => {
  try {
    await createDatabaseIfNotExists();
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
})();
