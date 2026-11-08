import { storeOrigin } from "../lib/config";

/**
 * The phone's "Messages" inbox: synthetic texts the demo user received (written in the style of our own synthetic set,
 * data/messages/bluff-messages.jsonl; not T-Mobile data, not real senders). Scam links point at Bluff's own demo stores, so
 * a reported text can later be linked to a charge from the same store. Built per request: store URLs depend on BASE_DOMAIN.
 */
export type InboxText = {
  id: string;
  /** Synthetic 555 numbers and short codes only. */
  sender: string;
  /** Display time on the phone, e.g. "9:12 AM" or "Yesterday". */
  received: string;
  body: string;
  /** Ground truth for tests and the presenter, never sent to the browser (the inbox is a quiz, too). */
  scam: boolean;
  /** Demo store the text's link points at (scam texts only). */
  storeSlug?: string;
};

export function scamTexts(): InboxText[] {
  return [
    {
      id: "deliveryfix", sender: "(214) 555-0147", received: "9:12 AM", scam: true, storeSlug: "deliveryfix-help",
      body: `ParcelPoint: Your package is on hold because of an unpaid $1.99 redelivery fee. Pay within 12 hrs or it goes back to the sender: ${storeOrigin("deliveryfix-help")}/track`,
    },
    {
      id: "tollpay", sender: "(469) 555-0132", received: "8:47 AM", scam: true, storeSlug: "tollpay-tx",
      body: `TollPay TX: You have an unpaid toll balance of $12.40. Pay within 24 hours to avoid a late fee and suspension of your vehicle registration: ${storeOrigin("tollpay-tx")}/pay`,
    },
    {
      id: "bank", sender: "(214) 555-0188", received: "Yesterday", scam: true,
      body: "Cedar Trust Fraud Alert: a $482.16 charge on your card was flagged. If this wasn't you, reply with your card number and PIN to cancel it, or call 1-888-555-0143 immediately.",
    },
    {
      id: "bakery", sender: "72684", received: "Yesterday", scam: false,
      body: "Bayou Bakery: your order #2281 is ready for pickup until 6 PM today.",
    },
    {
      id: "books", sender: "(512) 555-0110", received: "Mon", scam: false,
      body: "Northloop Books: your special order has arrived. Pick it up at the front desk anytime this week.",
    },
  ];
}

export const findInboxText = (id: string) => scamTexts().find((t) => t.id === id) ?? null;
