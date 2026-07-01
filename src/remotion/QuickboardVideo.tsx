import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const ink = "#0b0b0c";
const paper = "#f6f4ef";
const muted = "#6f6a76";
const green = "#3f9c6d";
const amber = "#c5a34c";
const lilac = "#8674c4";
const rose = "#b86a78";
const font =
  '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const items = [
  { tag: "NOTE", title: "Meeting note", tint: "#f7efda", accent: amber },
  { tag: "LINK", title: "Design brief", tint: "#e9f3ed", accent: green },
  { tag: "FILE", title: "Invoice.pdf", tint: "#edf0f8", accent: lilac },
  { tag: "IMG", title: "Moodboard.png", tint: "#f6eaee", accent: rose },
  { tag: "CODE", title: "Launch snippet", tint: "#e8f0f1", accent: "#4f8f9f" },
];

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
  easing: ease,
} as const;

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], clamp);

const rise = (frame: number, start = 0, distance = 42): CSSProperties => ({
  opacity: fade(frame, start, start + 18),
  translate: `0px ${interpolate(frame, [start, start + 24], [distance, 0], clamp)}px`,
  scale: interpolate(frame, [start, start + 24], [0.96, 1], clamp),
});

const out = (frame: number, start: number): CSSProperties => ({
  opacity: interpolate(frame, [start, start + 16], [1, 0], clamp),
  translate: `0px ${interpolate(frame, [start, start + 16], [0, -22], clamp)}px`,
});

const Stage = ({ children, dark = false }: { children: ReactNode; dark?: boolean }) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        width,
        height,
        overflow: "hidden",
        background: dark ? "#17151d" : paper,
        color: dark ? "#fffaf0" : ink,
        fontFamily: font,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 18% 18%, rgba(134,116,196,.2), transparent 32%), radial-gradient(circle at 82% 26%, rgba(63,156,109,.18), transparent 28%), radial-gradient(circle at 56% 86%, rgba(197,163,76,.18), transparent 30%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(11,11,12,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(11,11,12,.045) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          opacity: dark ? 0.22 : 0.42,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

const Lockup = ({ compact = false }: { compact?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: compact ? 18 : 24 }}>
    <div
      style={{
        width: compact ? 84 : 118,
        height: compact ? 84 : 118,
        borderRadius: compact ? 24 : 32,
        display: "grid",
        placeItems: "center",
        background: "#fff",
        boxShadow: "0 24px 70px rgba(11,11,12,.16)",
      }}
    >
      <Img src={staticFile("quickboard-logo.svg")} style={{ width: "68%", height: "68%" }} />
    </div>
    <div>
      <div
        style={{
          fontSize: compact ? 54 : 88,
          lineHeight: 0.95,
          fontWeight: 800,
          letterSpacing: 0,
        }}
      >
        quickboard
      </div>
      <div
        style={{
          marginTop: compact ? 8 : 14,
          color: muted,
          fontSize: compact ? 20 : 32,
          fontWeight: 600,
        }}
      >
        Save anything. Summon it in seconds.
      </div>
    </div>
  </div>
);

const ItemCard = ({
  item,
  index,
  frame,
  delay = 0,
  small = false,
}: {
  item: (typeof items)[number];
  index: number;
  frame: number;
  delay?: number;
  small?: boolean;
}) => (
  <div
    style={{
      ...rise(frame, delay + index * 5, small ? 22 : 36),
      width: small ? 260 : 350,
      height: small ? 92 : 124,
      borderRadius: small ? 22 : 30,
      padding: small ? "18px 20px" : "24px 28px",
      background: item.tint,
      boxShadow: "0 20px 44px rgba(30,28,34,.12)",
      border: "1px solid rgba(255,255,255,.68)",
      display: "grid",
      gridTemplateColumns: small ? "54px 1fr" : "68px 1fr",
      alignItems: "center",
      gap: small ? 14 : 18,
    }}
  >
    <div
      style={{
        width: small ? 54 : 68,
        height: small ? 54 : 68,
        borderRadius: small ? 16 : 20,
        background: item.accent,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontSize: small ? 15 : 18,
        fontWeight: 800,
      }}
    >
      {item.tag}
    </div>
    <div>
      <div style={{ fontSize: small ? 24 : 32, fontWeight: 800, lineHeight: 1 }}>
        {item.title}
      </div>
      <div style={{ marginTop: 8, color: muted, fontSize: small ? 15 : 19, fontWeight: 700 }}>
        ready at cursor
      </div>
    </div>
  </div>
);

const Headline = ({
  title,
  eyebrow,
  align = "center",
}: {
  title: string;
  eyebrow: string;
  align?: CSSProperties["textAlign"];
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const large = width > 1200;

  return (
    <div style={{ textAlign: align, ...rise(frame, 0, 28) }}>
      <div
        style={{
          color: muted,
          fontSize: large ? 30 : 26,
          fontWeight: 800,
          letterSpacing: 0,
          marginBottom: large ? 22 : 18,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontSize: large ? 108 : 88,
          lineHeight: 0.92,
          fontWeight: 800,
          letterSpacing: 0,
          maxWidth: large ? 900 : 820,
        }}
      >
        {title}
      </div>
    </div>
  );
};

const BrandScene = () => {
  const frame = useCurrentFrame();

  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...rise(frame, 0, 34) }}>
          <Lockup />
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const SaveScene = ({ wide = false }: { wide?: boolean }) => {
  const frame = useCurrentFrame();

  return (
    <Stage>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: wide ? "110px 130px" : "110px 90px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: wide ? "0.88fr 1.12fr" : "1fr",
            gap: wide ? 80 : 58,
            alignItems: "center",
            width: "100%",
            maxWidth: wide ? 1540 : 860,
          }}
        >
          <Headline title="Save anything you reach for often." eyebrow="Quick capture" align={wide ? "left" : "center"} />
          <div style={{ display: "grid", gap: 18, justifyItems: wide ? "start" : "center" }}>
            {items.map((item, index) => (
              <ItemCard key={item.tag} item={item} index={index} frame={frame} delay={wide ? 18 : 26} small={wide} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const SummonPanel = ({ frame, wide = false }: { frame: number; wide?: boolean }) => (
  <div
    style={{
      ...rise(frame, 8, 34),
      width: wide ? 760 : 720,
      borderRadius: 34,
      background: "#191820",
      color: "#f7f3e8",
      padding: wide ? 30 : 28,
      boxShadow: "0 38px 100px rgba(11,11,12,.36)",
      border: "1px solid rgba(255,255,255,.11)",
    }}
  >
    <div
      style={{
        height: 64,
        borderRadius: 20,
        background: "rgba(255,255,255,.08)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        fontSize: 28,
        fontWeight: 800,
      }}
    >
      Opt + Space
      <span style={{ color: "#b9b3c4", marginLeft: 18, fontWeight: 600 }}>design brief</span>
    </div>
    {items.slice(0, 3).map((item, index) => (
      <div
        key={item.tag}
        style={{
          marginTop: 16,
          height: 74,
          borderRadius: 22,
          background: index === 0 ? "#fffaf0" : "rgba(255,255,255,.07)",
          color: index === 0 ? ink : "#fffaf0",
          display: "grid",
          gridTemplateColumns: "62px 1fr auto",
          alignItems: "center",
          gap: 16,
          padding: "0 18px",
          opacity: fade(frame, 22 + index * 5, 38 + index * 5),
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: item.accent,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {item.tag}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{item.title}</div>
        <div style={{ color: index === 0 ? green : "#b9b3c4", fontSize: 18, fontWeight: 800 }}>
          Return
        </div>
      </div>
    ))}
  </div>
);

const SummonScene = ({ wide = false }: { wide?: boolean }) => {
  const frame = useCurrentFrame();

  return (
    <Stage dark>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: wide ? "100px 130px" : "105px 90px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: wide ? "0.85fr 1.15fr" : "1fr",
            gap: wide ? 80 : 54,
            alignItems: "center",
            width: "100%",
            maxWidth: wide ? 1560 : 820,
          }}
        >
          <Headline title="Summon it over any app." eyebrow="One shortcut" align={wide ? "left" : "center"} />
          <SummonPanel frame={frame} wide={wide} />
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const UseScene = () => {
  const frame = useCurrentFrame();
  const send = fade(frame, 52, 92);

  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "110px 140px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 90,
            alignItems: "center",
            width: "100%",
            maxWidth: 1550,
          }}
        >
          <div>
            <Headline title="Paste or drag without breaking focus." eyebrow="Use it instantly" align="left" />
          </div>
          <div style={{ position: "relative", height: 650 }}>
            <SummonPanel frame={frame} wide />
            <div
              style={{
                position: "absolute",
                left: interpolate(send, [0, 1], [120, 520]),
                top: interpolate(send, [0, 1], [390, 455]),
                opacity: fade(frame, 38, 50),
                scale: interpolate(send, [0, 1], [1, 0.72], clamp),
              }}
            >
              <ItemCard item={items[1]} index={0} frame={frame} delay={34} small />
            </div>
            <div
              style={{
                position: "absolute",
                right: 0,
                bottom: 0,
                width: 360,
                height: 210,
                borderRadius: 30,
                background: "#fff",
                boxShadow: "0 28px 72px rgba(11,11,12,.16)",
                padding: 28,
                opacity: fade(frame, 42, 62),
              }}
            >
              <div style={{ color: muted, fontSize: 22, fontWeight: 800 }}>Destination app</div>
              <div
                style={{
                  marginTop: 36,
                  height: 26,
                  borderRadius: 999,
                  background: "#e9e8ee",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${interpolate(send, [0, 1], [0, 72], clamp)}%`,
                    height: "100%",
                    background: green,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const TrayScene = ({ wide = false }: { wide?: boolean }) => {
  const frame = useCurrentFrame();
  const lanes = ["References", "Layouts", "Elements"];

  return (
    <Stage>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: wide ? "105px 130px" : "105px 86px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: wide ? "0.78fr 1.22fr" : "1fr",
            gap: wide ? 76 : 48,
            alignItems: "center",
            width: "100%",
            maxWidth: wide ? 1540 : 860,
          }}
        >
          <Headline title="Stage messy work. Commit it cleanly." eyebrow="Tray lanes" align={wide ? "left" : "center"} />
          <div
            style={{
              ...rise(frame, 12, 28),
              borderRadius: 42,
              background: "#201f28",
              color: "#fffaf0",
              padding: 30,
              boxShadow: "0 36px 100px rgba(11,11,12,.26)",
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 18,
            }}
          >
            {lanes.map((lane, laneIndex) => (
              <div
                key={lane}
                style={{
                  minHeight: wide ? 410 : 270,
                  borderRadius: 28,
                  background: "rgba(255,255,255,.08)",
                  padding: 20,
                }}
              >
                <div style={{ fontSize: wide ? 24 : 18, fontWeight: 800 }}>{lane}</div>
                {items.slice(laneIndex, laneIndex + 2).map((item, cardIndex) => (
                  <div
                    key={item.tag}
                    style={{
                      ...rise(frame, 28 + laneIndex * 7 + cardIndex * 6, 20),
                      height: wide ? 74 : 56,
                      borderRadius: 18,
                      background: item.tint,
                      color: ink,
                      marginTop: 16,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 16px",
                      gap: 12,
                      fontSize: wide ? 18 : 14,
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ color: item.accent }}>{item.tag}</span>
                    {item.title}
                  </div>
                ))}
              </div>
            ))}
            <div
              style={{
                position: "absolute",
                right: wide ? 158 : 116,
                bottom: wide ? 150 : 146,
                borderRadius: 999,
                background: green,
                color: "#fff",
                padding: wide ? "20px 28px" : "16px 22px",
                fontSize: wide ? 24 : 18,
                fontWeight: 800,
                opacity: fade(frame, 64, 84),
                scale: interpolate(frame, [64, 84], [0.92, 1], clamp),
              }}
            >
              Commit to board
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const TrustScene = ({ wide = false }: { wide?: boolean }) => {
  const frame = useCurrentFrame();

  return (
    <Stage dark>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: wide ? 120 : 90 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: wide ? "1fr 1fr" : "1fr",
            gap: wide ? 90 : 50,
            alignItems: "center",
            width: "100%",
            maxWidth: wide ? 1440 : 820,
          }}
        >
          <Headline title="Private stays private." eyebrow="Local first" align={wide ? "left" : "center"} />
          <div
            style={{
              ...rise(frame, 12, 30),
              justifySelf: "center",
              width: wide ? 440 : 390,
              height: wide ? 440 : 390,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background:
                "radial-gradient(circle, rgba(63,156,109,.28), rgba(63,156,109,.08) 55%, transparent 56%)",
              border: "1px solid rgba(255,255,255,.14)",
            }}
          >
            <div
              style={{
                width: wide ? 250 : 220,
                height: wide ? 250 : 220,
                borderRadius: 54,
                background: "#fffaf0",
                color: ink,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 34px 90px rgba(0,0,0,.32)",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: wide ? 88 : 76, fontWeight: 800, lineHeight: 1 }}>ID</div>
                <div style={{ marginTop: 18, fontSize: wide ? 26 : 22, fontWeight: 800 }}>Touch ID</div>
                <div style={{ marginTop: 8, color: green, fontSize: wide ? 20 : 18, fontWeight: 800 }}>
                  Local on this Mac
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

const EndScene = ({ dark = false }: { dark?: boolean }) => {
  const frame = useCurrentFrame();

  return (
    <Stage dark={dark}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...rise(frame, 0, 28), ...out(frame, 9999) }}>
          <Lockup />
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

export const QuickboardSocial15 = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={60}>
      <BrandScene />
    </Sequence>
    <Sequence from={60} durationInFrames={90}>
      <SaveScene />
    </Sequence>
    <Sequence from={150} durationInFrames={90}>
      <SummonScene />
    </Sequence>
    <Sequence from={240} durationInFrames={90}>
      <TrayScene />
    </Sequence>
    <Sequence from={330} durationInFrames={60}>
      <TrustScene />
    </Sequence>
    <Sequence from={390} durationInFrames={60}>
      <EndScene />
    </Sequence>
  </AbsoluteFill>
);

export const QuickboardExplainer30 = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={90}>
      <BrandScene />
    </Sequence>
    <Sequence from={90} durationInFrames={150}>
      <SaveScene wide />
    </Sequence>
    <Sequence from={240} durationInFrames={150}>
      <SummonScene wide />
    </Sequence>
    <Sequence from={390} durationInFrames={150}>
      <UseScene />
    </Sequence>
    <Sequence from={540} durationInFrames={150}>
      <TrayScene wide />
    </Sequence>
    <Sequence from={690} durationInFrames={120}>
      <TrustScene wide />
    </Sequence>
    <Sequence from={810} durationInFrames={90}>
      <EndScene />
    </Sequence>
  </AbsoluteFill>
);

export const QuickboardHeroLoop = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const cycle = (frame / durationInFrames) * Math.PI * 2;
  const pulse = (Math.sin(cycle) + 1) / 2;
  const panel = fade(frame, 70, 96) * interpolate(frame, [142, 166], [1, 0], clamp);
  const cardsDim = 1 - panel * 0.82;

  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 110 }}>
        <div style={{ position: "relative", width: 1440, height: 760 }}>
          <div
            style={{
              position: "absolute",
              right: 90,
              top: 178,
              width: 760,
              height: 500,
              borderRadius: 44,
              background: "#fff",
              boxShadow: "0 36px 105px rgba(11,11,12,.18)",
              border: "1px solid rgba(11,11,12,.08)",
              padding: 34,
              opacity: 1 - panel * 0.28,
              scale: interpolate(pulse, [0, 1], [0.98, 1.02], clamp),
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
              <Img src={staticFile("quickboard-logo.svg")} style={{ width: 42, height: 42 }} />
              <div style={{ fontSize: 25, fontWeight: 800 }}>Your board</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {items.slice(0, 4).map((item, index) => (
                <div
                  key={item.tag}
                  style={{
                    ...rise(frame, 12 + index * 5, 18),
                    height: 108,
                    borderRadius: 24,
                    background: item.tint,
                    display: "grid",
                    gridTemplateColumns: "54px 1fr",
                    alignItems: "center",
                    gap: 14,
                    padding: "0 18px",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 15,
                      background: item.accent,
                      color: "#fff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {item.tag}
                  </div>
                  <div>
                    <div style={{ fontSize: 21, fontWeight: 800 }}>{item.title}</div>
                    <div style={{ marginTop: 6, color: muted, fontSize: 13, fontWeight: 700 }}>
                      one shortcut away
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 40,
              ...rise(frame, 0, 16),
            }}
          >
            <Lockup compact />
          </div>
          {items.slice(0, 3).map((item, index) => {
            const angle = cycle + index * 1.26;
            const x = 82 + Math.cos(angle) * 44;
            const y = 342 + Math.sin(angle) * 34 + index * 116;

            return (
              <div
                key={item.tag}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  translate: `${interpolate(frame, [0, 48], [-34, 0], clamp)}px 0px`,
                  opacity: fade(frame, 0, 36) * cardsDim,
                }}
              >
                <ItemCard item={item} index={0} frame={frame} small />
              </div>
            );
          })}
          <div
            style={{
              position: "absolute",
              right: 138,
              top: 244,
              opacity: panel,
              scale: interpolate(panel, [0, 1], [0.76, 0.82], clamp),
            }}
          >
            <SummonPanel frame={frame} wide />
          </div>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};
