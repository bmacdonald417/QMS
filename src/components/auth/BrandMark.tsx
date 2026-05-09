/**
 * BrandMark — MacTech Quality product badge for the QMS auth left panel.
 * Mirrors vetted's BrandMark structure (logo + uppercase eyebrow + headline +
 * supporting paragraph) so users moving between MacTech apps feel an
 * immediate kinship.
 *
 * Copy is QMS-specific per the research brief — MacTech Quality, the quality
 * system auditors trust. Do NOT swap to clearD's "cleared talent" copy.
 */
export function BrandMark() {
  return (
    <div>
      <img
        src="/mactech.png"
        alt="MacTech Solutions"
        className="h-12 xl:h-14 w-auto object-contain object-left mb-8 invert"
      />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F1994C] mb-3">
        Quality Management System
      </p>
      <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-white leading-tight">
        The quality system
        <br />
        auditors trust.
      </h1>
      <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-md">
        ISO 9001 / 17025 aligned document control, CAPA, audits, change
        control, and competency tracking for regulated work.
      </p>
    </div>
  );
}
