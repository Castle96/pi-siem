import { useEffect, useState, useCallback, useRef } from "react";

const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "ws://localhost:8170/ws";

export function useSiemData() {
  const [nodes, setNodes] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [voiceEvents, setVoiceEvents] = useState([]);
  const [voiceState, setVoiceState] = useState("idle");
  const [storage, setStorage] = useState([]);
  const [sync, setSync] = useState([]);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type !== "update") return;
          if (Array.isArray(payload.nodes)) setNodes(payload.nodes);
          if (Array.isArray(payload.metrics)) setMetrics(payload.metrics);
          if (Array.isArray(payload.alerts)) setAlerts(payload.alerts);
          if (Array.isArray(payload.agents)) setAgents(payload.agents);
          if (Array.isArray(payload.voiceEvents)) {
            setVoiceEvents(payload.voiceEvents);
            if (payload.voiceEvents[0]) {
              setVoiceState(payload.voiceEvents[0].state || "idle");
            }
          }
          if (Array.isArray(payload.storage)) setStorage(payload.storage);
          if (Array.isArray(payload.sync)) setSync(payload.sync);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 2000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return { nodes, metrics, alerts, agents, voiceEvents, voiceState, storage, sync };
}
