'use client';

export function PrintScorecardButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-xl print:hidden"
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden>
        picture_as_pdf
      </span>
      Print or save PDF
    </button>
  );
}
