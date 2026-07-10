import { SubscriptionTier, UserRole } from "@gestionale/db";

import { roleLabel } from "@/lib/roles";
import { subscriptionStatus, tierLabel } from "@/lib/subscription";

import { UserAvatar } from "../ui/user-avatar";

type DashboardHeroProps = {
  firstName: string;
  lastName: string;
  role: UserRole;
  profilePhotoUrl?: string | null;
  subscription: {
    tier: SubscriptionTier;
    startsAt: Date;
    endsAt: Date;
  } | null;
};

export function DashboardHero({
  firstName,
  lastName,
  role,
  profilePhotoUrl,
  subscription
}: DashboardHeroProps) {
  const subStatus = subscriptionStatus(subscription);

  const greeting = getGreeting();

  return (
    <div className="dash-hero">
      <div className="dash-hero-top">
        <div className="dash-hero-avatar-wrap">
          <UserAvatar
            firstName={firstName}
            profilePhotoUrl={profilePhotoUrl}
            size="lg"
          />
        </div>

        <div className="dash-hero-info">
          <p className="dash-hero-greeting">{greeting}</p>
          <h1 className="dash-hero-name">{`${firstName} ${lastName}`}</h1>
          <div className="dash-hero-badges">
            <span className="td-role-badge" data-role={role}>
              {roleLabel(role)}
            </span>
            {subscription && (
              <span
                className={`status-badge ${
                  subStatus === "active" ? "ok" : subStatus === "pending" ? "warning" : "missing"
                }`}
              >
                {subStatus === "active"
                  ? "Attivo"
                  : subStatus === "pending"
                  ? "Programmato"
                  : subStatus === "deactivated"
                  ? "Disattivato"
                  : "Scaduto"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="dash-hero-stats">
        <div className="dash-hero-stat">
          <span className="dash-hero-stat-label">Ruolo</span>
          <span className="dash-hero-stat-value">{roleLabel(role)}</span>
        </div>

        {subscription && (
          <>
            <div className="dash-hero-stat">
              <span className="dash-hero-stat-label">Abbonamento</span>
              <span className="dash-hero-stat-value">{tierLabel(subscription.tier)}</span>
            </div>
            <div className="dash-hero-stat">
              <span className="dash-hero-stat-label">Scadenza</span>
              <span className="dash-hero-stat-value">
                {new Date(subscription.endsAt).toLocaleDateString("it-IT")}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Buonanotte";
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}
