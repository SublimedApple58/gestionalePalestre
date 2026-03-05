"use client";

import {
  DocumentStatus,
  DocumentSide,
  DocumentType,
  UserRole,
  type UserDocument
} from "@gestionale/db";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  documentTypeLabel,
  getDocumentSlot,
  hasRequiredDocumentSubmissions
} from "@/lib/documents";

import { DocumentUploadSlot } from "./document-upload-slot";

type OnboardingDocument = Pick<
  UserDocument,
  | "id"
  | "type"
  | "side"
  | "status"
  | "fileName"
  | "uploadedAt"
  | "aiAttempts"
  | "rejectionReason"
  | "medicalCertificateExpiresAt"
>;

type SubscriberDocumentOnboardingProps = {
  documents: OnboardingDocument[];
};

type OnboardingStep = {
  id: "tax" | "identity" | "medical";
  title: string;
  description: string;
  type: DocumentType;
  slots: DocumentSide[];
};

const STEPS: [OnboardingStep, OnboardingStep, OnboardingStep] = [
  {
    id: "tax",
    title: "Codice fiscale",
    description: "Carica fronte e retro della tessera. Puoi scattare una foto dal telefono.",
    type: DocumentType.TAX_CODE,
    slots: [DocumentSide.FRONT, DocumentSide.BACK]
  },
  {
    id: "identity",
    title: "Documento d'identità",
    description: "Carica fronte e retro. Il numero documento viene estratto automaticamente.",
    type: DocumentType.IDENTITY_DOCUMENT,
    slots: [DocumentSide.FRONT, DocumentSide.BACK]
  },
  {
    id: "medical",
    title: "Certificato medico",
    description: "Carica il certificato e imposta la data di scadenza.",
    type: DocumentType.MEDICAL_CERTIFICATE,
    slots: [DocumentSide.SINGLE]
  }
];

function isSlotSubmitted(document: OnboardingDocument | null): boolean {
  if (!document) {
    return false;
  }

  return (
    document.status !== DocumentStatus.REJECTED &&
    document.status !== DocumentStatus.NEEDS_REUPLOAD
  );
}

export function SubscriberDocumentOnboarding({
  documents
}: SubscriberDocumentOnboardingProps) {
  const completedSteps = useMemo(
    () =>
      STEPS.map((step) =>
        step.slots.every((side) =>
          isSlotSubmitted(getDocumentSlot(documents, { type: step.type, side }))
        )
      ),
    [documents]
  );

  const firstIncompleteIndex = completedSteps.findIndex((completed) => !completed);
  const onboardingDone = firstIncompleteIndex === -1;

  const [activeStepIndex, setActiveStepIndex] = useState(
    firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex
  );

  useEffect(() => {
    if (firstIncompleteIndex !== -1) {
      setActiveStepIndex(firstIncompleteIndex);
    }
  }, [firstIncompleteIndex]);

  const gateCompleted = hasRequiredDocumentSubmissions(UserRole.SUBSCRIBER, documents);

  if (onboardingDone || gateCompleted) {
    return null;
  }

  const activeStep = STEPS[activeStepIndex] ?? STEPS[0];
  const progressPct = ((activeStepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="onboarding-blocker" role="dialog" aria-modal="true" aria-label="Onboarding documenti obbligatori">
      <section className="onboarding-card">

        {/* ── Progress bar — mobile only ─────────────────────────── */}
        <div className="onboarding-progress-track" aria-hidden="true">
          <div className="onboarding-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* ── Header ────────────────────────────────────────────── */}
        <header className="onboarding-header">
          <p className="panel-kicker">Documenti obbligatori</p>
          <h2 className="onboarding-title">Attiva il tuo account</h2>
        </header>

        {/* ── Stepper — desktop only ─────────────────────────────── */}
        <div className="onboarding-stepper">
          {STEPS.map((step, index) => {
            const status = completedSteps[index]
              ? "done"
              : index === activeStepIndex
              ? "active"
              : "todo";

            return (
              <button
                key={step.id}
                type="button"
                className={`onboarding-step ${status}`}
                onClick={() => setActiveStepIndex(index)}
              >
                <span className="onboarding-step-index">
                  {completedSteps[index] ? <ShieldCheck size={13} aria-hidden="true" /> : index + 1}
                </span>
                <span className="onboarding-step-copy">
                  <strong>{step.title}</strong>
                  <small>{completedSteps[index] ? "Completato" : "Da completare"}</small>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Step content ──────────────────────────────────────── */}
        <section className="onboarding-step-content">
          <div className="onboarding-step-meta">
            <p className="panel-kicker">{`${activeStepIndex + 1} / ${STEPS.length}`}</p>
            <h3 className="panel-title">{activeStep.title}</h3>
            <p className="subtitle">{activeStep.description}</p>
          </div>

          <div className={`onboarding-slots-grid ${activeStep.slots.length > 1 ? "double" : "single"}`}>
            {activeStep.slots.map((side) => (
              <DocumentUploadSlot
                key={`${activeStep.type}-${side}`}
                type={activeStep.type}
                side={side}
                slotTitle={
                  side === DocumentSide.SINGLE
                    ? documentTypeLabel(activeStep.type)
                    : side === DocumentSide.FRONT
                    ? "Fronte"
                    : "Retro"
                }
                current={getDocumentSlot(documents, { type: activeStep.type, side })}
                medicalCertificateRequired={activeStep.type === DocumentType.MEDICAL_CERTIFICATE}
              />
            ))}
          </div>
        </section>

        {/* ── Mobile prev/next nav ───────────────────────────────── */}
        <div className="onboarding-mobile-nav">
          <button
            type="button"
            className="button button-ghost onboarding-nav-btn"
            disabled={activeStepIndex === 0}
            onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
            aria-label="Step precedente"
          >
            <ChevronLeft size={16} />
            Indietro
          </button>

          <span className="onboarding-nav-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`onboarding-dot ${i === activeStepIndex ? "active" : ""} ${completedSteps[i] ? "done" : ""}`}
              />
            ))}
          </span>

          <button
            type="button"
            className="button onboarding-nav-btn"
            disabled={activeStepIndex === STEPS.length - 1}
            onClick={() => setActiveStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
            aria-label="Step successivo"
          >
            Avanti
            <ChevronRight size={16} />
          </button>
        </div>

      </section>
    </div>
  );
}
