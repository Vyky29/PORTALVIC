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
 * Victor 29 jul: Sep £19k/24h → Ene £26k/32h · Agosto SI (pro-rata 12m)
 * PRIOR CALC (DO NOT REINVENT): b46559df · Mar £144 + Abr £36 + Jun £408 = £588
 * Abr shortfall (DC manana £632 vs £1000) NO estaba en "deberia"
 * May Q6 claim ~6h: payslip May = £0 extras (TS pedía £445.50 no pagado)
 * Jul 18-31 MADRE span = 33h · programas standard end 17 Jul
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
/** Contrato confirmado Victor: £26k/yr desde ene 2026 — no Scala */
const CONTRACT_YR = 26000;
const CONTRACT_MO = 2166.67;
/** Baseline h/sem del acuerdo (manana 13.5 + tarde 11 + dom 6 ≈ 30.5; ~32) */
const CONTRACT_H_WEEK = 30.5;

/** Payslip bruto extras vs base — from Victor table 24 Jul (b46559df) */
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

/** Cobrado vs deberia — agreed 25 Jul: "si julio = enero, cuanto nos deberia?" → £588 */
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
  { block: "Manana L–V", detail: "Lun 3.5 · mar–vie 2.5", h: 13.5 },
  { block: "Tarde L–V", detail: "Lun/mie 2 · mar/jue 2.5 · vie 2", h: 11.0 },
  { block: "Domingo", detail: "6 h (desde jun 6.5)", h: 6.0 },
];

/** Span hours from roster_term_master (re-checked 29 jul; Jul 27 week = 19.5) */
const MADRE_WEEKS = [
  { week: "2026-06-01", total: 30.5, wd: 24.5, sun: 6.0 },
  { week: "2026-06-08", total: 30.0, wd: 24.0, sun: 6.0 },
  { week: "2026-06-15", total: 30.5, wd: 24.5, sun: 6.0 },
  { week: "2026-06-22", total: 31.0, wd: 24.5, sun: 6.5 },
  { week: "2026-06-29", total: 33.0, wd: 26.5, sun: 6.5 },
  { week: "2026-07-06", total: 31.5, wd: 25.0, sun: 6.5 },
  { week: "2026-07-13", total: 23.5, wd: 23.5, sun: 0.0 },
  { week: "2026-07-20", total: 13.5, wd: 13.5, sun: 0.0 },
  { week: "2026-07-27", total: 19.5, wd: 19.5, sun: 0.0 },
];
const JUL_18_31_H = 33.0;
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
        Sep 2025 – Jul 2026 · contrato £26k desde ene (no Scala) · ~30.5–32
        h/sem · Tide + extras + MADRE
      </Text>
      <Row gap={8} wrap>
        <Pill tone="info">Contrato fijo £26k</Pill>
        <Pill tone="neutral">No Scala / Scale</Pill>
        <Pill tone="info">Desde ene 2026</Pill>
        <Pill tone="warning">Overclaim £588 (calc 24–25 jul)</Pill>
        <Pill tone="neutral">~£480 cifra redonda Victor</Pill>
      </Row>

      <Grid columns={4} gap={16}>
        <Stat value={gbp(tideTotal)} label="Tide pagado (Sep–Jul)" />
        <Stat value={gbp(CONTRACT_MO)} label="Fijo / mes (£26k)" tone="info" />
        <Stat
          value={gbp(overclaimTot)}
          label="Overclaim ene–jun (acordado)"
          tone="warning"
        />
        <Stat
          value={"~" + madreAvgTot.toFixed(0) + "h"}
          label="Media h/sem MADRE Jun–Jul"
        />
      </Grid>

      <Callout tone="info" title="Historial contrato (Victor 29 jul)">
        Sep: £19k / ~24h · Ene: £26k / ~32h (no Scala). Pro-rata 12 meses →
        Agosto SI. Si hace menos de ~32h, recupera dentro del fijo — no EXTRA.
        Overclaim calc: £588 (~£480 redondo).
      </Callout>

      <Callout tone="warning" title="Calculo YA HECHO 24–25 jul — no reinventar">
        Chat b46559df. Payslips Victor + fotos timesheet
        (image-0159dc26, d7884336, 65331f41, f669b83b). Pregunta: &quot;si le
        pagamos julio como enero, cuanto nos deberia?&quot; → {gbp(overclaimTot)}
        (Mar £144 + Abr £36 + Jun £408).
      </Callout>

      <H2>0. Horas del contrato £26k</H2>
      <Table
        headers={["Bloque", "Detalle", "h / sem"]}
        columnAlign={["left", "left", "right"]}
        rows={[
          ...CONTRACT_HOURS.map((r) => [r.block, r.detail, r.h.toFixed(1)]),
          ["Total", "Acuerdo ~32 h/sem", "~30.5–32"],
        ]}
      />

      <H2>1. Cobrado vs deberia (calc 24–25 jul)</H2>
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
          r.gbp ? gbp(r.gbp) : "—",
          r.src,
        ])}
        rowTone={PAID_EXTRAS.map((r) =>
          r.gbp > 0 ? ("warning" as const) : ("neutral" as const),
        )}
      />
      <Text weight="semibold">
        Suma plus en bruto Sep–Jun: {gbp(paidExtrasTot)} (incluye hist. Sep–Dic)
      </Text>

      <H2>2. Rota MADRE vs acuerdo (~30.5 h/sem)</H2>
      <Text tone="secondary" size="small">
        Fuente: roster_term_master.json · domingo = pay window 6h / 6.5h
      </Text>
      <Grid columns={3} gap={12}>
        <Stat
          value={madreAvgTot.toFixed(1) + "h"}
          label="Media total / sem"
        />
        <Stat
          value={madreAvgWd.toFixed(1) + "h"}
          label="Media entre semana"
        />
        <Stat
          value={madreExcessTot.toFixed(0) + "h"}
          label={"Suma (total−" + CONTRACT_H_WEEK + ") si >acuerdo"}
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

      <H2>3. ~£480 / £588 = sobrerreclamo (no le debemos)</H2>
      <Callout tone="warning" title="Overclaim, no pago a Roberto">
        Tide: sin loan formal. £588 = Mar £144 + Abr £36 + Jun £408 (calc
        24–25 jul). ~£480 = redondo Victor. Misma logica: horas de recuperacion
        del paquete 32h/sem cobradas como EXTRA. Julio = base £2,166.67 no
        anade deuda (£2,166.67 − £588 = £1,578.67 si se descuenta).
      </Callout>

      <H2>4. Abril shortfall / Mayo Q6 / Jul 18-31 (29 jul)</H2>
      <Callout tone="neutral" title="Abril shortfall — NO estaba en deberia">
        Pot manana DC Abr £632 vs May/Jun £1,000 (= £368 / ~23h @ £16). Club
        abrio ~13 abr. El calc solo miro extras; el corto de paquete explica
        recuperacion, no baja solo el £588.
      </Callout>
      <Callout tone="neutral" title="Mayo Q6 (claim Roberto)">
        Miercoles 11-12 Q6 × 6 dias (~6h). Payslip mayo = £0 extras (TS pedía
        £445.50 y no se pago). Si era recuperacion → mayo sigue OK. Si era por
        encima y no pagado → credito ~£96 (@16) / ~£144 (@24) contra offset.
      </Callout>
      <Callout tone="warning" title="17 jul vs 18-31">
        Programas standard end 17 jul (documentado). Fin contrato laboral 17
        jul = afirmacion Victor (sin papel HR en repo). MADRE 18-31 ={" "}
        {JUL_18_31_H}h span vs 64h paquete (corto 31h). Si acordado=0:{" "}
        {JUL_18_31_H}×£16=£528 → offset queda £60; @£24 absorbe £588.
        Ojo: mes fijo julio ya cubre 18-31 si no se prorratea.
      </Callout>

      <H2>5. Pendiente pagar (Agosto SI)</H2>
      <Callout tone="info" title="Banco + Agosto">
        Ultimo salario Tide = junio. Julio + Agosto = 2 × £2,166.67 bruto
        pendientes. Agosto SI (anualizado 12m — Victor 29 jul).
      </Callout>
      <Table
        headers={["Escenario", "Bruto", "Nota"]}
        columnAlign={["left", "right", "left"]}
        rows={[
          ["Jul + Ago (sin offset)", gbp(CONTRACT_MO * 2), "2 × fijo"],
          [
            "Jul + Ago − £588",
            gbp(CONTRACT_MO * 2 - overclaimTot),
            "Offset clasico",
          ],
          [
            "Jul + Ago − £60",
            gbp(CONTRACT_MO * 2 - 60),
            "Si 18-31 @ £16 cancela £528",
          ],
          [
            "Jul + Ago offset £0",
            gbp(CONTRACT_MO * 2),
            "Si absorcion total (Victor)",
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
        Payslips ene–jun: base frecuente £2,166.67 + extras. Coincide con
        contrato {gbp(CONTRACT_MO)}/mes desde enero. Oct–Dic era ~£1,583.33.
      </Text>

      <Divider />
      <Text tone="secondary" size="small">
        Carta: docs/finance/roberto-carta-sueldo-horas-2026.html · Briefing:
        docs/finance/roberto-cobrado-briefing-2026.html · Horas: chat Victor
        (LUNES 3.5 / resto manana 2.5 + tardes + domingo 6/6.5).
      </Text>
    </Stack>
  );
}
