import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadSpaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

export const { fontFamily: inter } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
export const { fontFamily: spaceGrotesk } = loadSpaceGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] });

export const MicroflowLogo = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <circle cx="24" cy="14" r="6" fill="#3B82F6" />
    <circle cx="14" cy="28" r="5" fill="#22D3EE" />
    <circle cx="34" cy="28" r="5" fill="#60A5FA" />
    <circle cx="24" cy="38" r="4" fill="#93C5FD" />
    <line x1="24" y1="20" x2="24" y2="28" stroke="#3B82F6" strokeWidth={2} />
    <line x1="18" y1="25" x2="29" y2="25" stroke="#3B82F6" strokeWidth={2} />
    <line x1="19" y1="28" x2="24" y2="34" stroke="#22D3EE" strokeWidth={2} />
    <line x1="29" y1="28" x2="24" y2="34" stroke="#60A5FA" strokeWidth={2} />
  </svg>
);
