/**
 * NovaBank fixture data. Realistic, demo-ready — every UI state below is
 * reachable without a backend.
 */

export type RiskLevel = "low" | "medium" | "high";
export type RiskAction = "allow" | "step_up" | "block";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phoneMasked: string;
  avatarUrl: string | null;
  memberSince: string;
}

export interface AccountSummary {
  accountId: string;
  nickname: string;
  maskedNumber: string;
  balanceMinor: number;
  currency: "INR";
  availableMinor: number;
  monthChangeMinor: number;
}

export interface Transaction {
  id: string;
  merchant: string;
  category:
    | "salary"
    | "transfer"
    | "food"
    | "transport"
    | "shopping"
    | "utilities"
    | "subscription"
    | "refund";
  date: string;
  amountMinor: number;
  status: "settled" | "pending" | "declined";
  method: string;
}

export interface ActivityEvent {
  id: string;
  type: "login" | "transfer" | "alert" | "passkey";
  timestamp: string;
  device: string;
  city: string;
  country: string;
  ipMasked: string;
  risk: RiskLevel;
  signal: string;
  sessionActive: boolean;
}

export interface Passkey {
  id: string;
  deviceName: string;
  platform: string;
  addedAt: string;
  lastUsedAt: string;
  synced: boolean;
}

export const mockUser: UserProfile = {
  id: "usr_9fb21",
  name: "Rohan Patil",
  email: "rohan.patil@hey.com",
  phoneMasked: "+91 ••••• 41 82",
  avatarUrl: null,
  memberSince: "2023-11-04",
};

export const mockAccount: AccountSummary = {
  accountId: "acc_4471",
  nickname: "Everyday",
  maskedNumber: "•••• 4471",
  balanceMinor: 18426550,
  currency: "INR",
  availableMinor: 18106550,
  monthChangeMinor: 214300,
};

export const mockTransactions: Transaction[] = [
  {
    id: "txn_01",
    merchant: "Blue Tokai Coffee",
    category: "food",
    date: "2026-08-05T08:12:00Z",
    amountMinor: -46000,
    status: "settled",
    method: "Card •• 4471",
  },
  {
    id: "txn_02",
    merchant: "Ananya Iyer",
    category: "transfer",
    date: "2026-08-04T19:40:00Z",
    amountMinor: -1250000,
    status: "settled",
    method: "UPI · passkey verified",
  },
  {
    id: "txn_03",
    merchant: "Kaleidoscope Studio",
    category: "salary",
    date: "2026-08-01T04:30:00Z",
    amountMinor: 42500000,
    status: "settled",
    method: "Payroll credit",
  },
  {
    id: "txn_04",
    merchant: "Uber India",
    category: "transport",
    date: "2026-07-31T15:22:00Z",
    amountMinor: -31800,
    status: "settled",
    method: "Card •• 4471",
  },
  {
    id: "txn_05",
    merchant: "Tata Power",
    category: "utilities",
    date: "2026-07-30T06:05:00Z",
    amountMinor: -284500,
    status: "pending",
    method: "Auto-pay",
  },
  {
    id: "txn_06",
    merchant: "Figma",
    category: "subscription",
    date: "2026-07-29T09:00:00Z",
    amountMinor: -132000,
    status: "settled",
    method: "Card •• 4471",
  },
  {
    id: "txn_07",
    merchant: "Nykaa",
    category: "shopping",
    date: "2026-07-27T13:44:00Z",
    amountMinor: -389900,
    status: "declined",
    method: "Blocked · unusual device",
  },
  {
    id: "txn_08",
    merchant: "Zepto",
    category: "refund",
    date: "2026-07-26T11:10:00Z",
    amountMinor: 74500,
    status: "settled",
    method: "Refund",
  },
];

export const mockActivity: ActivityEvent[] = [
  {
    id: "evt_01",
    type: "login",
    timestamp: "2026-08-05T03:18:00Z",
    device: "iPhone 15 · Safari",
    city: "Pune",
    country: "India",
    ipMasked: "49.36.•••.•••",
    risk: "low",
    signal: "Known device, usual location, typical hour",
    sessionActive: true,
  },
  {
    id: "evt_02",
    type: "transfer",
    timestamp: "2026-08-04T19:40:00Z",
    device: "MacBook Air · Chrome",
    city: "Pune",
    country: "India",
    ipMasked: "49.36.•••.•••",
    risk: "low",
    signal: "Step-up passkey confirmed for ₹12,500",
    sessionActive: true,
  },
  {
    id: "evt_03",
    type: "login",
    timestamp: "2026-08-02T22:07:00Z",
    device: "Windows 11 · Edge",
    city: "Hyderabad",
    country: "India",
    ipMasked: "103.21.•••.•••",
    risk: "medium",
    signal: "New device on a familiar network — email code required",
    sessionActive: false,
  },
  {
    id: "evt_04",
    type: "alert",
    timestamp: "2026-07-27T13:44:00Z",
    device: "Android · unknown build",
    city: "Lagos",
    country: "Nigeria",
    ipMasked: "197.210.•••.•••",
    risk: "high",
    signal: "Impossible travel + emulated device fingerprint. Sign-in blocked.",
    sessionActive: false,
  },
  {
    id: "evt_05",
    type: "passkey",
    timestamp: "2026-07-20T10:02:00Z",
    device: "iPad Air · Safari",
    city: "Pune",
    country: "India",
    ipMasked: "49.36.•••.•••",
    risk: "low",
    signal: "Passkey added and verified on device",
    sessionActive: true,
  },
];

export const mockPasskeys: Passkey[] = [
  {
    id: "pk_01",
    deviceName: "Rohan's iPhone 15",
    platform: "iCloud Keychain",
    addedAt: "2023-11-04T09:12:00Z",
    lastUsedAt: "2026-08-05T03:18:00Z",
    synced: true,
  },
  {
    id: "pk_02",
    deviceName: "MacBook Air (M3)",
    platform: "Touch ID",
    addedAt: "2024-06-18T14:41:00Z",
    lastUsedAt: "2026-08-04T19:39:00Z",
    synced: true,
  },
  {
    id: "pk_03",
    deviceName: "YubiKey 5C",
    platform: "Hardware key",
    addedAt: "2025-02-02T08:00:00Z",
    lastUsedAt: "2026-06-11T17:25:00Z",
    synced: false,
  },
];

export const mockRecoveryCodes = {
  remaining: 10,
  total: 10,
  lastGeneratedAt: "2025-02-02T08:01:00Z",
  codes: [
    "4F2K-9QXA",
    "7HBM-2LDP",
    "QW83-JR5T",
    "ZN41-8VCE",
    "MP60-KT7S",
    "3DXR-YB92",
    "L5TQ-64WN",
    "8JVH-PZ3M",
    "RK29-D7FA",
    "TX54-N8GB",
  ],
};

export const mockNotificationPrefs = [
  {
    id: "new_device",
    label: "Email me when a new device signs in",
    hint: "Sent within seconds of the session starting",
    enabled: true,
  },
  {
    id: "large_transfer",
    label: "Email me for transfers above ₹10,000",
    hint: "Receipt plus the device that approved it",
    enabled: true,
  },
  {
    id: "blocked",
    label: "Email me when we block a sign-in",
    hint: "Includes the signal that triggered the block",
    enabled: true,
  },
  {
    id: "product",
    label: "Product updates from NovaBank",
    hint: "Roughly once a month. No marketing blasts.",
    enabled: false,
  },
];

export const STEP_UP_THRESHOLD_MINOR = 1000000; // ₹10,000

export function formatINR(minor: number, opts?: { signed?: boolean }) {
  const value = Math.abs(minor) / 100;
  const formatted = value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
  if (!opts?.signed) return formatted;
  return `${minor < 0 ? "−" : "+"}${formatted}`;
}
