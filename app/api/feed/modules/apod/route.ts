import { NextResponse } from "next/server";
import { getApodModuleData } from "@/lib/feed/modules/apod";

export async function GET() {
  try {
    const data = await getApodModuleData();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "APOD fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
