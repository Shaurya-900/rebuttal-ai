// The evidence packet PDF for a stored run. Packets are deterministic, so we rebuild the bytes and check the hash.
import { buildPacket } from "../../../../../lib/agent/packet";
import { SCENARIOS } from "../../../../../lib/agent/scenarios";
import { getDb } from "../../../../../lib/db/client";
import { getRun } from "../../../../../lib/desk";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const got = Number.isInteger(id) ? await getRun(getDb(), id) : null;
  const s = got && SCENARIOS[got.run.scenarioId];
  if (!got?.run.packet || !s) return new Response("not found", { status: 404 });
  const p = await buildPacket(s, got.run.rubric, got.run.quarantine);
  if (p.sha256 !== got.run.packet.sha256) return new Response("packet hash mismatch", { status: 500 }); // never serve a different packet
  return new Response(Buffer.from(p.bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${s.id}-evidence-packet-SYNTHETIC.pdf"` },
  });
}
