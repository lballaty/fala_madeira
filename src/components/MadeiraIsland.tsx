// File: src/components/MadeiraIsland.tsx
// Description: Lightweight decorative SVG of the Madeira archipelago — a stylized silhouette of
//   Madeira island (broad in the west, tapering east to the Ponta de São Lourenço point) with a
//   subtle central mountain ridge, plus the companion islands Porto Santo (NE) and the Desertas
//   (SE). Pure inline SVG, no dependencies; renders in `currentColor` so it inherits the parent's
//   text color and themes automatically (light/dark). Used for a sense of place on the onboarding
//   welcome screen and as a small glyph on Home. Not a precise cartographic outline — a clean,
//   recognizable stylization ("nothing complicated").
// Author: Libor Ballaty (with assistant)
// Created: 2026-07-14

interface MadeiraIslandProps {
  className?: string;
  /** Show Porto Santo + Desertas companion islands and the ridge detail. Off = just Madeira,
   *  for small glyph sizes where the extras would be clutter. Default: true. */
  archipelago?: boolean;
  /** Accessible label; set to '' (with aria-hidden) for purely decorative use. */
  title?: string;
}

export const MadeiraIsland = ({
  className,
  archipelago = true,
  title = 'Madeira',
}: MadeiraIslandProps) => (
  <svg
    viewBox="0 0 220 120"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role={title ? 'img' : undefined}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : true}
  >
    {title && <title>{title}</title>}

    {/* Madeira — broad rounded west, tapering to the eastern Ponta de São Lourenço point. */}
    <path
      d="M26 62 C22 50 44 46 70 48 C98 45 126 43 152 50 C176 55 196 57 210 62
         C194 66 174 68 150 70 C124 74 96 76 70 73 C50 71 32 71 26 62 Z"
      fill="currentColor"
    />

    {archipelago && (
      <>
        {/* Subtle central mountain ridge (Madeira is famously mountainous). */}
        <path
          d="M50 60 C70 53 88 57 108 52 C128 48 146 54 166 57"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-white/40 dark:text-black/25"
          opacity="0.9"
        />
        {/* Porto Santo — small island to the north-east. */}
        <ellipse cx="196" cy="30" rx="9" ry="4.2" transform="rotate(-28 196 30)" fill="currentColor" opacity="0.7" />
        {/* Desertas — thin uninhabited islets to the south-east. */}
        <ellipse cx="170" cy="96" rx="2.4" ry="8" transform="rotate(12 170 96)" fill="currentColor" opacity="0.6" />
        <ellipse cx="181" cy="103" rx="1.8" ry="5.5" transform="rotate(12 181 103)" fill="currentColor" opacity="0.5" />
      </>
    )}
  </svg>
);
