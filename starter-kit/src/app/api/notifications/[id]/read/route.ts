import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

type NotificationRouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(
  _req: Request,
  { params }: NotificationRouteContext
) {
  try {
    const notification = await prisma.notification.update({
      where: { id: params.id },
      data: { read: true },
    });

    return NextResponse.json(notification);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.error("Notification read API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
