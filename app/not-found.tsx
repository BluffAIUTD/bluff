import Link from "next/link";
import { TableMessage } from "@/components/ui/TableMessage";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="min-h-screen px-4 pt-10">
      <TableMessage rank="404" title="That card isn't on the table" message="The page or charge you asked for doesn't exist, or it was deleted."
        actions={<Link href="/" className="btn-brass inline-flex min-h-[48px] items-center rounded-full px-6 text-sm">Back to the overview</Link>} />
    </main>
  );
}
