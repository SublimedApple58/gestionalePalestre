"use client";

import {
  DocumentStatus,
  DocumentSide,
  DocumentType,
  UserRole,
  type UserDocument
} from "@gestionale/db";
import { ShieldCheck } from "lucide-react";
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

const STEPS: OnboardingStep[] = [
  {
    id: "tax",
    title: "Codice fiscale",
    description:
      "Carica fronte e retro. Puoi scattare una foto dal telefono o caricare file esistenti.",
    type: DocumentType.TAX_CODE,
    slots: [DocumentSide.FRONT, DocumentSide.BACK]
  },
  {
    id: "identity",
    title: "Documento identita'",
    description:
      "Carica fronte e retro del documento. L'AI estrae automaticamente il numero documento.",
    type: DocumentType.IDENTITY_DOCUMENT,
    slots: [DocumentSide.FRONT, DocumentSide.BACK]
  },
  {
    id: "medical",
    title: "Certificato medico",
    description:
      "Carica il certificato e imposta la data di scadenza. Passera' in revisione admin.",
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

  return (
    <div className="onboarding-blocker" role="dialog" aria-modal="true" aria-label="Onboarding documenti obbligatori">
      <section className="onboarding-card">
        <header className="onboarding-header">
          <p className="panel-kicker">Onboarding obbligatorio</p>
          <h2 className="onboarding-title">Completa i documenti per attivare il tuo account</h2>
          <p className="subtitle">
            Finche&apos; non completi i passaggi richiesti non puoi usare liberamente la piattaforma.
          </p>
        </header>

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
                  {completedSteps[index] ? <ShieldCheck size={14} aria-hidden="true" /> : index + 1}
                </span>
                <span className="onboarding-step-copy">
                  <strong>{step.title}</strong>
                  <small>
                    {completedSteps[index] ? "Completato" : "Da completare"}
                  </small>
                </span>
              </button>
            );
          })}
        </div>

        <section className="onboarding-step-content">
          <p className="panel-kicker">{`Step ${activeStepIndex + 1} di ${STEPS.length}`}</p>
          <h3 className="panel-title">{activeStep.title}</h3>
          <p className="subtitle">{activeStep.description}</p>

          <div
            className={`onboarding-slots-grid ${
              activeStep.slots.length > 1 ? "double" : "single"
            }`}
          >
            {activeStep.slots.map((side) => (
              <DocumentUploadSlot
                key={`${activeStep.type}-${side}`}
                type={activeStep.type}
                side={side}
                slotTitle={
                  side === DocumentSide.SINGLE ? documentTypeLabel(activeStep.type) : side === DocumentSide.FRONT ? "Fronte" : "Retro"
                }
                current={getDocumentSlot(documents, { type: activeStep.type, side })}
                medicalCertificateRequired={activeStep.type === DocumentType.MEDICAL_CERTIFICATE}
              />
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
