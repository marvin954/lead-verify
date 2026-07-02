/** tailwind.config.ts additions for Mammba Verify dashboard
 *  Merge this `theme.extend` block into your existing tailwind.config.ts
 */
import type { Config } from "tailwindcss";

const mammbaVerifyTheme: Config["theme"] = {
  extend: {
    colors: {
      surface: {
        base: "#0B0F14",   // page background
        card: "#141B22",   // card / table surfaces
        raised: "#b1bbc6", // hovered rows, popovers
        border: "#232E3A",
      },
      ink: {
        primary: "#E7EAEE",
        secondary: "#8B96A5",
        muted: "#5B6570",
      },
      status: {
        verified: "#34D399",
        verifiedDim: "#0F2A22",
        flagged: "#F5A623",
        flaggedDim: "#2E2410",
        rejected: "#F0555F",
        rejectedDim: "#2E1417",
        duplicate: "#8B96A5",
        duplicateDim: "#1B222B",
      },
      accent: {
        DEFAULT: "#5B8DEF",
        dim: "#141F33",
      },
    },
    fontFamily: {
      mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      sans: ["'Inter'", "ui-sans-serif", "sans-serif"],
    },
    borderRadius: {
      card: "10px",
    },
  },
};

export default mammbaVerifyTheme;
