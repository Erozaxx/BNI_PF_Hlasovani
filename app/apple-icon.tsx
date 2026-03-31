import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 90,
          background: "#C8102E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#FFFFFF",
            fontFamily: "Arial, sans-serif",
            fontWeight: 700,
            fontSize: 72,
            letterSpacing: -1,
          }}
        >
          BNI
        </span>
      </div>
    ),
    { ...size }
  );
}
