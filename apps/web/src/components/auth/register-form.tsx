"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { registerAction } from "@/app/actions/auth-actions";

type Step1Data = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
};

type RegisterFormProps = {
  error: string | null;
};

export function RegisterForm({ error }: RegisterFormProps) {
  const [step, setStep] = useState<0 | 1>(0);
  const [step1, setStep1] = useState<Step1Data>({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    password: ""
  });

  function handleStep1Next(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    setStep1({
      firstName: (f.elements.namedItem("firstName") as HTMLInputElement).value,
      lastName: (f.elements.namedItem("lastName") as HTMLInputElement).value,
      email: (f.elements.namedItem("email") as HTMLInputElement).value,
      phoneNumber: (f.elements.namedItem("phoneNumber") as HTMLInputElement).value,
      password: (f.elements.namedItem("password") as HTMLInputElement).value
    });
    setStep(1);
  }

  function handleStep2Submit(e: React.FormEvent<HTMLFormElement>) {
    const f = e.currentTarget;
    const via = (f.elements.namedItem("via") as HTMLInputElement).value.trim();
    const cap = (f.elements.namedItem("cap") as HTMLInputElement).value.trim();
    const citta = (f.elements.namedItem("citta") as HTMLInputElement).value.trim();
    const prov = (f.elements.namedItem("provincia") as HTMLInputElement).value.trim().toUpperCase();
    const hidden = f.elements.namedItem("address") as HTMLInputElement;
    hidden.value = `${via}, ${cap} ${citta} (${prov})`;
  }

  /* ── Step 1 — dati account ───────────────────────────────────────────── */
  if (step === 0) {
    return (
      <section className="auth-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.jpeg" alt="House of Muscle" className="auth-brand-logo" />
        <div className="auth-step-indicator">
          <span className="auth-step-dot active" />
          <span className="auth-step-connector" />
          <span className="auth-step-dot" />
        </div>

        <div>
          <p className="eyebrow">Gestionale Palestre · 1 di 2</p>
          <h1>Registrati</h1>
          <p className="subtitle">Crea il tuo account iscritto.</p>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}

        <form onSubmit={handleStep1Next} className="grid-form">
          <label className="input-group">
            <span>Nome</span>
            <input name="firstName" required minLength={2} defaultValue={step1.firstName} autoComplete="given-name" />
          </label>

          <label className="input-group">
            <span>Cognome</span>
            <input name="lastName" required minLength={2} defaultValue={step1.lastName} autoComplete="family-name" />
          </label>

          <label className="input-group">
            <span>Email</span>
            <input name="email" type="email" required defaultValue={step1.email} autoComplete="email" inputMode="email" />
          </label>

          <label className="input-group">
            <span>Cellulare</span>
            <input
              name="phoneNumber"
              type="tel"
              required
              defaultValue={step1.phoneNumber}
              autoComplete="tel"
              inputMode="tel"
              placeholder="Es. +39 333 123 4567"
            />
          </label>

          <label className="input-group">
            <span>Password</span>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>

          <button type="submit" className="button button-primary">
            Avanti
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </form>

        <p className="auth-footer">
          Hai già un account? <Link href="/login">Vai al login</Link>
        </p>
      </section>
    );
  }

  /* ── Step 2 — indirizzo di residenza ─────────────────────────────────── */
  return (
    <section className="auth-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpeg" alt="House of Muscle" className="auth-brand-logo" />
      <div className="auth-step-indicator">
        <span className="auth-step-dot done" />
        <span className="auth-step-connector done" />
        <span className="auth-step-dot active" />
      </div>

      <div>
        <p className="eyebrow">Gestionale Palestre · 2 di 2</p>
        <h1>Residenza</h1>
        <p className="subtitle">Indirizzo di residenza completo.</p>
      </div>

      <form action={registerAction} onSubmit={handleStep2Submit} className="grid-form">
        {/* Campi step 1 come hidden */}
        <input type="hidden" name="firstName" value={step1.firstName} />
        <input type="hidden" name="lastName" value={step1.lastName} />
        <input type="hidden" name="email" value={step1.email} />
        <input type="hidden" name="phoneNumber" value={step1.phoneNumber} />
        <input type="hidden" name="password" value={step1.password} />
        {/* Indirizzo combinato — valorizzato da handleStep2Submit prima del submit */}
        <input type="hidden" name="address" />

        <label className="input-group">
          <span>Via e numero civico</span>
          <input
            name="via"
            required
            minLength={3}
            maxLength={150}
            autoComplete="address-line1"
            placeholder="Via Roma 1"
          />
        </label>

        <div className="register-address-row">
          <label className="input-group">
            <span>CAP</span>
            <input
              name="cap"
              required
              pattern="\d{5}"
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              placeholder="20100"
            />
          </label>

          <label className="input-group">
            <span>Città</span>
            <input
              name="citta"
              required
              minLength={2}
              maxLength={80}
              autoComplete="address-level2"
              placeholder="Milano"
            />
          </label>
        </div>

        <label className="input-group">
          <span>Provincia</span>
          <input
            name="provincia"
            required
            minLength={2}
            maxLength={2}
            autoComplete="address-level1"
            placeholder="MI"
            style={{ textTransform: "uppercase" }}
          />
        </label>

        <label className="terms-check">
          <input type="checkbox" name="terms" required />
          <span>
            Ho letto e accetto i{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Termini e Condizioni</a>
            {" "}e l'
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Informativa Privacy</a>.
          </span>
        </label>

        <div className="register-step-nav">
          <button
            type="button"
            className="button button-ghost"
            onClick={() => setStep(0)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Indietro
          </button>

          <button type="submit" className="button button-primary">
            Crea account
          </button>
        </div>
      </form>
    </section>
  );
}
