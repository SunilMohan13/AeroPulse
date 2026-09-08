import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

type Source = {
  source_id: string;
  display_name: string;
  status: string;
  data_type: string;
};

export function App() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const [health, setHealth] = useState("checking");
  const [sources] = useState<Source[]>(fallbackSources());

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then(() => setHealth("ok"))
      .catch(() => setHealth("unreachable"));
  }, []);

  useEffect(() => {
    if (!mapNode.current) {
      return;
    }
    const map = new maplibregl.Map({
      container: mapNode.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [77.2, 28.6],
      zoom: 6,
    });
    return () => map.remove();
  }, []);

  return (
    <div className="shell">
      <aside>
        <h1>AeroPulse India</h1>
        <p className="status">API health: {health}</p>
        <p className="status">NCR corridor · H3 res 8 · Phase 1–2</p>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(sources.length ? sources : fallbackSources()).map((s) => (
              <tr key={s.source_id}>
                <td>{s.display_name}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
      <div id="map" ref={mapNode} />
    </div>
  );
}

function fallbackSources(): Source[] {
  return [
    { source_id: "cpcb", display_name: "CPCB CAAQMS", status: "replay", data_type: "air_quality" },
    { source_id: "firms", display_name: "NASA FIRMS", status: "replay", data_type: "active_fire" },
    { source_id: "imd", display_name: "IMD Weather", status: "replay", data_type: "weather" },
  ];
}
