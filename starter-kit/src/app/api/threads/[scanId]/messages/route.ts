import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";

type ThreadMessagesRouteContext = {
  params: {
    scanId: string;
  };
};

export async function GET(
  _req: Request,
  { params }: ThreadMessagesRouteContext
) {
  try {
    const thread = await prisma.thread.findUnique({
      where: { scanId: params.scanId },
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!thread) {
      return NextResponse.json({ messages: [] });
    }

    return NextResponse.json({ messages: thread.messages });
  } catch (error) {
    console.error("Thread messages GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: ThreadMessagesRouteContext
) {
  try {
    const body = await req.json();
    const content =
      typeof body.content === "string" ? body.content.trim() : "";
    const senderId =
      typeof body.senderId === "string" ? body.senderId.trim() : "";
    const fieldErrors: Record<string, string> = {};

    if (!content) {
      fieldErrors.content = "Content is required";
    } else if (content.length > 1000) {
      fieldErrors.content = "Content must be 1000 characters or less";
    }

    if (!senderId) {
      fieldErrors.senderId = "senderId is required";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ errors: fieldErrors }, { status: 400 });
    }

    const message = await prisma.$transaction(async (tx) => {
      const sender = await tx.user.upsert({
        where: { id: senderId },
        update: {},
        create: {
          id: senderId,
          name: senderId === "demo-patient" ? "Patient Preview" : senderId,
        },
      });

      const thread = await tx.thread.upsert({
        where: { scanId: params.scanId },
        update: {},
        create: {
          scanId: params.scanId,
        },
      });

      return tx.message.create({
        data: {
          content,
          threadId: thread.id,
          senderId: sender.id,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error("Thread messages POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
