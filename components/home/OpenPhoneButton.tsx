"use client";

/** Opens the T-Mobile phone preview that lives in the top bar (it owns its own state, so this presses its button). */
export function OpenPhoneButton() {
  function open() {
    const b = document.querySelector<HTMLButtonElement>('button[aria-controls="phone-preview"]');
    if (!b) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (b.getAttribute("aria-expanded") !== "true") b.click();
    b.focus();
  }
  return (
    <button type="button" onClick={open} className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-control border border-line bg-surface2 px-3 text-sm font-medium transition duration-ui hover:border-gray-4">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: "#E20074" }} />
      Open my phone
    </button>
  );
}
