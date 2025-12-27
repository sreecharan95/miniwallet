import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import "./models/modelRelations";
import { sequelize } from "./config";
import { createDatabaseIfNotExists } from "./utils/createDB";

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await createDatabaseIfNotExists();
    await sequelize.authenticate();
    await sequelize.sync();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
}

startServer();
