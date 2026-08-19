"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { Button, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";

import type { AuditAction } from "@gestionale/db";

const { Text } = Typography;

type LogRow = {
  id: string;
  action: AuditAction;
  payload: unknown;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
  targetSnapshot: { firstName: string; lastName: string; email: string } | null;
};

const ACTION_LABEL: Record<AuditAction, string> = {
  USER_CREATED: "Utente creato",
  USER_DELETED: "Utente eliminato",
  ROLE_CHANGED: "Ruolo modificato",
  INSTRUCTOR_ASSIGNED: "Istruttore assegnato",
  INSTRUCTOR_UNASSIGNED: "Istruttore rimosso",
  ADDRESS_UPDATED: "Indirizzo aggiornato",
  SUBSCRIPTION_ASSIGNED: "Abbonamento assegnato",
  SUBSCRIPTION_DEACTIVATED: "Abbonamento disattivato",
  SUBSCRIPTION_REACTIVATED: "Abbonamento riattivato",
  SUBSCRIPTION_DATE_CHANGED: "Data abbonamento modificata",
  ENTRY_PACKAGE_ASSIGNED: "Pacchetto ingressi assegnato",
  ENTRY_PACKAGE_REMOVED: "Pacchetto ingressi rimosso",
  DOC_APPROVED: "Documento approvato",
  DOC_REJECTED: "Documento rifiutato",
  DOC_REUPLOAD_REQUESTED: "Reupload documento richiesto",
  WORKOUT_TEMPLATE_ASSIGNED: "Scheda assegnata",
  WORKOUT_TEMPLATE_UNASSIGNED: "Scheda rimossa",
  ASSOCIATION_MEMBERSHIP_CHANGED: "Iscrizione associazione aggiornata",
  DOC_DELETED: "Documento rimosso",
  DOC_ADMIN_UPLOADED: "Documento caricato (admin)"
};

const ACTION_COLOR: Partial<Record<AuditAction, string>> = {
  USER_CREATED: "success",
  USER_DELETED: "error",
  SUBSCRIPTION_DEACTIVATED: "warning",
  SUBSCRIPTION_REACTIVATED: "success",
  SUBSCRIPTION_ASSIGNED: "success",
  ENTRY_PACKAGE_ASSIGNED: "success",
  ENTRY_PACKAGE_REMOVED: "warning",
  DOC_APPROVED: "success",
  DOC_REJECTED: "error",
  DOC_REUPLOAD_REQUESTED: "warning"
};

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function describePayload(action: AuditAction, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  switch (action) {
    case "ROLE_CHANGED": {
      const before = (p.before as { role?: string } | null)?.role ?? "—";
      const after = (p.after as { role?: string } | null)?.role ?? "—";
      return `${before} → ${after}`;
    }
    case "ADDRESS_UPDATED": {
      const after = (p.after as { address?: string | null } | null)?.address;
      return after ? `Nuovo indirizzo: "${after}"` : "Indirizzo rimosso";
    }
    case "SUBSCRIPTION_ASSIGNED": {
      const tier = p.tier as string | undefined;
      return tier ? `Tier: ${tier}` : null;
    }
    case "SUBSCRIPTION_DATE_CHANGED": {
      const after = p.after as { startsAt?: string; endsAt?: string } | null;
      if (!after?.startsAt) return null;
      return `Nuovo inizio: ${new Date(after.startsAt).toLocaleDateString("it-IT")}`;
    }
    case "DOC_APPROVED":
    case "DOC_REJECTED":
    case "DOC_REUPLOAD_REQUESTED": {
      const type = p.type as string | undefined;
      const reason = p.reason as string | undefined;
      const parts = [type ? type.replace(/_/g, " ").toLowerCase() : null, reason ? `"${reason}"` : null];
      return parts.filter(Boolean).join(" — ") || null;
    }
    default:
      return null;
  }
}

export function UserAuditLogList({ userId }: { userId: string }) {
  const [items, setItems] = useState<LogRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (curCursor: string | null) => {
      const params = new URLSearchParams();
      if (curCursor) params.set("cursor", curCursor);
      params.set("limit", "30");
      const res = await fetch(`/api/utenti/${userId}/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error(`Errore server (${res.status})`);
      return (await res.json()) as { items: LogRow[]; nextCursor: string | null };
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
      console.warn("[audit-log] loadMore failed:", e);
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
          Cronologia azioni
        </h4>
        <Button
          type="text"
          size="small"
          icon={<RefreshCw size={12} />}
          onClick={refresh}
          aria-label="Aggiorna"
        />
      </div>

      {items.length === 0 ? (
        <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          Nessuna azione registrata su questo utente.
        </Text>
      ) : (
        <ul className="user-drawer-audit-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => {
            const desc = describePayload(it.action, it.payload);
            const actorName = it.actor
              ? `${it.actor.firstName} ${it.actor.lastName}`
              : "Sistema";
            return (
              <li
                key={it.id}
                style={{
                  padding: "10px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <Tag color={ACTION_COLOR[it.action] ?? "default"}>{ACTION_LABEL[it.action] ?? it.action}</Tag>
                  <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", flexShrink: 0 }}>
                    {dateFormatter.format(new Date(it.createdAt))}
                  </Text>
                </div>
                {desc ? (
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", display: "block", marginTop: 4 }}>
                    {desc}
                  </Text>
                ) : null}
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", display: "block", marginTop: 2 }}>
                  da {actorName}
                </Text>
              </li>
            );
          })}
        </ul>
      )}

      {cursor ? (
        <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
          <Button size="small" onClick={loadMore} loading={loadingMore}>
            Carica altri
          </Button>
        </div>
      ) : null}
      </section>
    </div>
  );
}
