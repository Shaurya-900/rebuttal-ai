// Card faces and the reader's display, drawn on canvases at runtime (no image files, nothing to license).
// The card is an original black-metal design: fine silver border, engraved scales medallion, chip, wordmark.

const SILVER = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, "#f2efe8"); g.addColorStop(0.45, "#b9b4aa"); g.addColorStop(0.55, "#d8d3c9"); g.addColorStop(1, "#8f8a80");
  return g;
};

function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

/** Front of the card, 1024 x 646 (ISO card ratio), transparent outside the rounded corners. */
export function drawCardFront(font: string): HTMLCanvasElement {
  const W = 1024, H = 646, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  rounded(c, 0, 0, W, H, 44); c.clip();
  // brushed black metal
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a1b1b"); bg.addColorStop(0.5, "#0d0e0e"); bg.addColorStop(1, "#151616");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`; c.fillRect(0, rnd() * H, W, 1); }

  // fine double border with a guilloché band between the rules
  c.strokeStyle = "rgba(205,200,190,0.55)"; c.lineWidth = 1.5;
  rounded(c, 22, 22, W - 44, H - 44, 28); c.stroke();
  rounded(c, 40, 40, W - 80, H - 80, 18); c.stroke();
  c.strokeStyle = "rgba(205,200,190,0.28)"; c.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    for (let x = 30; x <= W - 30; x += 2) c.lineTo(x, 31 + Math.sin(x / 9 + k * 2.1) * 4);
    c.stroke(); c.beginPath();
    for (let x = 30; x <= W - 30; x += 2) c.lineTo(x, H - 31 + Math.sin(x / 9 + k * 2.1) * 4);
    c.stroke();
  }

  // wordmark
  c.textAlign = "center"; c.textBaseline = "middle";
  c.font = `600 58px ${font}`; c.letterSpacing = "14px";
  c.fillStyle = SILVER(c, 300, 90, 720, 140); c.fillText("REBUTTAL", W / 2 + 7, 118);

  // chip
  const cx = 110, cy = 230, cw = 128, ch = 98;
  const cg = c.createLinearGradient(cx, cy, cx + cw, cy + ch);
  cg.addColorStop(0, "#e9e4d8"); cg.addColorStop(0.5, "#a9a497"); cg.addColorStop(1, "#d6d1c4");
  rounded(c, cx, cy, cw, ch, 16); c.fillStyle = cg; c.fill();
  c.strokeStyle = "rgba(60,58,52,0.55)"; c.lineWidth = 2.5; c.beginPath();
  c.moveTo(cx, cy + ch / 3); c.lineTo(cx + 40, cy + ch / 3); c.lineTo(cx + 50, cy + ch / 2); c.lineTo(cx + 78, cy + ch / 2); c.lineTo(cx + 88, cy + ch / 3); c.lineTo(cx + cw, cy + ch / 3);
  c.moveTo(cx, cy + (ch * 2) / 3); c.lineTo(cx + 40, cy + (ch * 2) / 3); c.lineTo(cx + 50, cy + ch / 2);
  c.moveTo(cx + 78, cy + ch / 2); c.lineTo(cx + 88, cy + (ch * 2) / 3); c.lineTo(cx + cw, cy + (ch * 2) / 3);
  c.moveTo(cx + 64, cy); c.lineTo(cx + 64, cy + ch / 2 - 12); c.moveTo(cx + 64, cy + ch / 2 + 12); c.lineTo(cx + 64, cy + ch);
  c.stroke();

  // engraved medallion: an oval with hatching and a balance scale
  const mx = W / 2, my = 345, rx = 118, ry = 150;
  c.save();
  c.beginPath(); c.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2); c.clip();
  c.fillStyle = "#121313"; c.fillRect(mx - rx, my - ry, rx * 2, ry * 2);
  c.strokeStyle = "rgba(210,205,195,0.16)"; c.lineWidth = 1;
  for (let y = my - ry; y < my + ry; y += 5) { c.beginPath(); c.moveTo(mx - rx, y); c.lineTo(mx + rx, y + 18); c.stroke(); }
  c.restore();
  c.strokeStyle = SILVER(c, mx - rx, my - ry, mx + rx, my + ry); c.lineWidth = 4;
  c.beginPath(); c.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.5; c.beginPath(); c.ellipse(mx, my, rx - 10, ry - 10, 0, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = SILVER(c, mx - 80, my - 90, mx + 80, my + 90); c.lineWidth = 6; c.lineCap = "round";
  c.beginPath();
  c.moveTo(mx, my - 92); c.lineTo(mx, my + 78); // post
  c.moveTo(mx - 52, my + 82); c.lineTo(mx + 52, my + 82); // foot
  c.moveTo(mx - 78, my - 58); c.lineTo(mx + 78, my - 70); // beam, tipped: the firewall weighs it
  c.stroke();
  c.lineWidth = 3;
  for (const [px, py] of [[mx - 78, my - 58], [mx + 78, my - 70]] as const) {
    c.beginPath(); c.moveTo(px, py); c.lineTo(px - 30, py + 62); c.moveTo(px, py); c.lineTo(px + 30, py + 62); c.stroke();
    c.beginPath(); c.ellipse(px, py + 64, 34, 9, 0, 0, Math.PI); c.stroke();
  }
  c.beginPath(); c.arc(mx, my - 100, 9, 0, Math.PI * 2); c.stroke();

  // "member since" ribbon
  c.font = `500 20px ${font}`; c.letterSpacing = "5px"; c.fillStyle = "rgba(220,215,205,0.8)";
  c.fillText("MEMBER SINCE", 800, 410);
  c.font = `500 46px ${font}`; c.letterSpacing = "2px"; c.fillStyle = SILVER(c, 760, 430, 840, 480);
  c.fillText("26", 800, 455);

  // holder and a quiet synthetic mark
  c.textAlign = "left"; c.font = `500 40px ${font}`; c.letterSpacing = "4px";
  c.fillStyle = SILVER(c, 80, 540, 520, 580); c.fillText("HACKATHON JUDGE", 82, 566);
  c.textAlign = "right"; c.font = `500 16px ${font}`; c.letterSpacing = "4px"; c.fillStyle = "rgba(220,215,205,0.55)";
  c.fillText("SYNTHETIC · NOT A PAYMENT CARD", W - 74, 570);
  return cv;
}

/** Back: magnetic stripe (what the reader "reads"), signature panel, small print. */
export function drawCardBack(font: string): HTMLCanvasElement {
  const W = 1024, H = 646, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d")!;
  rounded(c, 0, 0, W, H, 44); c.clip();
  c.fillStyle = "#121313"; c.fillRect(0, 0, W, H);
  const s = c.createLinearGradient(0, 70, 0, 190);
  s.addColorStop(0, "#050505"); s.addColorStop(0.5, "#1d1b19"); s.addColorStop(1, "#050505");
  c.fillStyle = s; c.fillRect(0, 70, W, 120);
  c.fillStyle = "#d9d4c8"; c.fillRect(70, 250, 560, 80);
  c.strokeStyle = "rgba(0,0,0,0.12)";
  for (let x = 70; x < 630; x += 8) { c.beginPath(); c.moveTo(x, 250); c.lineTo(x + 30, 330); c.stroke(); }
  c.font = `500 22px ${font}`; c.fillStyle = "rgba(220,215,205,0.6)"; c.letterSpacing = "2px";
  c.fillText("Rebuttal AI · a demo card for the PayPal AI Hackathon 2026.", 70, 420);
  c.fillText("Synthetic. It opens a website, nothing else.", 70, 456);
  return cv;
}

/** The reader's display: dim segment-style text, like a vacuum-fluorescent panel. */
export function drawLcd(cv: HTMLCanvasElement, text: string, tone: "idle" | "ok" | "warn") {
  const c = cv.getContext("2d")!, W = cv.width, H = cv.height;
  c.fillStyle = "#0f1110"; c.fillRect(0, 0, W, H);
  const col = tone === "ok" ? "#9ff0b4" : tone === "warn" ? "#f3d08a" : "#c9d3c6";
  c.font = `600 ${H * 0.46}px ui-monospace, "Geist Mono", monospace`; c.letterSpacing = `${H * 0.08}px`;
  c.textAlign = "center"; c.textBaseline = "middle";
  c.shadowColor = col; c.shadowBlur = H * 0.12; c.fillStyle = col;
  c.fillText(text, W / 2, H / 2 + 2);
}
