import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config";

export class Wallet extends Model {
  public id!: string;
  public balance!: number;
  public currency!: string;
  public userId!: string;
}

Wallet.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  balance: {
    type: DataTypes.DECIMAL(14, 2),
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: "USD"
  }
}, { sequelize, tableName: "wallets" });
