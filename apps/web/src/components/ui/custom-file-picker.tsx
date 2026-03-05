"use client";

import { FileUp, FileText, ImageIcon } from "lucide-react";
import { useRef, useState } from "react";

type CustomFilePickerProps = {
  label: string;
  accept?: string;
  disabled?: boolean;
  selectedFileName?: string | null;
  hint?: string;
  enableCamera?: boolean;
  cameraFacingMode?: "user" | "environment";
  onPickFile: (file: File) => void;
};

function iconForFileName(fileName: string | null | undefined) {
  if (!fileName) {
    return <FileUp size={18} aria-hidden="true" />;
  }

  const normalized = fileName.toLowerCase();

  if (normalized.endsWith(".png") || normalized.endsWith(".jpg") || normalized.endsWith(".jpeg") || normalized.endsWith(".webp")) {
    return <ImageIcon size={18} aria-hidden="true" />;
  }

  return <FileText size={18} aria-hidden="true" />;
}

export function CustomFilePicker({
  label,
  accept,
  disabled = false,
  selectedFileName,
  hint,
  enableCamera = false,
  cameraFacingMode = "environment",
  onPickFile
}: CustomFilePickerProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function openFileDialog() {
    if (disabled) {
      return;
    }

    uploadInputRef.current?.click();
  }

  function openCameraDialog() {
    if (disabled) {
      return;
    }

    cameraInputRef.current?.click();
  }

  return (
    <div className="input-group">
      <span>{label}</span>

      <input
        ref={uploadInputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            onPickFile(file);
          }

          event.currentTarget.value = "";
        }}
      />

      {enableCamera ? (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture={cameraFacingMode}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              onPickFile(file);
            }

            event.currentTarget.value = "";
          }}
        />
      ) : null}

      <div
        className={`file-picker ${dragOver ? "drag-over" : ""} ${disabled ? "disabled" : ""}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openFileDialog}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFileDialog();
          }
        }}
        onDragOver={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);

          if (disabled) {
            return;
          }

          const file = event.dataTransfer.files?.[0];

          if (file) {
            onPickFile(file);
          }
        }}
      >
        <div className="file-picker-main">
          <span className="file-picker-icon">{iconForFileName(selectedFileName)}</span>

          <div className="file-picker-copy">
            <strong className="file-picker-title">
              {selectedFileName ? "File selezionato" : "Scegli o trascina un file"}
            </strong>
            <p className="file-picker-subtitle">
              {selectedFileName ?? "PDF, JPEG, PNG o WEBP"}
            </p>
          </div>
        </div>

        <div className="file-picker-actions">
          {enableCamera ? (
            <button
              type="button"
              className="button button-ghost small"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                openCameraDialog();
              }}
            >
              Scatta
            </button>
          ) : null}

          <button
            type="button"
            className="button button-ghost small"
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              openFileDialog();
            }}
          >
            Carica
          </button>
        </div>
      </div>

      {hint ? <small className="file-picker-hint">{hint}</small> : null}
    </div>
  );
}
