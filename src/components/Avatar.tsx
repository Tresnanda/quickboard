import { useEffect, useState } from "react";
import { useShaderBake } from "./ShaderBaker";
import { coverColors, coverGradient } from "../lib/cover";
import { profileInitial } from "../lib/profile";
import { TINTS, type TintName } from "../lib/tints";
import { cn } from "../lib/utils";

/** The user avatar — a baked ShaderGradient (per tint) with the initial, or a photo.
 * Same gradient engine as the cards, so it never looks like a flat gray blob. */
export function Avatar({ name, tint, photo, className }: { name: string; tint: TintName; photo?: string; className?: string }) {
  const bake = useShaderBake();
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    if (photo) {
      setImg(null);
      return;
    }
    let alive = true;
    void bake(`avatar|${tint}`, coverColors("avatar", tint)).then((u) => alive && setImg(u));
    return () => {
      alive = false;
    };
  }, [tint, photo, bake]);

  const bg = photo ? "var(--t-tile)" : img ? `url("${img}") center / cover no-repeat` : coverGradient("avatar", tint);

  return (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden font-extrabold", className)} style={{ background: bg, color: TINTS[tint].tileInk }}>
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : profileInitial(name)}
    </div>
  );
}
