import prisma from "@/lib/prisma";

export async function createScanNotification(
  clinicId: string,
  patientLabel: string
): Promise<void> {
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
