// Evidence packet PDF. Every claim line carries the source id it was verified against.
// Deterministic bytes (fixed dates, no random ids) so the sha256 in the evidence store is reproducible (I8).
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { QuarantineFields } from "./quarantine";
import { ITEM_LABELS, type RubricResult } from "./rubric";
import type { Scenario } from "./scenarios";

export type Packet = { exhibitId: string; bytes: Uint8Array; sha256: string; lines: string[] };

export function packetLines(s: Scenario, r: RubricResult, q: Record<string, QuarantineFields>): string[] {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const lines = [
    "SYNTHETIC DEMO DATA - not a real order, buyer or carrier",
    `Seller response for PayPal dispute ${s.dispute.id}`,
    `Order ${s.order.id} - ${s.order.item} - ${(s.order.amountCents / 100).toFixed(2)} ${s.order.currency}`,
    `Shipping address on the PayPal transaction: ${s.order.shippingAddress}`,
    "",
    "Evidence (each line cites the record it was checked against):",
  ];
  for (const it of r.items.filter((i) => i.awarded > 0)) {
    let detail = "";
    const ev = s.tracking.events.find((e) => e.id === it.sourceId);
    if (ev) detail = `${s.tracking.carrier} ${s.tracking.number}: ${ev.code} at ${iso(ev.atMs)}${ev.address ? ` to ${ev.address}` : ""}`;
    const msg = s.messages.find((m) => m.id === it.sourceId);
    // Only a message the quarantine marked as confirming receipt is quoted, and only up to 200 chars.
    if (msg && q[msg.id]?.itemReceived === "YES") detail = `Buyer wrote on ${iso(msg.atMs)}: "${msg.text.slice(0, 200)}"`;
    if (it.sourceId?.startsWith("order:")) detail = `Shipped ${iso(s.order.shippedMs)}, dispute opened ${iso(s.dispute.createdMs)}`;
    if (it.sourceId?.startsWith("paypal-tracking:")) detail = `Tracking ${s.tracking.number} was added to the PayPal transaction`;
    if (it.sourceId?.startsWith("tracking:")) detail = `${s.tracking.events.length} carrier events; none after delivery report a return, loss or damage`;
    const chunk = s.listing.chunks.find((c) => c.id === it.sourceId);
    if (chunk) detail = `Listing said: "${chunk.text}"`;
    lines.push(`- ${ITEM_LABELS[it.itemId]}. ${detail} [source: ${it.sourceId}]`);
  }
  return lines;
}

function wrap(text: string, max = 95): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max) { out.push(cur); cur = "  " + w; }
    else cur = (cur + " " + w).trimStart();
  }
  out.push(cur);
  return out;
}

export async function buildPacket(s: Scenario, r: RubricResult, q: Record<string, QuarantineFields>): Promise<Packet> {
  const lines = packetLines(s, r, q);
  const doc = await PDFDocument.create();
  const fixed = new Date(s.dispute.createdMs);
  doc.setTitle(`Rebuttal evidence packet ${s.dispute.id} (synthetic)`);
  doc.setProducer("Rebuttal");
  doc.setCreator("Rebuttal");
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]);
  let y = 750;
  for (const raw of lines.flatMap((l) => wrap(l))) {
    if (y < 50) { page = doc.addPage([612, 792]); y = 750; }
    // Helvetica only encodes WinAnsi; drop anything else rather than crash on buyer-supplied characters.
    const safe = raw.replace(/[^\x20-\x7E]/g, "?");
    page.drawText(safe, { x: 50, y, size: 10, font, color: safe.startsWith("SYNTHETIC") ? rgb(0.7, 0, 0) : rgb(0, 0, 0) });
    y -= 15;
  }
  const bytes = await doc.save({ useObjectStreams: false });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { exhibitId: `packet:${s.dispute.id}`, bytes, sha256, lines };
}
