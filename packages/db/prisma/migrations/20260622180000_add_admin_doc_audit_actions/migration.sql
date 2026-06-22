-- AlterEnum: azioni di audit per gestione documenti da parte dell'admin
ALTER TYPE "AuditAction" ADD VALUE 'DOC_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'DOC_ADMIN_UPLOADED';
