import { WalletTransaction } from "./trasactionsModel";
import { User } from "./usermodel";
import { Wallet } from "./walletModel";


User.hasOne(Wallet, { foreignKey: "userId" });
Wallet.belongsTo(User, { foreignKey: "userId" });

Wallet.hasMany(WalletTransaction, { foreignKey: "walletId" });
WalletTransaction.belongsTo(Wallet, { foreignKey: "walletId" });

export { User, Wallet, WalletTransaction };
