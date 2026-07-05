/** Map parent registration questionnaire ↔ Clients Info numbered blob. */

function clean(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

export type RegistrationAnswers = Record<string, string>;

export function buildClientsInfoFromAnswers(
  answers: RegistrationAnswers,
  ageLabel?: string | null,
): string {
  const a = answers || {};
  const lines: string[] = [];

  if (ageLabel) lines.push(`1. Age: ${ageLabel}`);

  const medical = [
    clean(a.medical_conditions),
    clean(a.allergies) ? `Allergies: ${clean(a.allergies)}` : "",
    clean(a.medication) ? `Regular medication: ${clean(a.medication)}` : "",
    a.health_plan === "Yes" && clean(a.health_plan_details)
      ? `Health plan: ${clean(a.health_plan_details)}`
      : "",
  ].filter(Boolean).join(". ");
  if (medical) lines.push(`2. Medical: ${medical}`);

  if (clean(a.motivators)) lines.push(`3. Likes/Motivators: ${clean(a.motivators)}`);
  if (clean(a.dislikes)) lines.push(`4. Dislikes/Avoids: ${clean(a.dislikes)}`);
  if (clean(a.triggers)) lines.push(`5. Known Triggers: ${clean(a.triggers)}`);
  if (clean(a.strategies)) lines.push(`6. Regulation Strategies: ${clean(a.strategies)}`);

  const support = [clean(a.support_regulated), clean(a.support_dysregulated)].filter(Boolean)
    .join(". ");
  if (support) lines.push(`7. Level of Support: ${support}`);

  if (clean(a.expressive_comm)) lines.push(`8. Communication: ${clean(a.expressive_comm)}`);
  const prefComm = [clean(a.understand_instructions), clean(a.comm_strategies)].filter(Boolean)
    .join(". ");
  if (prefComm) lines.push(`9. Preferred Communication: ${prefComm}`);

  if (clean(a.mobility)) lines.push(`10. Mobility: ${clean(a.mobility)}`);
  if (clean(a.personal_care)) lines.push(`11. Personal Care: ${clean(a.personal_care)}`);
  if (clean(a.task_engagement)) lines.push(`12. Task Engagement: ${clean(a.task_engagement)}`);
  if (clean(a.transitions)) lines.push(`13. Transitions/Flexibility: ${clean(a.transitions)}`);
  if (clean(a.risk_awareness)) lines.push(`14. Safety: ${clean(a.risk_awareness)}`);
  if (clean(a.anything_else)) lines.push(`15. Other Notes: ${clean(a.anything_else)}`);

  return lines.join("\n");
}

export function parseClientsInfoNumberedSections(blob: string): Record<number, string> {
  const text = String(blob || "").replace(/\r\n|\r/g, "\n").trim();
  if (!text) return {};
  const re = /(?:^|\s)(\d{1,2})\.\s+/g;
  const matches: Array<{ num: number; after: number; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ num: parseInt(m[1], 10), after: m.index + m[0].length, start: m.index });
  }
  const strips: Record<number, RegExp> = {
    1: /^Age:\s*/i,
    2: /^Medical:\s*/i,
    3: /^Likes\/Motivators:\s*/i,
    4: /^Dislikes\/Avoids:\s*/i,
    5: /^Known Triggers:\s*/i,
    6: /^Regulation Strategies:\s*/i,
    7: /^Level of Support:\s*/i,
    8: /^Communication:\s*/i,
    9: /^Preferred Communication:\s*/i,
    10: /^Mobility:\s*/i,
    11: /^Personal Care:\s*/i,
    12: /^Task Engagement:\s*/i,
    13: /^Transitions\/Flexibility:\s*/i,
    14: /^Safety:\s*/i,
    15: /^Other Notes:\s*/i,
  };
  const out: Record<number, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const num = matches[i].num;
    const chunkStart = matches[i].after;
    const chunkEnd = i + 1 < matches.length ? matches[i + 1].start : text.length;
    let chunk = text.slice(chunkStart, chunkEnd).trim().replace(/\s+/g, " ");
    const rx = strips[num];
    if (rx) chunk = chunk.replace(rx, "").trim();
    if (num >= 1 && num <= 15 && chunk) out[num] = chunk;
  }
  return out;
}

function splitMedicalBlob(medical: string): { conditions: string; medication: string; allergies: string } {
  let t = clean(medical, 8000);
  let medication = "";
  let allergies = "";
  const noMed = t.match(/\bno regular medication\b/i);
  if (noMed) {
    medication = "None";
    t = t.replace(/\bno regular medication\b\.?\s*/gi, " ").trim();
  }
  const medMatch = t.match(/(?:regular medication|medication):\s*([^.]+)/i);
  if (medMatch) {
    medication = clean(medMatch[1]);
    t = t.replace(medMatch[0], " ").trim();
  }
  const allergyMatch = t.match(/allergies:\s*([^.]+)/i);
  if (allergyMatch) {
    allergies = clean(allergyMatch[1]);
    t = t.replace(allergyMatch[0], " ").trim();
  }
  return { conditions: clean(t), medication, allergies };
}

/** Best-effort map Clients Info sections → registration form field names. */
export function answersFromClientsInfoBlob(blob: string): RegistrationAnswers {
  const sec = parseClientsInfoNumberedSections(blob);
  const out: RegistrationAnswers = {};
  if (sec[3]) out.motivators = sec[3];
  if (sec[4]) out.dislikes = sec[4];
  if (sec[5]) out.triggers = sec[5];
  if (sec[6]) out.strategies = sec[6];
  if (sec[7]) {
    const parts = sec[7].split(/\.\s+/);
    if (parts[0]) out.support_regulated = parts[0].replace(/^When calm[^:]*:\s*/i, "").trim() || parts[0];
    if (parts[1]) out.support_dysregulated = parts[1].trim();
    if (!parts[1] && sec[7].toLowerCase().includes("dysregulated")) {
      out.support_dysregulated = sec[7];
    } else if (!out.support_regulated) {
      out.support_regulated = sec[7];
    }
  }
  if (sec[8]) out.expressive_comm = sec[8];
  if (sec[9]) {
    const parts = sec[9].split(/\.\s+/);
    if (parts[0]) out.understand_instructions = parts[0];
    if (parts[1]) out.comm_strategies = parts.slice(1).join(". ");
    else out.comm_strategies = sec[9];
  }
  if (sec[10]) out.mobility = sec[10];
  if (sec[11]) out.personal_care = sec[11];
  if (sec[12]) out.task_engagement = sec[12];
  if (sec[13]) out.transitions = sec[13];
  if (sec[14]) out.risk_awareness = sec[14];
  if (sec[15]) out.anything_else = sec[15];
  if (sec[2]) {
    const med = splitMedicalBlob(sec[2]);
    if (med.conditions) out.medical_conditions = med.conditions;
    if (med.medication) out.medication = med.medication;
    if (med.allergies) out.allergies = med.allergies;
  }
  return out;
}

export function ageLabelFromDobIso(dobIso: string | null | undefined): string | null {
  const s = clean(dobIso, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const p = s.split("-").map(Number);
  const dob = new Date(p[0], p[1] - 1, p[2]);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  if (age < 0) return null;
  return `${age} years`;
}
