import { db, UserRole } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrl } from "@/lib/profile-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/instructor/students/[id]
 *
 * Permission: INSTRUCTOR vede solo i suoi assegnati. ADMIN qualunque iscritto.
 */
export const GET = withMobileAuth<{ id: string }>(
  async (_request, { params, user }) => {
    const student = await db.user.findUnique({
      where: { id: params.id },
      include: {
        subscription: { select: { tier: true, startsAt: true, endsAt: true } },
        documents: {
          select: {
            id: true,
            type: true,
            side: true,
            status: true,
            uploadedAt: true,
            medicalCertificateExpiresAt: true
          }
        },
        assignedInstructor: { select: { id: true } },
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

    if (!student || student.role !== UserRole.SUBSCRIBER) {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }

    if (user.role === UserRole.INSTRUCTOR && student.assignedInstructor?.id !== user.id) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const avatarUrl = await getProfilePhotoUrl(student.id).catch(() => null);

    return NextResponse.json({
      user: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phoneNumber: student.phoneNumber,
        address: student.address,
        dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString() : null
      },
      avatarUrl,
      subscription: student.subscription
        ? {
            tier: student.subscription.tier,
            startsAt: student.subscription.startsAt.toISOString(),
            endsAt: student.subscription.endsAt.toISOString()
          }
        : null,
      documents: student.documents.map((d) => ({
        id: d.id,
        type: d.type,
        side: d.side,
        status: d.status,
        uploadedAt: d.uploadedAt.toISOString(),
        medicalCertificateExpiresAt: d.medicalCertificateExpiresAt
          ? d.medicalCertificateExpiresAt.toISOString()
          : null
      })),
      workoutAssignments: student.workoutAssignmentsReceived.map((a) => ({
        templateId: a.template.id,
        templateName: a.template.name,
        daysPerWeek: a.template.daysPerWeek,
        createdBy: a.template.createdBy,
        assignedAt: a.assignedAt.toISOString()
      }))
    });
  },
  { allowedRoles: [UserRole.INSTRUCTOR, UserRole.ADMIN] }
);
