import { getConfig } from "../config";

/** Capital One Nessie API (http://api.nessieisreal.com). Shapes from the public docs, confirmed against the live API. */
export type NessieAddress = { street_number: string; street_name: string; city: string; state: string; zip: string };
export type NessieCustomer = { _id: string; first_name: string; last_name: string; address: NessieAddress };
export type NessieAccount = { _id: string; type: "Checking" | "Savings" | "Credit Card"; nickname: string; rewards: number; balance: number; account_number?: string; customer_id: string };
export type NessieMerchant = { _id: string; name: string; category: string[] | string; address?: NessieAddress; geocode?: { lat: number; lng: number } };
export type NessiePurchase = {
  _id: string; type: string; merchant_id: string; payer_id: string; purchase_date: string; amount: number;
  status: string; medium: string; description?: string;
};

export class NessieError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function nessieConfigured() { return !!getConfig().nessie.apiKey; }

async function call<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, fetchImpl: typeof fetch = fetch): Promise<T> {
  const c = getConfig().nessie;
  if (!c.apiKey) throw new NessieError(0, "NESSIE_API_KEY is not set");
  const url = `${c.baseUrl.replace(/\/$/, "")}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(c.apiKey)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method,
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new NessieError(0, `Nessie unreachable: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) throw new NessieError(res.status, `Nessie ${method} ${path.split("?")[0]} → ${res.status}: ${text.slice(0, 200)}`);
  if (!text) return undefined as T;
  const j = JSON.parse(text);
  // POSTs answer {code, message, objectCreated}
  return (j && typeof j === "object" && "objectCreated" in j ? j.objectCreated : j) as T;
}

export const nessie = {
  customers: () => call<NessieCustomer[]>("GET", "/customers"),
  customer: (id: string) => call<NessieCustomer>("GET", `/customers/${id}`),
  accounts: (customerId: string) => call<NessieAccount[]>("GET", `/customers/${customerId}/accounts`),
  purchases: (accountId: string) => call<NessiePurchase[]>("GET", `/accounts/${accountId}/purchases`),
  merchants: () => call<NessieMerchant[]>("GET", "/merchants"),
  merchant: (id: string) => call<NessieMerchant>("GET", `/merchants/${id}`),
  createCustomer: (c: Omit<NessieCustomer, "_id">) => call<NessieCustomer>("POST", "/customers", c),
  createAccount: (customerId: string, a: { type: NessieAccount["type"]; nickname: string; rewards: number; balance: number; account_number?: string }) =>
    call<NessieAccount>("POST", `/customers/${customerId}/accounts`, a),
  createMerchant: (m: Omit<NessieMerchant, "_id">) => call<NessieMerchant>("POST", "/merchants", m),
  createPurchase: (accountId: string, p: { merchant_id: string; medium: "balance" | "rewards"; purchase_date: string; amount: number; status?: string; description?: string }) =>
    call<NessiePurchase>("POST", `/accounts/${accountId}/purchases`, p),
  deleteAccount: (id: string) => call<void>("DELETE", `/accounts/${id}`),
};

export const DEMO_CUSTOMER = { first_name: "Maya", last_name: "Patel" };

/** The customer whose purchases we scan: NESSIE_CUSTOMER_ID, else the seeded demo customer, else the first customer. */
export async function resolveCustomer(): Promise<NessieCustomer | null> {
  const id = getConfig().nessie.customerId;
  if (id) return nessie.customer(id);
  const all = await nessie.customers();
  return all.find((c) => c.first_name === DEMO_CUSTOMER.first_name && c.last_name === DEMO_CUSTOMER.last_name) ?? all[0] ?? null;
}
