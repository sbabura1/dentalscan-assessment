import { NextResponse } from "next/server";

import { createScanNotification } from "@/lib/notifications";
import prisma from "@/lib/prisma";

const DEFAULT_CLINIC_ID = "demo-clinic";
const DEFAULT_CLINIC_NAME = "Demo Dental Clinic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const images = Array.isArray(body.images)
      ? body.images.filter((image: unknown): image is string => typeof image === "string")
      : [];
    const clinicId =
      typeof body.clinicId === "string" && body.clinicId.trim()
        ? body.clinicId
        : DEFAULT_CLINIC_ID;
    const patientLabel =
      typeof body.patientLabel === "string" && body.patientLabel.trim()
        ? body.patientLabel.trim()
        : "Patient";

    await prisma.clinic.upsert({
      where: { id: clinicId },
      update: {},
      create: {
        id: clinicId,
        name: DEFAULT_CLINIC_NAME,
      },
    });

    await prisma.user.upsert({
      where: { id: "demo-patient" },
      update: {
        name: "Patient Preview",
        clinicId,
      },
      create: {
        id: "demo-patient",
        name: "Patient Preview",
        clinicId,
      },
    });

    const scan = await prisma.scan.create({
      data: {
        status: "completed",
        images: images.join(","),
        clinicId,
        patientLabel,
      },
    });

    const response = NextResponse.json(scan, { status: 201 });
    setImmediate(() => void createScanNotification(clinicId, patientLabel || `Patient #${scan.id}`));

    return response;
  } catch (error) {
    console.error("Scan upload API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
