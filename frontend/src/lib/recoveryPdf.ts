/**
 * Minimal dependency-free PDF builder for recovery codes. Generates a valid
 * single-page PDF (Courier, A4-ish) listing the one-time codes so users can
 * store them offline  this is the only export path, the server never returns
 * plaintext codes after signup.
 */

function esc(s: string): string {
  const clean = s.replace(/\u2014|\u2013/g, "-").replace(/\u2019/g, "'");
  return clean.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildRecoveryCodesPdf(codes: string[], accountEmail: string): Uint8Array {
  const body: string[] = [
    "NovaBank - Recovery codes",
    "",
    `Account: ${accountEmail}`,
    "",
    "Keep these 10 one-time codes somewhere safe and offline.",
    "Each code works once. Anyone with a code and this email",
    "can get back into the account, so treat them like cash.",
    "",
  ];
  codes.forEach((c, i) => body.push(`${String(i + 1).padStart(2, "0")}.  ${c}`));

  const streamParts: string[] = [];
  let y = 760;
  const title = body[0] ?? "";
  streamParts.push(`BT /F2 18 Tf 54 ${y} Td (${esc(title)}) Tj ET`);
  y -= 30;
  for (const line of body.slice(1)) {
    streamParts.push(`BT /F1 11 Tf 54 ${y} Td (${esc(line)}) Tj ET`);
    y -= line.startsWith("Account:") ? 18 : 15;
  }

  const stream = streamParts.join("\n");

  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    5: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>",
    6: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  };

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 6; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += "xref\n0 7\n0000000000 65535 f \n";
  for (let i = 1; i <= 6; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export function downloadRecoveryCodesPdf(codes: string[], accountEmail: string): void {
  const bytes = buildRecoveryCodesPdf(codes, accountEmail);
  const blob = new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    { type: "application/pdf" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "novabank-recovery-codes.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
