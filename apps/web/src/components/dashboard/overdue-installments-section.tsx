"use client";

import { useActionState } from "react";
import { AlertTriangle, RefreshCw, CheckCircle } from "lucide-react";
import { InstallmentStatus } from "@gestionale/db";

import {
  type ActionResult,
  retryInstallmentChargeActionState,
  markInstallmentPaidActionState
} from "@/app/actions/dashboard-actions";
import { formatEuroCents } from "@/lib/subscription";

import type { OverdueInstallmentRow } from "./admin-dashboard";
import { DashSeeAll } from "./dash-see-all";

type Props = {
  installments: OverdueInstallmentRow[];
  limit?: number;
  href?: string;
};

function InstallmentActionRow({ installment }: { installment: OverdueInstallmentRow }) {
  const [retryResult, retryAction, retryPending] = useActionState(
    retryInstallmentChargeActionState,
    null
  );
  const [markPaidResult, markPaidAction, markPaidPending] = useActionState(
    markInstallmentPaidActionState,
    null
  );

  const result = retryResult ?? markPaidResult;
  const isFailed = installment.status === InstallmentStatus.FAILED;

  return (
    <li className="dash-event-item">
      <div className="dash-event-info" style={{ flex: 1 }}>
        <div className="dash-event-name">
          {installment.plan.user.firstName} {installment.plan.user.lastName}
        </div>
        <p className="dash-event-meta">
          Rata {installment.sequenceNumber}/{installment.plan.installmentsCount} ·{" "}
          {formatEuroCents(installment.amountCents)} ·{" "}
          Scadenza {new Date(installment.dueAt).toLocaleDateString("it-IT")}
          {isFailed ? " · FALLITA" : " · SCADUTA"}
        </p>
        {installment.failureReason && (
          <p className="dash-event-note" style={{ fontSize: 11 }}>
            {installment.failureReason}
          </p>
        )}
        {result && (
          <p
            className="dash-event-note"
            style={{ fontSize: 11, color: result.ok ? "#22c55e" : "#ef4444" }}
          >
            {result.message}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        <form action={retryAction}>
          <input type="hidden" name="installmentId" value={installment.id} />
          <button
            type="submit"
            className="button button-small"
            disabled={retryPending}
            title="Ritenta addebito"
          >
            <RefreshCw size={12} />
            {retryPending ? "…" : "Ritenta"}
          </button>
        </form>
        <form action={markPaidAction}>
          <input type="hidden" name="installmentId" value={installment.id} />
          <button
            type="submit"
            className="button button-small"
            disabled={markPaidPending}
            title="Segna come pagata"
            style={{ background: "#22c55e", borderColor: "#22c55e" }}
          >
            <CheckCircle size={12} />
            {markPaidPending ? "…" : "Pagata"}
          </button>
        </form>
      </div>
    </li>
  );
}

export function OverdueInstallmentsSection({ installments, limit, href }: Props) {
  const visible = typeof limit === "number" ? installments.slice(0, limit) : installments;

  return (
    <div className="dash-card-full">
      <div className="dash-card-header">
        <AlertTriangle size={14} className="dash-card-header-icon" style={{ color: "#ef4444" }} />
        <div>
          <p className="dash-card-kicker" style={{ color: "#ef4444" }}>Richiede attenzione</p>
          <h3 className="dash-card-title">
            Rate in sofferenza
            <span className="approval-badge" style={{ background: "#ef4444" }}>
              {installments.length}
            </span>
          </h3>
        </div>
      </div>

      <ul className="dash-event-list">
        {visible.map((inst) => (
          <InstallmentActionRow key={inst.id} installment={inst} />
        ))}
      </ul>

      {typeof limit === "number" && href && (
        <DashSeeAll total={installments.length} shown={limit} href={href} />
      )}
    </div>
  );
}
