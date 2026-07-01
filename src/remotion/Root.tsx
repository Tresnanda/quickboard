import { Composition } from "remotion";
import { QuickboardExplainer30, QuickboardHeroLoop, QuickboardSocial15 } from "./QuickboardVideo";

export const RemotionRoot = () => (
  <>
    <Composition
      id="QuickboardSocial15"
      component={QuickboardSocial15}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1080}
    />
    <Composition
      id="QuickboardExplainer30"
      component={QuickboardExplainer30}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="QuickboardHeroLoop"
      component={QuickboardHeroLoop}
      durationInFrames={240}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
