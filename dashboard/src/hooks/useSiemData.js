import { useEffect, useState, useCallback, useRef } from "react";

const WS_URL =
  typeof window !== "undefined"
    ? (import.meta.env.VITE_WS_URL || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`)
    : "ws://localhost:8170/ws";

export function useSiemData() {
  const [nodes, setNodes] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [agents, setAgents] = useState([]);
  const [voiceEvents, setVoiceEvents] = useState([]);
  const [voiceState, setVoiceState] = useState("idle");
  const [voiceAction, setVoiceAction] = useState(null);
  const [voiceStale, setVoiceStale] = useState(false);
  const [storage, setStorage] = useState([]);
  const [sync, setSync] = useState([]);
  const [wsStatus, setWsStatus] = useState("CONNECTING");
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("LIVE");

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
          if (payload.voiceAction) setVoiceAction(payload.voiceAction);
          if (payload.voiceStale !== undefined) setVoiceStale(payload.voiceStale);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsStatus("RECONNECTING");
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
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const resp = await fetch(`${window.location.origin}/api/tasks/history`);
        const data = await resp.json();
        if (data.tasks) setTasks(data.tasks);
      } catch (e) {
        console.error("Task fetch error:", e);
      }
    };
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  return { nodes, metrics, alerts, agents, tasks, voiceEvents, voiceState, voiceAction, voiceStale, storage, sync, wsStatus };
}
