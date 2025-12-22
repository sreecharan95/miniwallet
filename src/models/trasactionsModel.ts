import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config";

export class WalletTransaction extends Model {
  public id!: string;
  public type!: "CREDIT" | "DEBIT";
  public amount!: number;
  public currency!: string;
  public walletId!: string;
}

WalletTransaction.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: DataTypes.ENUM("CREDIT", "DEBIT"),
  amount: DataTypes.DECIMAL(14, 2),
  currency: DataTypes.STRING,
  description: DataTypes.STRING
}, { sequelize, tableName: "transactions" });
