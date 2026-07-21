import {
  expandParticipantClientSlugs,
  resolveParticipantClientSlugs,
} from "../../../supabase/functions/_shared/participant_identity.ts";
for (const p of [
  { contactId: "39", displayName: "Kacem Eiji BELHADJ", firstName: "Kacem Eiji", lastName: "BELHADJ" },
  { contactId: "40", displayName: "Hazem Kei BELHADJ", firstName: "Hazem Kei", lastName: "BELHADJ" },
]) {
  const slugs = expandParticipantClientSlugs(resolveParticipantClientSlugs(p));
  console.log(p.displayName, "→", slugs.join(", "));
}
