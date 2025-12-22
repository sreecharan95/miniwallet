import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config";

export class User extends Model {
  public id!: string;
  public name!: string;
  public email!: string;
  public password!: string;
}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: DataTypes.STRING,
  email: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING
}, { sequelize, tableName: "walletusers" });
