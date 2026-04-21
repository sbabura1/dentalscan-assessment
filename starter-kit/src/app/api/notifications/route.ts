import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clinicId = searchParams.get("clinicId");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, Number(searchParams.get("limit") ?? "20") || 20);

  if (!clinicId) {
    return NextResponse.json({ error: "clinicId required" }, { status: 400 });
  }

  try {
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { clinicId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({
        where: { clinicId },
      }),
      prisma.notification.count({
        where: { clinicId, read: false },
      }),
    ]);

    return NextResponse.json({
      notifications,
      unreadCount,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Notifications API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
