// Maple Route in the Steam Deck Quick Access Menu (••• button): what to do next, and Next step /
// Undo for the quest plan, without picking up your phone. It only talks to the Maple Route app on
// this Deck (127.0.0.1); it never touches MapleStory.
import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, staticClasses } from "@decky/ui";
import { definePlugin, fetchNoCors } from "@decky/api";
import { useEffect, useState } from "react";
import { FaMapMarkedAlt } from "react-icons/fa";

const API = "http://127.0.0.1:5179";

type Status = {
  state?: string; error?: string | null; map?: string; next?: string; here?: string; step?: string;
  mapId?: string; mapUncertain?: boolean; mapChoices?: { id: string; label: string }[];
  canUndo?: boolean; overlay?: boolean; overlayPosition?: string;
};

async function getStatus(): Promise<Status | null> {
  try { const r = await fetchNoCors(`${API}/status`); return r.ok ? await r.json() : null; } catch { return null; }
}
async function send(path: string, body: object = {}) {
  try {
    await fetchNoCors(`${API}${path}`, { method: "POST", headers: { "x-maple-decky": "1", "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch { /* the app is not running */ }
}

const POSITIONS = [
  { data: "off", label: "Off" },
  { data: "bottom-left", label: "Bottom left" },
  { data: "bottom-right", label: "Bottom right" },
  { data: "upper-right", label: "Upper right" }
];

function Line({ label, text }: { label: string; text?: string | null }) {
  if (!text) return null;
  return (
    <PanelSectionRow>
      <div style={{ fontSize: "12px", lineHeight: 1.35, padding: "2px 0" }}>
        <div style={{ color: "#9fb3a8", fontSize: "11px" }}>{label}</div>
        <div>{text}</div>
      </div>
    </PanelSectionRow>
  );
}

function Content() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = async () => setStatus(await getStatus());
  useEffect(() => { refresh(); const id = setInterval(refresh, 2000); return () => clearInterval(id); }, []);
  const act = async (path: string, body?: object) => { setBusy(true); await send(path, body); await new Promise(r => setTimeout(r, 400)); await refresh(); setBusy(false); };

  if (!status) {
    return (
      <PanelSection title="Maple Route">
        <PanelSectionRow><div style={{ fontSize: "12px" }}>Maple Route isn't running. It starts by itself in Gaming Mode: open MapleStory. (Set it up once from the Maple Route AppImage in Desktop Mode.)</div></PanelSectionRow>
      </PanelSection>
    );
  }
  const reading = status.state === "reading";
  return (
    <>
      <PanelSection title="Maple Route">
        <Line label={reading ? `Reading · ${status.map || "map not read yet"}` : "Not reading"} text={status.error || status.next} />
        <Line label="On this map" text={status.here} />
        <Line label="Current step" text={status.step} />
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy || !status.step} onClick={() => act("/next-step")}>Next step ✓</ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy || !status.canUndo} onClick={() => act("/undo")}>Undo</ButtonItem>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title="Reading and pop-up">
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={() => act(reading ? "/stop" : "/start")}>{reading ? "Stop reading" : "Start reading"}</ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem
            label="Pop-up"
            rgOptions={POSITIONS}
            selectedOption={status.overlay ? status.overlayPosition ?? "bottom-left" : "off"}
            onChange={option => act("/overlay", option.data === "off" ? { enabled: false } : { enabled: true, position: option.data })}
          />
        </PanelSectionRow>
      </PanelSection>
      {reading && !!status.mapChoices?.length && <PanelSection title="GPS map recovery">
        {status.mapUncertain && <PanelSectionRow><div style={{ fontSize: "12px" }}>Checking your new map. Directions are paused.</div></PanelSectionRow>}
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy || !status.mapId} onClick={() => act("/map-recover", { mapId: status.mapId })}>Confirm {status.map || "current map"}</ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <DropdownItem label="Or choose a nearby map" rgOptions={status.mapChoices.map(choice => ({ data: choice.id, label: choice.label }))}
            selectedOption={status.mapId} disabled={busy} onChange={option => act("/map-recover", { mapId: option.data })} />
        </PanelSectionRow>
      </PanelSection>}
    </>
  );
}

export default definePlugin(() => ({
  name: "Maple Route",
  titleView: <div className={staticClasses.Title}>Maple Route</div>,
  content: <Content />,
  icon: <FaMapMarkedAlt />,
  onDismount() {}
}));
