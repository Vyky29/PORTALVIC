/**
 * Import email-interest list (office). Classify vs existing clients and upsert into
 * portal_booking_leads for future outreach. DOES NOT SEND any email/WhatsApp.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-import-email-interest-aug2026.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-import-email-interest-aug2026.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const SOURCE = "Email Interest Aug 2026";
const PRIVACY_VERSION = "email-interest-import-2026-08-11";

/** Raw list from office (comma / newline separated interest emails). */
const RAW = `
aamalalzin@gmail.com, abdifiasa@gmail.com, abdujamah83@gmail.com, abeda.sheikh@yahoo.com, abirfawaz1985@gmail.com, adelinapershqefa1411@yahoo.com, adjei707@sky.com, ahmed.alsamarrai@gmail.com, aiscmj@yahoo.es, aissou72@gmail.com, akboland@hotmail.com, alakirikelif@gmail.com, aline_lamartine@hotmail.com, amal_egal@hotmail.com, amalayokathas@hotmail.com, amandabless262@gmail.com, amandajermain@hotmail.com, amishsigara15@gmail.com, ammoh2013@yahoo.com, anacaroline261@hotmail.co.uk, anamkhalil@hotmail.co.uk, anapaulabernardesferreira@gmail.com, anapbfp@hotmail.com, anarain8@gmail.com, andrealutchman@hotmail.com, andreia_star@hotmail.co.uk, angelakscheng@gmail.com, angiemasek@yahoo.com, anjaliabraham8@hotmail.co.uk, annapaolafrigenti@gmail.com, anoushkamyers@googlemail.com, anu.87@hotmail.com, arranrachel@gmail.com, ashamhuss95@gmail.com, ashiandwale@gmail.com, asili.hassan@gmail.com, awacham@gmail.com, ayan_88@hotmail.com, aymani22@hotmail.com, aynaan.hibo@gmail.com, b.mafizadeh@gmail.com, babakjahanbani@gmail.com, bal-aujla@hotmail.co.uk, barbara-o-campbell@outlook.com, bella1988@live.co.uk, benhamounora@gmail.com, betel.kahsay@yahoo.com, bettermore@hotmail.co.uk, bhattacharyashreya@gmail.com, bilan.sharif@outlook.com, bpurewal@hotmail.co.uk, brunocesare@gmail.com, bwunmi@hotmail.com, caroline.sali@hotmail.com, charalambous.peter@gmail.com, chelseagriffin@hotmail.co.uk, chelseajg@hotmail.co.uk, cherrelledawson@hotmail.co.uk, chicaring.v0v@gmail.com, claire_nsiah@hotmail.co.uk, clairemoore1982@hotmail.co.uk, claudia@chelci.co.uk, claudiarotariu2016@gmail.com, connienaylor1904@icloud.com, d.boucas@lse.ac.uk, damithri87@hotmail.co.uk, dankasedzikowska@gmail.com, dfidouh@gmail.com, dietespiff@gmail.com, dilpa.vekaria@gmail.com, dimple@chhabrias.com, djenabu.b86@gmail.com, e.bedasee@sky.com, edsonfilipa84@gmail.com, edyta.pearce@yahoo.co.uk, eli.march@yahoo.com, elkocakemal@yahoo.co.uk, ellan@btinternet.com, elsaveron86@yahoo.fr, emel77i@yahoo.co.uk, emiliarumenova08@gmail.com, emilyh440@yahoo.co.uk, emma_louise13@icloud.com, emmaguest89@gmail.com, emmatilt@hotmail.com, engyeshak19@yahoo.com, ericaarden@hotmail.com, erika.pardor@gmail.com, fabianadurham07@gmail.com, farah_amaioua@hotmail.co.uk, faryamir@hotmail.co.uk, fatma_murat@hotmail.co.uk, fatoumata.traore4@gmail.com, fatousay@googlemail.com, felisha_f@hotmail.co.uk, fiona@camdenite.com, fiwegbue@gmail.com, flarah@hotmail.co.uk, fpatel2241@gmail.com, franceitaly@hotmail.com, frankiesav@hotmail.co.uk, girmaysara7@gmail.com, giuliamatteo@hotmail.com, glyn0012@yahoo.com, gspatel24@gmail.com, gwalshtaylor@gmail.com, h.ibrahim1411@gmail.com, haaruunqeit@gmail.com, habbonomar@hotmail.com, hafsamallu@hotmail.co.uk, hali901@outlook.com, hana_oosman@hotmail.com, hannastar1@hotmail.co.uk, harjasdeepdhillon@hotmail.co.uk, hasna.bintali@yahoo.co.uk, haturab@gmail.com, hawakeene@hotmail.com, hayleybennett2006@hotmail.co.uk, hayleyls@hotmail.com, hbarasab@icloud.com, heba18@aol.com, hennellyj@hotmail.com, hidayaali355@gmail.com, hilanahi@yahoo.com, hmeligonis@gmail.com, hodgsoncathy870@gmail.com, hodmanalinoor@hotmail.com, hoodohersi1@hotmail.com, hussainmahmood7@icloud.com, ibtisam.hijazi@mail.com, ifrah2000@hotmail.co.uk, inayahx@yahoo.co.uk, info@brittanic-autos.co.uk, ireneboateng100@yahoo.com, isobelhines@hotmail.com, j.st.hillaire@icloud.com, jacqui.shone@gmail.com, jamaela13@hotmail.com, jaralopez1409@gmail.com, jasveen@hotmail.co.uk, je_sangwell@outlook.com, jennyandryan@hotmail.com, jldubuisson@yahoo.com, joannamrees@icloud.com, jug_m@msn.com, julijanelubina@me.com, jusnamiah@yahoo.co.uk, jussarasanbrasil@gmail.com, justsalmabutt@gmail.com, kamusiimemujumbi@gmail.com, karimarayan@gmail.com, karito0518@hotmail.com, karstel2000@hotmail.com, kate@ehghome.co.uk, keisha_1@hotmail.co.uk, kellykelleher20@hotmail.com, kersti.karu123@gmail.com, khanalprakash4g@gmail.com, kimovaivana19@gmail.com, kirengill1@gmail.com, kirstyjmweatherhead@gmail.com, l.b.e.g.u.m@hotmail.co.uk, lamib143@hotmail.co.uk, liam_jones16@aol.com, lidiamoreira12@gmail.com, lina.selim1@hotmail.com, linaessayas@hotmail.co.uk, linziannecampbell@hotmail.co.uk, lip27uddin@hotmail.com, lisamelian@hotmail.co.uk, liziglazebrook@gmail.com, lllllloftus@gmail.com, lolaileyemi@gmail.com, lorrena.nash@hotmail.com, louisegroberts6@gmail.com, lu_nana@hotmail.com, lucyjives93@gmail.com, lynahmed7@gmail.com, m.tangari@hotmail.co.uk, maani23@hotmail.com, machovicova.i@gmail.com, magdala24@gazeta.pl, maimoona_asghar@yahoo.com, maire.ni.reagain@btinternet.com, makelley17@gmail.com, mariajiggins@yahoo.com, mariedoosaah@hotmail.com, marija.ak62@gmail.com, marjaanesfahani@gmail.com, marlies_vandenberg@yahoo.com, marteenawitter@hotmail.co.uk, mazsoc@hotmail.com, mcfarlane.samantha@hotmail.com, mekifle7@gmail.com, melanirajika@yahoo.com, meseret101@hotmail.com, mesfinre2021@yahoo.com, mhakki67@gmail.com, michellejennis@hotmail.co.uk, minishewards@gmail.com, missdjalo15@gmail.com, monkey200693@yahoo.co.uk, ms_gladis@hotmail.com, mumpy.bhattacharyya@gmail.com, munmar22@gmail.com, murphymail@yahoo.com, muslimshinwari@yahoo.co.uk, nadinelubs@googlemail.com, nadisaghafi@hotmail.com, nadishato@gmail.com, nagat1100@yahoo.com, naheedmirza@gmail.com, naijagypsy@gmail.com, nandininethaji@gmail.com, nasronur@hotmail.co.uk, nataliecassiano@hotmail.com, natasha_bingham@hotmail.co.uk, natashalopes@hotmail.co.uk, nazaredanfa@outlook.com, nazlihariri@yahoo.com, nazz84@hotmail.com, nedaelbarodi@gmail.com, nehajoshi97@gmail.com, nene.semedo1991@gmail.com, nenilili@yahoo.com, nico.oliveri@icloud.com, nics1976@hotmail.com, niketa20@gmail.com, nisrine.nizam@gmail.com, noddysahota@hotmail.com, nunnah2021@gmail.com, nuurs@msn.com, nvincent_10@hotmail.com, oluwajuwon_styles@hotmail.co.uk, oneika.s@hotmail.co.uk, ornelamemia@hotmail.com, panova.resana@gmail.com, patel.asif@hotmail.co.uk, pathsn@hotmail.co.uk, paulacraze@gmail.com, paulinesmitho780@gmail.com, perdiarmstrong@hotmail.com, popova.cristina1989@gmail.com, priscilla.mohan@outlook.com, rabab_abedi@hotmail.com, rachelleward96@gmail.com, rae_rae_rae@icloud.com, raga.sooriya@gmail.com, rahmajama2610@gmail.com, ramsk25.msc@gmail.com, rasshmi.b@gmail.com, rav.sran@hotmail.com, raviandshreya@gmail.com, rawda_said@yahoo.co.uk, rayd0312@live.com, raymondemcnair@aol.com, razwana.saghir@hotmail.co.uk, rebeccataylor1972@yahoo.co.uk, reshma.p.patel@hotmail.co.uk, richabhargava16@gmail.com, rinalizaespanola@yanoo.co.uk, robertson.sarah50@gmail.com, romerocosta28@gmail.com, rosieoyewole1@gmail.com, rramanjk@yahoo.com, rs.mohamed@hotmail.com, rs@ludius.com, ruthcb268@gmail.com, s_hussein2@hotmail.co.uk, saad.h.aya@hotmail.com, sabrinajames@yahoo.co.uk, sadiqa_3@hotmail.com, sadiyamahamud@hotmail.com, saeedhamid612010.nq@gmail.com, saffia.express@gmail.com, sairazee2009@hotmail.co.uk, samantha.bass@yahoo.com, samera.qureshi@yahoo.com, samira_a@hotmail.co.uk, samiuk10@yahoo.co.uk, sanaramzan199@gmail.com, sankarignanam@gmail.com, sarahsiyahla@hotmail.co.uk, saridonline@yahoo.com, sarneckaanna@yahoo.com, sashaflanore@hotmail.com, schahroor@aol.com, selahfleary@outlook.com, serpilbali@hotmail.com, shalini0022@gmail.com, shery82_h@yahoo.com, shreaboothe@gmail.com, shukribarkhadle@icloud.com, siloginirajah@hotmail.co.uk, sinead-coleman@hotmail.com, smalls1@hotmail.co.uk, smcneith@gmail.com, snowqueenhibiscus@icloud.com, solojames.london@gmail.com, somyavajpayee7@gmail.com, soumayahaq@yahoo.co.uk, sudheerherts@gmail.com, sulharn@yahoo.com, sungita31@gmail.com, sungita7867@gmail.com, susanfedai941@gmail.com, tafil@hotmail.co.uk, taramooney06@aol.com, taseen.ameerjan@gmail.com, taseen.ameerjan@hotmail.co.uk, tekle1960m@yahoo.com, teri-morgan@hotmail.com, thandiwe_moyo@hotmail.co.uk, tiannasampoh@gmail.com, tiansuifeng@gmail.com, tinab312@gmail.com, tonyfdes18@gmail.com, toyinmakindebeauty@yahoo.co.uk, tpchoudhury@hotmail.com, trueman482@gmail.com, ubah_1989@hotmail.com, ubongbassey1806@gmail.com, valerygeminis@hotmail.com, veena.sivasankar@gmail.com, vicjei2917@gmail.com, virendersingh7791@yahoo.co.uk, yabi3116@gmail.com, yelizaltun8@hotmail.com, yettyjoe04@yahoo.com, yinkaoke@hotmail.com, yolandagoncalves07@gmail.com, yosoytransparente@hotmail.com, yvettedokyi@hotmail.co.uk, z_taki@hotmail.co.uk, zaid899@yahoo.com, zak_orn31@hotmail.co.uk, zakeera_akhtar@hotmail.com, abiegrace121@icloud.com, durgasiri2012@gmail.com, aslinur17@hotmail.com, jademoore2194@gmail.com, paulinavillacis@hotmail.com, aneela.omar@gmail.com, d.zuzia@yahoo.co.uk, nina1vadher@gmail.com, tiamnadi@gmail.com, jude.tomlinson@googlemail.com, sarahfaizan145@gmail.com, hyltonrebecca@yahoo.co.uk
`;

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");

function emailNorm(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function parentNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Interest";
  return local
    .replace(/[._+-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Email interest";
}

const emails = [
  ...new Set(
    RAW.split(/[\s,;]+/)
      .map((x) => emailNorm(x))
      .filter((x) => x && isValidEmail(x)),
  ),
];

console.log(APPLY ? "APPLY mode" : "DRY RUN (set APPLY=1 to write)");
console.log("Unique valid emails:", emails.length);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

type ContactHit = {
  email: string;
  email_norm: string | null;
  parent_display: string | null;
  child_display: string | null;
  in_class: boolean | null;
  on_waiting_list: boolean | null;
  contact_id: string | number | null;
};

type LeadHit = {
  id: string;
  email: string;
  parent_name: string | null;
  client_status: string | null;
  booking_status: string | null;
  source: string | null;
  marketing_consent: boolean | null;
};

async function fetchAllContacts(): Promise<Map<string, ContactHit[]>> {
  const map = new Map<string, ContactHit[]>();
  const { data, error } = await admin
    .from("portal_parent_contacts")
    .select(
      "email, email_norm, parent_display, child_display, in_class, on_waiting_list, contact_id",
    )
    .not("email", "is", null)
    .limit(10000);
  if (error) throw error;
  for (const row of data || []) {
    const key = emailNorm(String(row.email_norm || row.email || ""));
    if (!key) continue;
    const list = map.get(key) || [];
    list.push(row as ContactHit);
    map.set(key, list);
  }
  return map;
}

async function fetchAllDocEmails(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const { data, error } = await admin
    .from("portal_participant_documents")
    .select("parent_email, participant_name, status")
    .not("parent_email", "is", null)
    .limit(10000);
  if (error) {
    console.warn("documents lookup warn", error.message);
    return map;
  }
  for (const row of data || []) {
    const key = emailNorm(String(row.parent_email || ""));
    if (!key) continue;
    const list = map.get(key) || [];
    const pax = String(row.participant_name || "").trim();
    if (pax) list.push(pax);
    map.set(key, list);
  }
  return map;
}

async function fetchLeadsByEmails(norms: string[]): Promise<Map<string, LeadHit>> {
  const map = new Map<string, LeadHit>();
  const chunk = 80;
  for (let i = 0; i < norms.length; i += chunk) {
    const slice = norms.slice(i, i + chunk);
    const { data, error } = await admin
      .from("portal_booking_leads")
      .select(
        "id, email, parent_name, client_status, booking_status, source, marketing_consent",
      )
      .in("email_norm", slice);
    if (error) throw error;
    for (const row of data || []) {
      const key = emailNorm(String(row.email || ""));
      if (key) map.set(key, row as LeadHit);
    }
  }
  return map;
}

function loadWaitlistEmails(): Map<string, { parent: string; pax: string }> {
  const map = new Map<string, { parent: string; pax: string }>();
  const path = "working_ui/portal/waiting_list_portal_data.js";
  if (!existsSync(path)) return map;
  const raw = readFileSync(path, "utf8");
  // rows include cont: "phone · email" and parentLine / pax
  try {
    const jsonStart = raw.indexOf("{");
    const json = JSON.parse(raw.slice(jsonStart).replace(/;?\s*$/, ""));
    for (const row of json.rows || []) {
      const cont = String(row.cont || "");
      const m = cont.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (!m) continue;
      map.set(emailNorm(m[0]), {
        parent: String(row.parentLine || "").trim(),
        pax: String(row.pax || "").trim(),
      });
    }
  } catch (e) {
    console.warn("waitlist parse warn", e);
  }
  return map;
}

const contactsByEmail = await fetchAllContacts();
const leadsByEmail = await fetchLeadsByEmails(emails);
const docsByEmail = await fetchAllDocEmails();
const waitlistByEmail = loadWaitlistEmails();

console.log(
  "Portal contact emails loaded:",
  contactsByEmail.size,
  "· docs:",
  docsByEmail.size,
  "· waitlist:",
  waitlistByEmail.size,
);

type RowOut = {
  email: string;
  classification: "active_client" | "former_or_listed_client" | "waiting_list" | "never_client";
  in_class: boolean;
  on_waiting_list: boolean;
  children: string[];
  parent_display: string | null;
  had_registration_doc: boolean;
  on_static_waitlist: boolean;
  existing_lead: boolean;
  existing_lead_status: string | null;
  existing_lead_source: string | null;
  action: "insert" | "update" | "skip_dry" | "unchanged";
};

const report: RowOut[] = [];
let nActive = 0;
let nFormer = 0;
let nWait = 0;
let nNever = 0;
let nInsert = 0;
let nUpdate = 0;

const now = new Date().toISOString();

for (const email of emails) {
  const hits = contactsByEmail.get(email) || [];
  const docPax = docsByEmail.get(email) || [];
  const wl = waitlistByEmail.get(email) || null;
  const inClass = hits.some((h) => h.in_class === true);
  const onWait = hits.some((h) => h.on_waiting_list === true) || !!wl;
  const children = [
    ...new Set(
      [
        ...hits.map((h) => String(h.child_display || "").trim()),
        ...docPax,
        wl?.pax || "",
      ].filter(Boolean),
    ),
  ];
  const parentDisplay =
    hits.map((h) => String(h.parent_display || "").trim()).find(Boolean) ||
    wl?.parent ||
    null;
  const hadDoc = docPax.length > 0 || docsByEmail.has(email);
  const existingLead = leadsByEmail.get(email) || null;

  let classification: RowOut["classification"] = "never_client";
  if (inClass) {
    classification = "active_client";
    nActive++;
  } else if (wl || onWait) {
    classification = "waiting_list";
    nWait++;
  } else if (hits.length || hadDoc) {
    classification = "former_or_listed_client";
    nFormer++;
  } else {
    nNever++;
  }

  const clientStatus =
    classification === "active_client"
      ? "active_client"
      : classification === "waiting_list"
        ? "waiting_list"
        : classification === "former_or_listed_client"
          ? "registered"
          : "prospective";

  const parentName =
    parentDisplay ||
    (existingLead && existingLead.parent_name) ||
    parentNameFromEmail(email);

  let action: RowOut["action"] = "skip_dry";

  if (APPLY) {
    if (existingLead) {
      const prevSource = String(existingLead.source || "").trim();
      const nextSource = prevSource.includes(SOURCE)
        ? prevSource
        : prevSource
          ? `${prevSource} · ${SOURCE}`
          : SOURCE;
      const keepStatus =
        existingLead.client_status === "active_client" ||
          existingLead.client_status === "registered" ||
          existingLead.client_status === "waiting_list"
          ? existingLead.client_status
          : clientStatus;
      const { error } = await admin
        .from("portal_booking_leads")
        .update({
          marketing_consent: true,
          client_status: keepStatus,
          source: nextSource.slice(0, 200),
          last_activity_at: now,
          updated_at: now,
        })
        .eq("id", existingLead.id);
      if (error) {
        console.error("update fail", email, error.message);
        action = "unchanged";
      } else {
        action = "update";
        nUpdate++;
      }
    } else {
      const { error } = await admin.from("portal_booking_leads").insert({
        parent_name: parentName.slice(0, 120),
        email,
        mobile: "", // required; unknown for cold interest list
        marketing_consent: true,
        privacy_notice_version: PRIVACY_VERSION,
        privacy_accepted_at: now,
        source: SOURCE,
        first_page_visited: SOURCE,
        services_viewed: [],
        last_activity_at: now,
        booking_status: classification === "waiting_list" ? "waiting_list" : "no_booking",
        registration_status: "not_started",
        client_status: clientStatus,
        updated_at: now,
      });
      if (error) {
        console.error("insert fail", email, error.message);
        action = "unchanged";
      } else {
        action = "insert";
        nInsert++;
      }
    }
  }

  report.push({
    email,
    classification,
    in_class: inClass,
    on_waiting_list: onWait,
    children,
    parent_display: parentDisplay,
    had_registration_doc: hadDoc,
    on_static_waitlist: !!wl,
    existing_lead: !!existingLead,
    existing_lead_status: existingLead?.client_status || null,
    existing_lead_source: existingLead?.source || null,
    action,
  });
}

const outDir = "database/local-vault/tmp";
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/email-interest-aug2026-report.json`;
const summary = {
  applied: APPLY,
  source: SOURCE,
  total: emails.length,
  active_client: nActive,
  waiting_list: nWait,
  former_or_listed_client: nFormer,
  never_client: nNever,
  inserted: nInsert,
  updated: nUpdate,
  portal_note:
    "portal_parent_contacts only has ~90 emails filled; most ClassForKids rows have no email in Portal. Classification is best-effort vs Portal contacts + waitlist + registration docs. No messages sent.",
  note: "No emails or WhatsApps were sent. List stored as portal_booking_leads with source tag for future outreach.",
  active_client_emails: report.filter((r) => r.classification === "active_client").map((r) => r.email),
  waiting_list_emails: report.filter((r) => r.classification === "waiting_list").map((r) => r.email),
  former_or_listed_emails: report
    .filter((r) => r.classification === "former_or_listed_client")
    .map((r) => r.email),
  never_client_emails: report.filter((r) => r.classification === "never_client").map((r) => r.email),
  rows: report,
};
writeFileSync(outPath, JSON.stringify(summary, null, 2));

const csvPath = `${outDir}/email-interest-aug2026.csv`;
const csvLines = [
  "email,classification,in_class,on_waiting_list,parent_display,children",
  ...report.map((r) =>
    [
      r.email,
      r.classification,
      r.in_class ? "1" : "0",
      r.on_waiting_list ? "1" : "0",
      JSON.stringify(r.parent_display || ""),
      JSON.stringify(r.children.join("; ")),
    ].join(","),
  ),
];
writeFileSync(csvPath, csvLines.join("\n"));

console.log("\nSummary");
console.log("  total              ", emails.length);
console.log("  active clients     ", nActive);
console.log("  waiting list       ", nWait);
console.log("  former / listed    ", nFormer);
console.log("  never clients      ", nNever);
if (APPLY) {
  console.log("  inserted leads     ", nInsert);
  console.log("  updated leads      ", nUpdate);
}
console.log("  report             ", outPath);
console.log("  csv                ", csvPath);
if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to upsert into portal_booking_leads (no send).");
}
