"use client";

import { useMemo, useState } from "react";
import type { WeatherFillerData } from "@/lib/types";
import { picsumFallbackUrl } from "@/lib/article-image";

interface WeatherFillerCardProps {
  data: WeatherFillerData;
  reason: "gap" | "interval";
}

export default function WeatherFillerCard({ data, reason }: WeatherFillerCardProps) {
  const isWeather = data.mode === "weather";
  const reasonLabel = reason === "gap" ? "gap-fill" : "interval";
  const fallbackSrc = useMemo(() => {
    const seed = data.locationLabel?.trim() || "weather";
    return picsumFallbackUrl(`${seed}|forecast-desk`, 1200, 700);
  }, [data.locationLabel]);
  const [imgSrc, setImgSrc] = useState<string | null>(data.imageUrl ?? null);

  return (
    <section
      style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#f7f3ea",
        padding: "0.95rem 1rem",
      }}
      aria-label="Weather filler module"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid #d7d0c1",
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: "0.01em",
            fontSize: "1.03rem",
            color: "#1f1f1f",
          }}
        >
          {data.title}
        </h3>
        <span
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.67rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#746a55",
          }}
        >
          {reasonLabel}
        </span>
      </header>

      {isWeather ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: "0.9rem",
            alignItems: "center",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.8rem",
                lineHeight: 1.05,
                color: "#1e1e1e",
              }}
            >
              {typeof data.temperatureC === "number" ? `${data.temperatureC}\u00b0C` : "--"}
            </p>
            <p
              style={{
                margin: "0.3rem 0 0",
                fontFamily: "'IM Fell English', Georgia, serif",
                fontStyle: "italic",
                color: "#463f34",
                fontSize: "0.95rem",
              }}
            >
              {(data.condition ?? "Calm skies").replace(/^\w/, (char) => char.toUpperCase())}
            </p>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                fontSize: "0.73rem",
                color: "#6d6353",
              }}
            >
              {data.locationLabel ?? "Global desk"}
            </p>
          </div>

          <div
            style={{
              borderLeft: "1px solid #ddd2bc",
              paddingLeft: "0.8rem",
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.8rem",
              color: "#4a443a",
              lineHeight: 1.6,
            }}
          >
            <div>Humidity: {typeof data.humidity === "number" ? `${data.humidity}%` : "--"}</div>
            <div>Wind: {typeof data.windKph === "number" ? `${data.windKph} km/h` : "--"}</div>
            <div style={{ marginTop: "0.25rem", color: "#7d735f" }}>{data.subtitle}</div>
          </div>
        </div>
      ) : (
        <div>
          {(imgSrc || fallbackSrc) && (
            <img
              src={imgSrc ?? fallbackSrc}
              alt={data.locationLabel ? `Generated weather illustration for ${data.locationLabel}` : "Generated weather illustration"}
              loading="lazy"
              onError={() => setImgSrc(fallbackSrc)}
              style={{
                width: "100%",
                maxHeight: "220px",
                objectFit: "cover",
                border: "1px solid #d7d0c1",
                marginBottom: "0.55rem",
              }}
            />
          )}
          <p
            style={{
              margin: 0,
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              color: "#4f463b",
              fontSize: "0.92rem",
            }}
          >
            {data.subtitle}
          </p>
        </div>
      )}
    </section>
  );
}
