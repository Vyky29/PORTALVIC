import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
} from "cursor/canvas";

/**
 * Roberto Reali · cobrado Tide + contrato fijo £26k + extras / horas
 * Victor 29 jul: Sep £19k/24h → Ene £26k/32h · Agosto SI (mes 12)
 * PRIOR CALC: b46559df · Mar £144 + Abr £36 + Jun £408 = £588
 * MODELO CORRECTO: contrato termina 17 jul; fijo Jul+Ago sigue;
 * horas desde el 17 = EXTRA @ £16 (NO catch-up del paquete 32h)
 * MADRE 17-31 = 37.0h → £592
 */

const gbp = (n: number) =>
  "£" +
  n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const TIDE_PAYMENTS: Array<{
  date: string;
  gbp: number;
  ref: string;
  kind: string;
}> = [
  { date: "2025-09-26", gbp: 432.0, ref: "September", kind: "Nomina" },
  { date: "2025-10-01", gbp: 333.24, ref: "September", kind: "Nomina" },
  { date: "2025-10-30", gbp: 1488.66, ref: "October", kind: "Nomina" },
  { date: "2025-11-29", gbp: 1457.18, ref: "November", kind: "Nomina" },
  { date: "2025-12-24", gbp: 1356.38, ref: "December", kind: "Nomina" },
  { date: "2026-01-30", gbp: 1643.78, ref: "January", kind: "Nomina" },
  { date: "2026-02-27", gbp: 1672.58, ref: "February", kind: "Nomina" },
  { date: "2026-03-31", gbp: 1777.9, ref: "March", kind: "Nomina" },
  { date: "2026-04-30", gbp: 1721.74, ref: "April", kind: "Nomina" },
  { date: "2026-05-05", gbp: 209.6, ref: "April (ajuste)", kind: "Nomina" },
  { date: "2026-06-01", gbp: 1853.58, ref: "May", kind: "Nomina" },
  { date: "2026-06-30", gbp: 2147.14, ref: "June", kind: "Nomina" },
  { date: "2026-07-07", gbp: 22.25, ref: "Expenses June", kind: "Gastos" },
];

const tideTotal = TIDE_PAYMENTS.reduce((s, r) => s + r.gbp, 0);
const CONTRACT_MO = 2166.67;
const CONTRACT_H_WEEK = 30.5;
const EXTRA_RATE = 16;

const PAID_EXTRAS = [
  { m: "Sep 2025", gbp: 540, src: "payslip bruto (base parcial)" },
  { m: "Oct 2025", gbp: 368, src: "payslip bruto (base ~£1,583)" },
  { m: "Nov 2025", gbp: 324, src: "payslip bruto" },
  { m: "Dec 2025", gbp: 184, src: "payslip bruto" },
  { m: "Feb 2026", gbp: 40, src: "payslip +£40 Tinashe (OK)" },
  { m: "Mar 2026", gbp: 186, src: "payslip +£186 (fotos TS)" },
  { m: "Apr 2026", gbp: 108, src: "payslip +£108 (fotos TS)" },
  { m: "May 2026", gbp: 0, src: "payslip = solo fijo" },
  { m: "Jun 2026", gbp: 408, src: "payslip bruto £2,574.67" },
  { m: "Jul 2026", gbp: 0, src: "payslip aun no" },
];
const paidExtrasTot = PAID_EXTRAS.reduce((s, r) => s + r.gbp, 0);

const OVERCLAIM = [
  { m: "Ene", cobrado: 2166.67, debia: 2166.67, diff: 0, note: "Solo salario" },
  { m: "Feb", cobrado: 2206.67, debia: 2206.67, diff: 0, note: "OK Tinashe £40" },
  { m: "Mar", cobrado: 2352.67, debia: 2208.67, diff: 144, note: "Sabados no" },
  { m: "Abr", cobrado: 2274.67, debia: 2238.67, diff: 36, note: "Vie 24 no" },
  { m: "May", cobrado: 2166.67, debia: 2166.67, diff: 0, note: "Solo salario" },
  { m: "Jun", cobrado: 2574.67, debia: 2166.67, diff: 408, note: "0 extras" },
];
const overclaimTot = OVERCLAIM.reduce((s, r) => s + r.diff, 0);

const CONTRACT_HOURS = [
  { block: "Manana L-V", detail: "Lun 3.5 · mar-vie 2.5", h: 13.5 },
  { block: "Tarde L-V", detail: "Lun/mie 2 · mar/jue 2.5 · vie 2", h: 11.0 },
  { block: "Domingo", detail: "6 h (desde jun 6.5)", h: 6.0 },
];

const MADRE_WEEKS = [
  { week: "2026-06-01", total: 30.5, wd: 24.5, sun: 6.0 },
  { week: "2026-06-08", total: 30.0, wd: 24.0, sun: 6.0 },
  { week: "2026-06-15", total: 30.5, wd: 24.5, sun: 6.0 },
  { week: "2026-06-22", total: 31.0, wd: 24.5, sun: 6.5 },
  { week: "2026-06-29", total: 33.0, wd: 26.5, sun: 6.5 },
  { week: "2026-07-06", total: 31.5, wd: 25.0, sun: 6.5 },
  { week: "2026-07-13", total: 23.5, wd: 23.5, sun: 0.0 },
  { week: "2026-07-20", total: 13.5, wd: 13.5, sun: 0.0 },
  { week: "2026-07-27", total: 19.0, wd: 19.0, sun: 0.0 },
];

/** Victor: extras desde el 17 jul (no catch-up). Roster vivo 29 jul. */
const JUL_17_H = 4.5;
const JUL_18_31_H = 32.5;
const JUL_17_31_H = JUL_17_H + JUL_18_31_H;
const JUL_EXTRAS_GBP = JUL_17_31_H * EXTRA_RATE;
const JUL_AGO_FIXED = CONTRACT_MO * 2;
const DUE_BEFORE_OFFSET = JUL_AGO_FIXED + JUL_EXTRAS_GBP;
const DUE_AFTER_OFFSET = DUE_BEFORE_OFFSET - overclaimTot;

const madreAvgTot =
  MADRE_WEEKS.reduce((s, w) => s + w.total, 0) / MADRE_WEEKS.length;
const madreAvgWd =
  MADRE_WEEKS.reduce((s, w) => s + w.wd, 0) / MADRE_WEEKS.length;
const madreExcessTot = MADRE_WEEKS.reduce(
  (s, w) => s + Math.max(0, w.total - CONTRACT_H_WEEK),
  0,
);

export default function RobertoCobradoSep25Jul26() {
  return (
    <Stack gap={20}>
      <H1>Roberto Reali · cobrado, horas extras y contrato</H1>
      <Text tone="secondary">
        Sep 2025 - Jul 2026 · contrato £26k desde ene (no Scala) · fin contrato
        17 jul · extras desde el 17 @ £16
      </Text>
      <Row gap={8} wrap>
        <Pill tone="info">Contrato fijo £26k</Pill>
        <Pill tone="neutral">No Scala / Scale</Pill>
        <Pill tone="info">Fin contrato 17 jul</Pill>
        <Pill tone="warning">Overclaim £588</Pill>
        <Pill tone="info">Extras 17-31 = £592</Pill>
      </Row>

      <Grid columns={4} gap={16}>
        <Stat value={gbp(tideTotal)} label="Tide pagado (Sep-Jul)" />
        <Stat value={gbp(CONTRACT_MO)} label="Fijo / mes (£26k)" tone="info" />
        <Stat
          value={gbp(JUL_EXTRAS_GBP)}
          label={"Extras 17-31 (" + JUL_17_31_H + "h × £16)"}
          tone="info"
        />
        <Stat
          value={gbp(DUE_BEFORE_OFFSET)}
          label="Jul+Ago+extras (antes offset)"
          tone="warning"
        />
      </Grid>

      <Callout tone="info" title="Modelo Victor 29 jul (CORRECTO)">
        Contrato terminaba el 17 jul, pero el fijo anualizado sigue: julio =
        mes 11 y agosto = mes 12 (£2,166.67 cada uno). Paquete ~32h/sem solo
        hasta el contrato. Desde el 17 jul las horas son EXTRA a £16 — no
        recuperacion del paquete. Overclaim £588 se decide aparte (no se
        absorbe con catch-up 18-31).
      </Callout>

      <Callout tone="warning" title="Calculo YA HECHO 24-25 jul — no reinventar">
        Chat b46559df. Payslips Victor + fotos timesheet. Pregunta: &quot;si le
        pagamos julio como enero, cuanto nos deberia?&quot; →{" "}
        {gbp(overclaimTot)} (Mar £144 + Abr £36 + Jun £408).
      </Callout>

      <H2>0. Horas del contrato £26k (hasta el 17 jul)</H2>
      <Table
        headers={["Bloque", "Detalle", "h / sem"]}
        columnAlign={["left", "left", "right"]}
        rows={[
          ...CONTRACT_HOURS.map((r) => [r.block, r.detail, r.h.toFixed(1)]),
          ["Total", "Acuerdo ~32 h/sem", "~30.5-32"],
        ]}
      />

      <H2>1. Cobrado vs deberia (calc 24-25 jul)</H2>
      <Table
        headers={["Mes", "Cobrado", "Deberia", "De mas", "Nota"]}
        columnAlign={["left", "right", "right", "right", "left"]}
        rows={OVERCLAIM.map((r) => [
          r.m,
          gbp(r.cobrado),
          gbp(r.debia),
          r.diff ? gbp(r.diff) : "OK",
          r.note,
        ])}
        rowTone={OVERCLAIM.map((r) =>
          r.diff > 0 ? ("warning" as const) : ("info" as const),
        )}
      />
      <Text weight="semibold">
        Total de mas: {gbp(overclaimTot)} · ~£480 = cifra redonda Victor
      </Text>

      <H2>1b. Extras mezclados en bruto payslip</H2>
      <Table
        headers={["Mes", "Plus £", "Fuente"]}
        columnAlign={["left", "right", "left"]}
        rows={PAID_EXTRAS.map((r) => [
          r.m,
          r.gbp ? gbp(r.gbp) : "-",
          r.src,
        ])}
        rowTone={PAID_EXTRAS.map((r) =>
          r.gbp > 0 ? ("warning" as const) : ("neutral" as const),
        )}
      />
      <Text weight="semibold">
        Suma plus en bruto Sep-Jun: {gbp(paidExtrasTot)} (incluye hist. Sep-Dic)
      </Text>

      <H2>2. Rota MADRE vs acuerdo (~30.5 h/sem)</H2>
      <Text tone="secondary" size="small">
        Fuente: roster_term_master.json · domingo = pay window 6h / 6.5h ·
        semana 27 jul = 19.0h (jue 30 vacio)
      </Text>
      <Grid columns={3} gap={12}>
        <Stat value={madreAvgTot.toFixed(1) + "h"} label="Media total / sem" />
        <Stat value={madreAvgWd.toFixed(1) + "h"} label="Media entre semana" />
        <Stat
          value={madreExcessTot.toFixed(0) + "h"}
          label={"Suma (total-" + CONTRACT_H_WEEK + ") si >acuerdo"}
        />
      </Grid>
      <Table
        headers={[
          "Semana (lun)",
          "Total h",
          "Entre semana",
          "Domingo",
          "vs " + CONTRACT_H_WEEK + "h",
        ]}
        columnAlign={["left", "right", "right", "right", "right"]}
        rows={MADRE_WEEKS.map((w) => {
          const d = w.total - CONTRACT_H_WEEK;
          return [
            w.week,
            w.total.toFixed(1),
            w.wd.toFixed(1),
            w.sun.toFixed(1),
            (d >= 0 ? "+" : "") + d.toFixed(1),
          ];
        })}
        rowTone={MADRE_WEEKS.map((w) =>
          w.total > CONTRACT_H_WEEK + 1
            ? ("warning" as const)
            : w.total < CONTRACT_H_WEEK - 5
              ? ("neutral" as const)
              : ("info" as const),
        )}
      />

      <H2>3. £588 = sobrerreclamo (no le debemos)</H2>
      <Callout tone="warning" title="Overclaim, no pago a Roberto">
        £588 = Mar £144 + Abr £36 + Jun £408. Horas de recuperacion del
        paquete cobradas como EXTRA. Se puede descontar del pendiente Jul/Ago/
        extras — decision aparte, no automatica.
      </Callout>

      <H2>4. Fin contrato 17 jul + extras (NO catch-up)</H2>
      <Callout tone="neutral" title="Abril shortfall — contexto">
        Pot manana DC Abr £632 vs May/Jun £1,000 (= £368 / ~23h @ £16). Explica
        recuperacion durante el contrato; no baja solo el £588.
      </Callout>
      <Callout tone="neutral" title="Mayo Q6 (claim Roberto)">
        Miercoles 11-12 Q6 × 6 dias (~6h). Payslip mayo = £0 extras. Si era
        recuperacion → mayo OK. Si por encima y no pagado → credito ~£96 (@16)
        contra offset (decision Victor).
      </Callout>
      <Callout tone="info" title="Desde el 17 = extras @ £16">
        Wording Victor: extras desde el 17 jul (dia completo). Ambiguidad si
        el 17 fuera ultimo dia de contrato: entonces extras desde el 18 (−4.5h
        / −£72). Modelo preferido = desde el 17.
      </Callout>
      <Table
        headers={["Bloque", "h span", "£ @ 16", "Nota"]}
        columnAlign={["left", "right", "right", "left"]}
        rows={[
          ["Vie 17", "4.5", gbp(4.5 * EXTRA_RATE), "Fadi DC + Acton tarde"],
          ["Lun 20 - vie 24", "13.5", gbp(13.5 * EXTRA_RATE), "DC; sin Acton"],
          [
            "Lun 27 - vie 31",
            "19.0",
            gbp(19.0 * EXTRA_RATE),
            "Emanuel/Yaqoub; crash 28/29; jue 30=0",
          ],
          [
            "Total 17-31",
            String(JUL_17_31_H),
            gbp(JUL_EXTRAS_GBP),
            "Pay adicional (no catch-up)",
          ],
          [
            "Solo 18-31 (alt.)",
            String(JUL_18_31_H),
            gbp(JUL_18_31_H * EXTRA_RATE),
            "Si se excluye el 17",
          ],
        ]}
      />

      <H2>5. Pendiente pagar</H2>
      <Table
        headers={["Concepto", "Bruto", "Nota"]}
        columnAlign={["left", "right", "left"]}
        rows={[
          ["Julio fijo (mes 11)", gbp(CONTRACT_MO), "Anualizado £26k"],
          ["Agosto fijo (mes 12)", gbp(CONTRACT_MO), "SI — Victor"],
          [
            "Extras 17-31 (" + JUL_17_31_H + "h × £16)",
            gbp(JUL_EXTRAS_GBP),
            "NO absorcion del £588",
          ],
          [
            "Subtotal",
            gbp(DUE_BEFORE_OFFSET),
            "Jul + Ago + extras",
          ],
          [
            "Con offset −£588",
            gbp(DUE_AFTER_OFFSET),
            "Decision aparte",
          ],
        ]}
      />
      <Callout tone="info" title="Sep: PT Day Centre + zero tardes">
        Empieza septiembre. Estimacion pro-rata £2,166.67/32h: solo manana
        ~£914 · manana+domingo ~£1,320. Falta cifra exacta.
      </Callout>

      <Divider />

      <H2>Pagos Tide (banco)</H2>
      <Table
        headers={["Fecha pago", "Importe", "Ref mes", "Tipo"]}
        rows={TIDE_PAYMENTS.map((r) => [
          r.date,
          gbp(r.gbp),
          r.ref,
          r.kind,
        ])}
        rowTone={TIDE_PAYMENTS.map((r) =>
          r.kind === "Gastos" ? ("neutral" as const) : ("info" as const),
        )}
      />
      <Text weight="semibold">Total: {gbp(tideTotal)}</Text>

      <H3>Payslip = contrato £26k</H3>
      <Text tone="secondary" size="small">
        Payslips ene-jun: base frecuente £2,166.67 + extras. Oct-Dic era
        ~£1,583.33 (£19k).
      </Text>

      <Divider />
      <Text tone="secondary" size="small">
        Carta: docs/finance/roberto-carta-sueldo-horas-2026.html · Briefing:
        docs/finance/roberto-cobrado-briefing-2026.html · MADRE:
        working_ui/portal/roster_term_master.json
      </Text>
    </Stack>
  );
}
