import prisma from "@/lib/prisma";

export async function createScanNotification(
  clinicId: string,
  patientLabel: string
): Promise<void> {
  // TODO: Replace DB-only notification with Twilio/Telnyx dispatch
  // once credentials are available. This is a stub per the challenge spec.
  try {
    await prisma.notification.create({
      data: {
        type: "SCAN_COMPLETED",
        clinicId,
        message: `New scan received from ${patientLabel}`,
      },
    });
  } catch (error) {
    console.error("Failed to create scan notification", error);
  }
}
