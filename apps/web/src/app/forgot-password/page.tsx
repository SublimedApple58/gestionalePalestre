"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  requestPasswordResetAction,
  resetPasswordAction
} from "@/app/actions/auth-actions";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await requestPasswordResetAction(email);
      if (res.status === "success") {
        setStep("code");
        setInfo(
          "Se l'email è registrata, riceverai un codice a 6 cifre. Controlla anche lo spam."
        );
      } else {
        setError(res.message ?? "Si è verificato un errore.");
      }
    });
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await resetPasswordAction({ email, code, newPassword });
      if (res.status === "success") {
        router.push("/login?reset=ok");
      } else {
        setError(res.message ?? "Si è verificato un errore.");
      }
    });
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpeg" alt="House of Muscle" className="auth-brand-logo" />
        <p className="eyebrow">Gestionale Palestre</p>
        <h1>Password dimenticata</h1>
        <p className="subtitle">
          {step === "email"
            ? "Inserisci la tua email: ti invieremo un codice per reimpostare la password."
            : "Inserisci il codice ricevuto via email e scegli una nuova password."}
        </p>

        {error ? <p className="error-banner">{error}</p> : null}
        {info ? <p className="success-banner">{info}</p> : null}

        {step === "email" ? (
          <form onSubmit={handleRequest} className="grid-form">
            <label className="input-group">
              <span>Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="nome@dominio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "Invio in corso…" : "Invia codice"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="grid-form">
            <label className="input-group">
              <span>Codice a 6 cifre</span>
              <input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                pattern="\d{6}"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>

            <label className="input-group">
              <span>Nuova password</span>
              <input
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>

            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "Reimpostazione…" : "Reimposta password"}
            </button>

            <button
              type="button"
              className="button button-ghost"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setError(null);
                setInfo(null);
                setCode("");
                setNewPassword("");
              }}
            >
              Usa un'altra email
            </button>
          </form>
        )}

        <p className="auth-footer">
          Ti sei ricordato? <Link href="/login">Torna al login</Link>
        </p>
      </section>
    </main>
  );
}
