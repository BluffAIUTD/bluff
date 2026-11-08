import { appOrigin, storeOrigin } from "@/lib/config";
import { extensionZip } from "@/components/extension/download";
import { ExtensionGuide } from "@/components/extension/ExtensionGuide";

export const metadata = { title: "Checkout Guard — Bluff" };
export const dynamic = "force-dynamic";

export default function ExtensionPage() {
  return <ExtensionGuide app={appOrigin()} zip={extensionZip()} stores={{ scam: storeOrigin("fastkicks-shop"), legit: storeOrigin("bayou-bakery") }} />;
}
