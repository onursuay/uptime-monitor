import { NextRequest, NextResponse } from "next/server";
import { getSites, addSite, removeSite } from "@/lib/store";

export async function GET() {
  const sites = await getSites();
  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  const { url, name } = await req.json();

  if (!url || !name) {
    return NextResponse.json(
      { error: "url ve name alanlari zorunlu" },
      { status: 400 }
    );
  }

  // URL formatini kontrol et
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Gecersiz URL formati" },
      { status: 400 }
    );
  }

  const site = await addSite(url, name);
  return NextResponse.json(site, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id parametresi zorunlu" },
      { status: 400 }
    );
  }

  const removed = await removeSite(id);
  if (!removed) {
    return NextResponse.json({ error: "Site bulunamadi" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
