import { AuditAction, db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrl } from "@/lib/profile-photo";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { deleteUserByAdmin } from "@/lib/services/user-service";
import { DomainError } from "@/lib/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/users/[id]
 * 200: { user, avatarUrl, subscription, payments, documents, assignedInstructor }
 */
export const GET = withMobileAuth<{ id: string }>(
  async (_request, { params }) => {
    const userRow = await db.user.findUnique({
      where: { id: params.id },
      include: {
        subscription: true,
        documents: {
          select: {
            id: true,
            type: true,
            side: true,
            status: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
            rejectionReason: true,
            medicalCertificateExpiresAt: true
          }
        },
        assignedInstructor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        payments: {
          select: {
            id: true,
            tier: true,
            amountCents: true,
            currency: true,
            provider: true,
            status: true,
            createdAt: true,
            paidAt: true
          },
          orderBy: { createdAt: "desc" },
          take: 30
        },
        workoutAssignmentsReceived: {
          select: {
            template: {
              select: {
                id: true,
                name: true,
                daysPerWeek: true,
                createdBy: {
                  select: { id: true, firstName: true, lastName: true }
                }
              }
            },
            assignedAt: true
          },
          orderBy: { assignedAt: "desc" }
        }
      }
    });

    if (!userRow) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    const avatarUrl = await getProfilePhotoUrl(userRow.id).catch(() => null);

    return NextResponse.json({
      user: {
        id: userRow.id,
        firstName: userRow.firstName,
        lastName: userRow.lastName,
        email: userRow.email,
        role: userRow.role,
        accessCode: userRow.accessCode,
        phoneNumber: userRow.phoneNumber,
        address: userRow.address,
        dateOfBirth: userRow.dateOfBirth ? userRow.dateOfBirth.toISOString() : null,
        createdAt: userRow.createdAt.toISOString()
      },
      avatarUrl,
      assignedInstructor: userRow.assignedInstructor,
      subscription: userRow.subscription
        ? {
            tier: userRow.subscription.tier,
            startsAt: userRow.subscription.startsAt.toISOString(),
            endsAt: userRow.subscription.endsAt.toISOString(),
            deactivatedAt: userRow.subscription.deactivatedAt
              ? userRow.subscription.deactivatedAt.toISOString()
              : null
          }
        : null,
      documents: userRow.documents.map((d) => ({
        id: d.id,
        type: d.type,
        side: d.side,
        status: d.status,
        fileName: d.fileName,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt.toISOString(),
        rejectionReason: d.rejectionReason,
        medicalCertificateExpiresAt: d.medicalCertificateExpiresAt
          ? d.medicalCertificateExpiresAt.toISOString()
          : null
      })),
      payments: userRow.payments.map((p) => ({
        id: p.id,
        tier: p.tier,
        amountCents: p.amountCents,
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt ? p.paidAt.toISOString() : null
      })),
      workoutAssignments: userRow.workoutAssignmentsReceived.map((a) => ({
        templateId: a.template.id,
        templateName: a.template.name,
        daysPerWeek: a.template.daysPerWeek,
        createdBy: a.template.createdBy,
        assignedAt: a.assignedAt.toISOString()
      }))
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);

/**
 * DELETE /api/mobile/admin/users/[id]
 * 204
 *
 * Block ultimo admin gestito da deleteUserByAdmin → DomainError("LAST_ADMIN").
 */
export const DELETE = withMobileAuth<{ id: string }>(
  async (_request, { params, user }) => {
    // Log PRIMA della delete per popolare targetSnapshot mentre l'utente esiste.
    // Se la delete fallisce, il log resta come tentativo — accettabile.
    await logAdminAction(db, {
      actorId: user.id,
      targetUserId: params.id,
      action: AuditAction.USER_DELETED
    });

    try {
      await deleteUserByAdmin(db, user.role, { targetUserId: params.id });
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }
    return new NextResponse(null, { status: 204 });
  },
  { allowedRoles: [UserRole.ADMIN] }
);
