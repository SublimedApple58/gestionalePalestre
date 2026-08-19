"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import type { AccessEventType } from "@gestionale/db";

const { Text } = Typography;

type AccessRow = {
  id: string;
  eventType: AccessEventType;
  note: string | null;
  occurredAt: string;
};

const EVENT_LABEL: Record<AccessEventType, string> = {
  KEYPAD_UNLOCK: "Ingresso tastierino",
  DOOR_OPEN: "Apertura porta (remoto)",
  ENTRY_SIMULATION: "Simulazione (storico)"
};

const EVENT_COLOR: Record<AccessEventType, string> = {
  KEYPAD_UNLOCK: "success",
  DOOR_OPEN: "processing",
  ENTRY_SIMULATION: "default"
};

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function UserAccessLogList({ userId }: { userId: string }) {
  const [items, setItems] = useState<AccessRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (curCursor: string | null) => {
      const params = new URLSearchParams();
      if (curCursor) params.set("cursor", curCursor);
      params.set("limit", "30");
      const res = await fetch(`/api/utenti/${userId}/access-events?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore server (${res.status})`);
      return (await res.json()) as { items: AccessRow[]; nextCursor: string | null };
    },
    [userId]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPage(null);
      setItems(data.items);
      setCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(cursor);
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
    } catch (e) {
      console.warn("[access-events] loadMore failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={16} className="spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <Text style={{ fontSize: 12, color: "#ef4444" }}>{error}</Text>
        <div style={{ marginTop: 8 }}>
          <Button size="small" onClick={refresh}>
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      <section className="user-drawer-section">
        <div className="user-drawer-section-head">
          <h4 className="user-drawer-section-title" style={{ marginBottom: 0 }}>
            Storico accessi
          </h4>
          <Button type="text" size="small" icon={<RefreshCw size={12} />} onClick={refresh} aria-label="Aggiorna" />
        </div>

        {items.length === 0 ? (
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            Nessun ingresso registrato per questo iscritto.
          </Text>
        ) : (
          <ul className="user-drawer-audit-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((it, idx) => (
              <li
                key={it.id}
                style={{
                  padding: "12px 0",
                  borderBottom: idx < items.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <Tag color={EVENT_COLOR[it.eventType] ?? "default"} style={{ marginInlineEnd: 0 }}>
                    {EVENT_LABEL[it.eventType] ?? it.eventType}
                  </Tag>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.5)",
                      textAlign: "right",
                      flexShrink: 0,
                      whiteSpace: "nowrap"
                    }}
                  >
                    {dateFormatter.format(new Date(it.occurredAt))}
                  </Text>
                </div>
                {it.note ? (
                  <Text style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", display: "block", marginTop: 4 }}>
                    {it.note}
                  </Text>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {cursor ? (
          <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
            <Button size="small" onClick={loadMore} loading={loadingMore}>
              Carica altri
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
