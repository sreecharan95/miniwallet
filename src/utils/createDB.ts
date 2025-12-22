import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config();

const DB_NAME = "miniwallet";

export const createDatabaseIfNotExists = async () => {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "5432"),
    database: "postgres",
  });

  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'`
    );
    if (res.rowCount === 0) {
      console.log(`Database ${DB_NAME} does not exist yet. Creating...`);
      await client.query(`CREATE DATABASE ${DB_NAME}`);
      console.log(`Database ${DB_NAME} created successfully.`);
    } else {
      console.log(`Database ${DB_NAME} already exists.`);
    }
  } catch (err) {
    console.error("Error creating database:", err);
  } finally {
    await client.end();
  }
};
