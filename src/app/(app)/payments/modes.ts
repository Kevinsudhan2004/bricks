import { Banknote, CreditCard, IndianRupee, Landmark, Smartphone } from "lucide-react";

export const MODE = {
  upi: { label: "UPI", icon: Smartphone },
  bank: { label: "Bank", icon: Landmark },
  cash: { label: "Cash", icon: Banknote },
  cheque: { label: "Cheque", icon: CreditCard },
  other: { label: "Other", icon: IndianRupee },
} as const;
