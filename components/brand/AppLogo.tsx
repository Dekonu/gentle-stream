import Image from "next/image";
import { APP_LOGO_SRC } from "@/lib/brand/logo";

export interface AppLogoProps {
  /** CSS pixel height; width follows intrinsic aspect ratio */
  heightPx?: number;
  /** Eager load for above-the-fold (masthead, login) */
  priority?: boolean;
}

export function AppLogo({ heightPx = 44, priority = true }: AppLogoProps) {
  return (
    <Image
      src={APP_LOGO_SRC}
      alt="Gentle Stream"
      width={heightPx}
      height={heightPx}
      priority={priority}
      style={{
        height: heightPx,
        width: "auto",
        maxWidth: "min(85vw, 280px)",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}
