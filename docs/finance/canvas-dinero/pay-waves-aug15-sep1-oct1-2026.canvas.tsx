import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

type PayRow = {
  inv: string;
  amt: number;
  pax: string;
  parent: string;
  note: string;
  paid: boolean;
  via?: string;
  paidAt?: string;
};

const BANK_15_AUG: PayRow[] = [
  { inv: "INV-P-0131", amt: 490, pax: "Ayaan Imam", parent: "Nadia Imam", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0139", amt: 1400, pax: "Ayman El Bakry", parent: "Zeyna Bakry", note: "Autumn term · full payment", paid: false },
  { inv: "INV-P-0148", amt: 350, pax: "Eddie Mckenzie Iglesias", parent: "Marta Iglesias", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0132", amt: 325, pax: "Emani", parent: "Sam sam Abdi", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0014", amt: 780, pax: "Erik Ndregjoni", parent: "Agata Ndregjoni", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0060", amt: 1560, pax: "Gabriel Chapplow", parent: "Mike Chapplow", note: "Autumn term", paid: false },
  { inv: "INV-P-0083", amt: 633.75, pax: "Kacem Eiji BELHADJ", parent: "Léa Igabille", note: "1st half balance (paid £633.75 of £1267.50 · 31 Jul) — needs £633.75 + I've paid", paid: false },
  { inv: "INV-P-0115", amt: 1560, pax: "Jack Stratton", parent: "Veronica Grace", note: "One-off payment", paid: false },
  { inv: "INV-P-0342", amt: 1560, pax: "Jack Walker", parent: "Francesca E Walker", note: "One-off payment", paid: false },
  { inv: "INV-P-0106", amt: 350, pax: "Junaid Fussaini", parent: "Fadwa Guechchati", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0134", amt: 1900, pax: "Kareena Al hassani", parent: "Chopi Al hassani", note: "Full academic year · one payment", paid: false },
  { inv: "INV-P-0135", amt: 1900, pax: "Karo", parent: "Chopi Al hassani", note: "Full academic year · one payment", paid: false },
  { inv: "INV-P-0093", amt: 700, pax: "Kayden Annang-Eshun", parent: "Selina Eshun", note: "Autumn term · full payment", paid: false },
  { inv: "INV-P-0072", amt: 350, pax: "Khalid Abdulla", parent: "Fozia Ibrahim", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0121", amt: 350, pax: "Linda Kaheh", parent: "Catherine Rastgoow", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0122", amt: 350, pax: "Logan Hibbitts", parent: "Shane Hibbitts", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0133", amt: 350, pax: "Maiyar Alolabi", parent: "Nizar Alolabi", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0105", amt: 650, pax: "Mario Cristobal Laurrieta", parent: "Alexandra Laurrieta Saiz", note: "Autumn term · full payment", paid: false },
  { inv: "INV-P-0138", amt: 700, pax: "Mia Mesi", parent: "Kelidon Mesi", note: "Autumn term · full payment", paid: false },
  { inv: "INV-P-0341", amt: 780, pax: "Rayyan Fida", parent: "Huma Qureshi", note: "Autumn term · 1st half (flexi)", paid: false },
  { inv: "INV-P-0109", amt: 350, pax: "Ruben Devgun", parent: "Jasmine Devgun", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0114", amt: 325, pax: "Shire Osman", parent: "Hanan Mahdi Mussa", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0098", amt: 780, pax: "Stephanie Ng", parent: "Zu Yi Wen", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0130", amt: 1900, pax: "Thomas (Tom) Eriksson", parent: "Kirstin Eriksson", note: "Full academic year · one payment", paid: false },
  { inv: "INV-P-0116", amt: 700, pax: "VITHURA Pakeerathan", parent: "Yalini Pakeerathan", note: "Autumn term · full payment", paid: false },
  { inv: "INV-P-0097", amt: 350, pax: "Yamik Limbu", parent: "Bhawana Limbu", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0145", amt: 350, pax: "Yunis Hussein", parent: "Namja Hussein", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0111", amt: 1592.5, pax: "Yusuf Ahmed", parent: "Fatimah Ahmed", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0094", amt: 1267.5, pax: "Zaid Alfadhl", parent: "Zaynab Alfadhl", note: "1st half — Tide £1150.40 (30 Jul) NOT validated; needs £117.10 + I've paid", paid: false },
  { inv: "INV-P-0099", amt: 350, pax: "Zayana Zareenah Waheed", parent: "Mansura Akter", note: "Autumn term · 1st half", paid: false },
  { inv: "INV-P-0104", amt: 1560, pax: "Adam Abed", parent: "Zainab Alkamali", note: "Autumn term · full payment", paid: true, via: "admin", paidAt: "2026-07-22" },
  { inv: "INV-P-0102", amt: 700, pax: "Amber Stephens", parent: "Nicole Stephens", note: "Autumn term · full payment", paid: true, via: "admin", paidAt: "2026-07-28" },
  { inv: "INV-P-0123", amt: 1400, pax: "Aqsa Farooq", parent: "Farida Farooq", note: "Autumn term · full payment", paid: true, via: "admin", paidAt: "2026-07-23" },
  { inv: "INV-P-0067", amt: 700, pax: "Gemma Mesaria-Gonzalez", parent: "Maria Gonzalez", note: "Autumn term", paid: true, via: "admin", paidAt: "2026-08-09" },
  { inv: "INV-P-0110", amt: 3325, pax: "Serine Hodroje", parent: "Bouchra Taoufiki", note: "Autumn term · full payment", paid: true, via: "admin", paidAt: "2026-07-20" },
  { inv: "INV-P-0126", amt: 325, pax: "Shaan Boora", parent: "Meena Boora", note: "Autumn term · 1st half", paid: true, via: "admin", paidAt: "2026-07-30" },
  { inv: "INV-P-0074", amt: 1625, pax: "Zakariya Warsame", parent: "Catarina da Silva", note: "Payment 1 · Autumn term", paid: true, via: "stripe", paidAt: "2026-07-17" },
  { inv: "INV-P-0079", amt: 1267.5, pax: "Hazem Kei BELHADJ", parent: "Léa Igabille", note: "Autumn term · 1st half", paid: true, via: "admin", paidAt: "2026-07-31" },
];

const GC_1_SEP: PayRow[] = [
  { inv: "INV-P-0050", amt: 391.5, pax: "Arthur Manners", parent: "Francesca Manners", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0090", amt: 391.5, pax: "Arthur Morrissey", parent: "Michael Morrissey", note: "Payment · September 2026", paid: false },
  { inv: "INV-P-0042", amt: 176.5, pax: "Bediako Mensah", parent: "Romina Banjo", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0046", amt: 176.5, pax: "Cayra Mensah", parent: "Romina Banjo", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0018", amt: 1307.75, pax: "Cyrus Mahdavi", parent: "Olivia Mahdavi", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0068", amt: 164, pax: "Max Kacharava", parent: "Nana Kacharava", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0117", amt: 176.5, pax: "Rayan Thapa", parent: "Rakesh Thapa", note: "Payment · September 2026", paid: false },
  { inv: "INV-P-0063", amt: 176.5, pax: "Richard Gonçalves Fonseca", parent: "LETICIA GONCALVES FERREIRA", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0075", amt: 407.75, pax: "Rodin Esmati", parent: "Sima Amirizadeh", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0028", amt: 176.5, pax: "Tyson Gardiner", parent: "Margaretta Allotey", note: "Payment 1 · September 2026 (Autumn)", paid: false },
  { inv: "INV-P-0149", amt: 164, pax: "Yoan Bekele", parent: "Hanna Belete", note: "Payment · September 2026", paid: false },
  { inv: "INV-P-0038", amt: 176.5, pax: "Yuri Carvalho", parent: "Nazaré Carvalho", note: "Payment 1 · September 2026 (Autumn)", paid: false },
];

/** Oct 1 la_funded — NHS amounts include +2.03% uplift from Sep. */
const LA_1_OCT: PayRow[] = [
  { inv: "INV-P-0194", amt: 345.45, pax: "Aboodi Patel", parent: "Maya Ali", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0334", amt: 532.72, pax: "Adaam Ah", parent: "Leila Ahmed", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0250", amt: 1036.36, pax: "Adam Pilcher", parent: "Juliette Fenton", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0333", amt: 532.72, pax: "Amaar Ahmed", parent: "Leila Ahmed", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0330", amt: 690.9, pax: "Amar-Rai Singh", parent: "Kiren Kaur", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0331", amt: 532.72, pax: "Aydaan Ahmed", parent: "Leila Ahmed", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0225", amt: 172.73, pax: "Elijah Yared", parent: "amy gebru", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0261", amt: 6029.04, pax: "Emanuel Dodson", parent: "Almaz Woldu", note: "October 2026 · funder invoice (NHS +2.03%)", paid: false },
  { inv: "INV-P-0236", amt: 13092.77, pax: "Fadi Abu daud", parent: "Noura Zorkota", note: "October 2026 · funder invoice (NHS +2.03%)", paid: false },
  { inv: "INV-P-0287", amt: 150, pax: "Faris Lobinet", parent: "Hyam Nessour", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0272", amt: 12104.47, pax: "Ikram Omar", parent: "Farhia Mahamed", note: "October 2026 · funder invoice (NHS +2.03%)", paid: false },
  { inv: "INV-P-0302", amt: 150, pax: "Saaib Abdullah", parent: "Ahmed Begum", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0329", amt: 360, pax: "Samer Bakhiet", parent: "Bakhiet Osman", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0316", amt: 150, pax: "Simon Yohannes", parent: "Sara Girmaye", note: "October 2026 · funder invoice", paid: false },
  { inv: "INV-P-0328", amt: 172.72, pax: "Steven Cesare", parent: "Asamahan Alalawi", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0169", amt: 2791.91, pax: "Timi Dairo", parent: "Afolake Olabisi Dairo", note: "October 2026 · funder invoice (NHS +2.03%)", paid: false },
  { inv: "INV-P-0180", amt: 660.88, pax: "Tinashe Nekati", parent: "Pat Nekati", note: "October 2026 · funder invoice (NHS +2.03%)", paid: false },
  { inv: "INV-P-0332", amt: 1295.45, pax: "Tinashe Nekati", parent: "Pat Nekati", note: "September 2026 (paid in October)", paid: false },
  { inv: "INV-P-0208", amt: 172.73, pax: "Yassir Boujettif", parent: "Nadia Boujettif", note: "October 2026 · funder invoice", paid: false },
];

function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sum(rows: PayRow[], pred?: (r: PayRow) => boolean): number {
  return Math.round(rows.filter(pred || (() => true)).reduce((s, r) => s + r.amt, 0) * 100) / 100;
}

function tableRows(rows: PayRow[]) {
  return rows.map((r) => [
    r.inv,
    r.pax,
    r.parent,
    gbp(r.amt),
    r.paid ? `PAID${r.via ? ` · ${r.via}` : ""}${r.paidAt ? ` · ${r.paidAt}` : ""}` : "UNPAID",
    r.note,
  ]);
}

function rowTone(rows: PayRow[]) {
  return rows.map((r) => (r.paid ? ("success" as const) : ("neutral" as const)));
}

function WaveSection(props: {
  title: string;
  subtitle: string;
  rows: PayRow[];
  pillTone: "info" | "success" | "warning";
}) {
  const unpaid = props.rows.filter((r) => !r.paid);
  const paid = props.rows.filter((r) => r.paid);
  return (
    <Stack gap={10}>
      <Row gap={10} style={{ alignItems: "center", flexWrap: "wrap" }}>
        <H2>{props.title}</H2>
        <Pill tone={props.pillTone}>{props.rows.length} total</Pill>
        <Pill tone="warning">{unpaid.length} unpaid · {gbp(sum(unpaid))}</Pill>
        <Pill tone="success">{paid.length} paid · {gbp(sum(paid))}</Pill>
      </Row>
      <Text tone="secondary" size="small">
        {props.subtitle}
      </Text>
      {paid.length > 0 ? (
        <Callout tone="success">
          Already paid: {paid.map((r) => `${r.pax} (${r.inv} ${gbp(r.amt)})`).join(" · ")}
        </Callout>
      ) : (
        <Callout tone="neutral">Nobody paid yet on this wave.</Callout>
      )}
      <Table
        headers={["Invoice", "Participant", "Parent", "Amount", "Status", "Instalment"]}
        columnAlign={["left", "left", "left", "right", "left", "left"]}
        rows={tableRows(props.rows)}
        rowTone={rowTone(props.rows)}
      />
    </Stack>
  );
}

export default function PayWavesAugSepOct2026() {
  const bankUnpaid = sum(BANK_15_AUG, (r) => !r.paid);
  const bankPaid = sum(BANK_15_AUG, (r) => r.paid);
  const gcUnpaid = sum(GC_1_SEP, (r) => !r.paid);
  const laUnpaid = sum(LA_1_OCT, (r) => !r.paid);

  return (
    <Stack gap={20} style={{ padding: 20, maxWidth: 1180 }}>
      <Stack gap={6}>
        <H1>Payment waves · Autumn 2026–27</H1>
        <Text tone="secondary" size="small">
          Source: portal_parent_invoice_share · instalment due dates + paid status · refreshed 10 Aug 2026
        </Text>
      </Stack>

      <Grid columns={3} gap={12}>
        <Stat value={`${BANK_15_AUG.filter((r) => r.paid).length}/${BANK_15_AUG.length}`} label="15 Aug paid / total" tone="info" />
        <Stat value={`${GC_1_SEP.filter((r) => r.paid).length}/${GC_1_SEP.length}`} label="1 Sep GC paid / total" tone="success" />
        <Stat value={`${LA_1_OCT.filter((r) => r.paid).length}/${LA_1_OCT.length}`} label="1 Oct LA/NHS paid / total" tone="warning" />
      </Grid>

      <Grid columns={3} gap={12}>
        <Stat value={gbp(bankUnpaid)} label="Bank still due" />
        <Stat value={gbp(gcUnpaid)} label="GC still due" />
        <Stat value={gbp(laUnpaid)} label="LA/NHS still due" />
      </Grid>

      <Callout tone="info">
        Bank wave includes 7 already marked paid (admin/stripe). GC Sep and LA/NHS Oct: none paid yet. NHS Oct amounts
        include the +2.03% service uplift.
      </Callout>

      <Divider />

      <WaveSection
        title="15 August · Bank transfer"
        subtitle="Flexi / term bank / one-off · due 2026-08-15 · unpaid first, then paid"
        rows={BANK_15_AUG}
        pillTone="info"
      />

      <Divider />

      <WaveSection
        title="1 September · GoCardless"
        subtitle="Direct Payment monthly instalment 1 · due 2026-09-01"
        rows={GC_1_SEP}
        pillTone="success"
      />

      <Divider />

      <WaveSection
        title="1 October · NHS / LA"
        subtitle="Funder invoices · la_funded · due 2026-10-01"
        rows={LA_1_OCT}
        pillTone="warning"
      />

      <Text tone="secondary" size="small">
        Still outstanding across waves: {gbp(bankUnpaid + gcUnpaid + laUnpaid)} · already collected on 15 Aug wave:{" "}
        {gbp(bankPaid)}
      </Text>
    </Stack>
  );
}
