import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPinned, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/nova/primitives";

export interface RiskPoint {
  id: string;
  lat: number;
  lon: number;
  riskScore: number;
  riskAction: string;
  user: string;
  location: string | null;
  at: string;
}

/**
 * OpenStreetMap (Leaflet) view of risky sign-in events. Non-interactive on
 * mobile, draggable + zoomable on desktop. Only renders client-side to avoid
 * SSR mismatches with Leaflet's window-dependent setup.
 */
export function RiskMap({ points, className }: { points: RiskPoint[]; className?: string }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const scored = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  React.useEffect(() => {
    if (!mounted || !containerRef.current || scored.length === 0) return;
    if (mapRef.current) mapRef.current.remove();
    const map = L.map(containerRef.current, {
      attributionControl: false,
      zoomControl: true,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    for (const p of scored) {
      const color =
        p.riskAction === "block" || p.riskScore > 80
          ? "#ef4444"
          : p.riskScore > 60
            ? "#f59e0b"
            : "#22c55e";
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 9,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 0.85,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(p.user)}</strong><br/>${escapeHtml(p.location ?? "Unknown")}<br/>risk ${p.riskScore} · ${escapeHtml(p.riskAction)}<br/><span style="font-family:monospace;font-size:11px">${escapeHtml(new Date(p.at).toLocaleString())}</span>`,
      );
      marker.addTo(map);
      bounds.extend([p.lat, p.lon]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mounted, scored]);

  if (!mounted) {
    return <div className={cn("min-h-[24rem] animate-pulse rounded-3xl bg-muted", className)} />;
  }

  if (scored.length === 0) {
    return (
      <div className={cn("min-h-[24rem]", className)}>
        <EmptyState
          icon={<MapPinned />}
          title="No coordinates to map"
          description="Risky events appear here on a live map once they carry IP geolocation."
        />
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[oklch(0.207_0.014_251_/_0.07)]">
      <div ref={containerRef} className={cn("z-0 min-h-[24rem] w-full", className)} />
      <span className="pointer-events-none absolute left-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs font-semibold shadow-card backdrop-blur">
        <ShieldAlert className="size-3.5 text-warning" /> {scored.length} risky event
        {scored.length === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
