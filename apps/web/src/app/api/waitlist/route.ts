import { prisma } from "@agentura/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const waitlistPayloadSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const parsedPayload = waitlistPayloadSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    }

    await prisma.waitlistEntry.upsert({
      where: { email: parsedPayload.data.email },
      update: {},
      create: {
        email: parsedPayload.data.email,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
  }
}
