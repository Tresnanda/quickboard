import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

type Colors = [string, string, string];

/**
 * The offscreen ShaderGradient canvas the baker captures from. Lives in its own
 * lazily-imported module so three.js / @shadergradient stay out of the main
 * window's startup bundle — they load only when the first bake actually runs.
 */
export default function ShaderBakerCanvas({ colors, uTime, width, height }: { colors: Colors; uTime: number; width: number; height: number }) {
  return (
    <ShaderGradientCanvas preserveDrawingBuffer lazyLoad={false} pointerEvents="none" style={{ width, height }}>
      <ShaderGradient
        type="plane"
        animate="off"
        uTime={uTime}
        uSpeed={0.4}
        uStrength={3.6}
        uDensity={1.3}
        uFrequency={5.5}
        uAmplitude={1}
        brightness={1.25}
        cAzimuthAngle={180}
        cPolarAngle={90}
        cDistance={3.6}
        cameraZoom={1}
        positionX={-1.4}
        positionY={0}
        positionZ={0}
        rotationX={0}
        rotationY={10}
        rotationZ={50}
        reflection={0.1}
        envPreset="city"
        lightType="3d"
        grain="off"
        shader="defaults"
        color1={colors[0]}
        color2={colors[1]}
        color3={colors[2]}
      />
    </ShaderGradientCanvas>
  );
}
