import { AuditAction, db, DocumentStatus, DocumentType, UserRole, type Prisma } from "@gestionale/db";
import { NextResponse } from "next/server";

import { withMobileAuth } from "@/lib/auth/with-mobile-auth";
import { getProfilePhotoUrls } from "@/lib/profile-photo";
import { logAdminAction } from "@/lib/services/audit-log-service";
import { createUserByAdmin } from "@/lib/services/user-service";
import { DomainError } from "@/lib/services/errors";
import {
  mobileAdminCreateUserSchema,
  mobileAdminUsersQuerySchema
} from "@/lib/validators/mobile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/admin/users?q=&role=&sort=&association=&cursor=&limit=
 * 200: { items: UserListRow[], nextCursor: string | null }
 *
 * Cursor-based pagination. L'ordine è alfabetico per nome (default) oppure per
 * data di iscrizione (createdAt DESC) se sort=registration. In entrambi i casi
 * l'id chiude l'orderBy come tie-breaker stabile, così il cursor (solo id)
 * resta consistente tra le pagine. La performance è accettabile per i volumi
 * del gestionale palestra.
 */
export const GET = withMobileAuth(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const parsed = mobileAdminUsersQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      association: searchParams.get("association") ?? undefined,
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
    }

    const limit = parsed.data.limit ?? 30;
    const where: Prisma.UserWhereInput = {};

    if (parsed.data.role) {
      where.role = parsed.data.role;
    }
    if (parsed.data.association === "member") {
      where.associationMember = true;
    } else if (parsed.data.association === "non_member") {
      where.associationMember = false;
    }
    if (parsed.data.q) {
      // Tokenizza la query su spazi: ogni token deve matchare almeno un campo
      // (AND tra token, OR tra campi). Così "Mario Rossi" e "Rossi Mario"
      // funzionano, non solo il match dell'intera stringa su un singolo campo.
      const tokens = parsed.data.q.split(/\s+/).filter(Boolean);
      where.AND = tokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: "insensitive" as const } },
          { lastName: { contains: token, mode: "insensitive" as const } },
          { email: { contains: token, mode: "insensitive" as const } }
        ]
      }));
    }

    if (parsed.data.certificate && parsed.data.certificate !== "all") {
      // Il certificato medico è un requisito degli iscritti: se non è già stato
      // scelto un ruolo, limitiamo il filtro agli iscritti (altrimenti "senza
      // scadenza" matcherebbe anche admin/istruttori che un certificato non
      // devono averlo). La scadenza vive sul documento MEDICAL_CERTIFICATE
      // approvato, unico per iscritto.
      if (!parsed.data.role) where.role = UserRole.SUBSCRIBER;
      const now = new Date();
      const startToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
      const soonEnd = new Date(startToday.getTime() + 30 * 86_400_000);
      const approvedCert = {
        type: DocumentType.MEDICAL_CERTIFICATE,
        status: DocumentStatus.APPROVED
      };
      if (parsed.data.certificate === "expired") {
        where.documents = {
          some: { ...approvedCert, medicalCertificateExpiresAt: { lt: startToday } }
        };
      } else if (parsed.data.certificate === "soon") {
        where.documents = {
          some: {
            ...approvedCert,
            medicalCertificateExpiresAt: { gte: startToday, lte: soonEnd }
          }
        };
      } else if (parsed.data.certificate === "missing") {
        // Nessun certificato approvato con scadenza segnata.
        where.documents = {
          none: { ...approvedCert, medicalCertificateExpiresAt: { not: null } }
        };
      }
    }

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      parsed.data.sort === "registration"
        ? [{ createdAt: "desc" }, { id: "asc" }]
        : [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }];

    const items = await db.user.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        subscription: {
          select: { tier: true, endsAt: true, deactivatedAt: true }
        }
      }
    });

    const hasMore = items.length > limit;
    const sliced = hasMore ? items.slice(0, limit) : items;

    const photoMap = await getProfilePhotoUrls(sliced.map((u) => u.id));

    return NextResponse.json({
      items: sliced.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role,
        avatarUrl: photoMap.get(u.id) ?? null,
        subscription: u.subscription && !u.subscription.deactivatedAt
          ? {
              tier: u.subscription.tier,
              endsAt: u.subscription.endsAt.toISOString()
            }
          : null
      })),
      nextCursor: hasMore ? sliced[sliced.length - 1]!.id : null
    });
  },
  { allowedRoles: [UserRole.ADMIN] }
);

/**
 * POST /api/mobile/admin/users
 * Body: { firstName, lastName, email, password, role }
 * 201: { id, firstName, lastName, email, role }
 */
export const POST = withMobileAuth(
  async (request, { user }) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = mobileAdminCreateUserSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", issues: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const created = await createUserByAdmin(db, user.role, parsed.data);

      await logAdminAction(db, {
        actorId: user.id,
        targetUserId: created.id,
        action: AuditAction.USER_CREATED,
        payload: {
          firstName: created.firstName,
          lastName: created.lastName,
          email: created.email,
          role: created.role
        }
      });

      return NextResponse.json(
        {
          id: created.id,
          firstName: created.firstName,
          lastName: created.lastName,
          email: created.email,
          role: created.role
        },
        { status: 201 }
      );
    } catch (e) {
      if (e instanceof DomainError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
      }
      throw e;
    }
  },
  { allowedRoles: [UserRole.ADMIN] }
);
