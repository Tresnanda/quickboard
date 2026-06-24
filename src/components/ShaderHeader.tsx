import { Component, type ReactNode } from "react";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";

/** If ShaderGradient/three throws at runtime (version mismatch, no WebGL, …) render
 * nothing — the baked cover gradient sits behind it, so the header still looks right. */
class GLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A live, animated ShaderGradient (three.js) for a modal header. One instance at a
 * time — modal headers only; folder cards use the baked cover. Sits behind the header
 * content (pointer-events off). Default export so it can be React.lazy'd (defers
 * three.js out of app startup until a modal first opens). */
export default function ShaderHeader({ color1, color2, color3 }: { color1: string; color2: string; color3: string }) {
  return (
    <GLBoundary>
      <ShaderGradientCanvas lazyLoad={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <ShaderGradient
          type="plane"
          animate="on"
          uSpeed={0.2}
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
          color1={color1}
          color2={color2}
          color3={color3}
        />
      </ShaderGradientCanvas>
    </GLBoundary>
  );
}
