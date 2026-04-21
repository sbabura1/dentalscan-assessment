import { NextResponse } from "next/server";
import { createScanNotification } from "@/lib/notifications";
import prisma from "@/lib/prisma";

const DEFAULT_CLINIC_ID = "demo-clinic";

/**
 * CHALLENGE: NOTIFICATION SYSTEM
 * 
 * Your goal is to implement a robust notification logic.
 * 1. When a scan is "completed", create a record in the Notification table.
 * 2. Return a success status to the client.
 * 3. Bonus: Handle potential errors (e.g., database connection issues).
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { scanId, status } = body;
    const clinicId =
      typeof body.clinicId === "string" && body.clinicId.trim()
        ? body.clinicId
        : DEFAULT_CLINIC_ID;
    const patientLabel =
      typeof body.patientLabel === "string" && body.patientLabel.trim()
        ? body.patientLabel.trim()
        : `Patient #${scanId ?? "pending"}`;

    if (status === "completed") {
      await prisma.clinic.upsert({
        where: { id: clinicId },
        update: {},
        create: {
          id: clinicId,
          name: "Demo Dental Clinic",
        },
      });

      await createScanNotification(clinicId, patientLabel);

      return NextResponse.json({ ok: true, message: "Notification triggered" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Notification API Error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
