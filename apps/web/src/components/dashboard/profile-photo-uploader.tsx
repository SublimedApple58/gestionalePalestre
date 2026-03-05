import { DocumentSide, DocumentType, type UserDocument } from "@gestionale/db";

import { DocumentUploadSlot } from "./document-upload-slot";

type ProfilePhotoUploaderProps = {
  document: Pick<
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
  > | null;
};

export function ProfilePhotoUploader({ document }: ProfilePhotoUploaderProps) {
  return (
    <section className="panel panel-full">
      <p className="panel-kicker">Foto profilo</p>
      <h3 className="panel-title">Upload foto profilo (facoltativo)</h3>
      <DocumentUploadSlot type={DocumentType.PROFILE_PHOTO} side={DocumentSide.SINGLE} current={document} />
    </section>
  );
}
