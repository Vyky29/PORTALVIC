import fs from "node:fs";

const j = JSON.parse(
  fs.readFileSync("database/local-vault/tmp/summer-term-portal-login-cross.json", "utf8"),
);

console.log("YES sample:");
j.rows
  .filter((r) => r.portalLogin === "Yes")
  .slice(0, 15)
  .forEach((r) => console.log(r.participant, "->", r.loggedParent, r.lastUsed));

const no = j.notYetRows;
const g = {};
for (const r of no) {
  const k = `${r.waDelivered}/${r.waRead}`;
  g[k] = (g[k] || 0) + 1;
}
console.log("\ncounts by WA among not yet:", g);
console.log(
  "not yet with WA delivered Yes:",
  no.filter((r) => r.waDelivered === "Yes").length,
);

const lit = JSON.stringify(j.rows, null, 2);
const code = `import {
  Callout,
  H1,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
} from "cursor/canvas";

type RowT = {
  n: number;
  participant: string;
  parentFirst: string;
  parentLast: string;
  dob: string;
  waDelivered: string;
  waRead: string;
  portalLogin: string;
  loggedParent: string;
  lastUsed: string;
};

const ROWS: RowT[] = ${lit};

type Filter = "not_yet" | "logged_in" | "not_yet_wa_yes" | "all";

export default function SummerPortalLoginCross() {
  const [filter, setFilter] = useCanvasState<Filter>("filter", "not_yet");

  const filtered = ROWS.filter((r) => {
    if (filter === "logged_in") return r.portalLogin === "Yes";
    if (filter === "not_yet") return r.portalLogin === "No";
    if (filter === "not_yet_wa_yes") return r.portalLogin === "No" && r.waDelivered === "Yes";
    return true;
  });

  const logged = ROWS.filter((r) => r.portalLogin === "Yes").length;
  const notYet = ROWS.filter((r) => r.portalLogin === "No").length;
  const notYetWa = ROWS.filter((r) => r.portalLogin === "No" && r.waDelivered === "Yes").length;

  return (
    <Stack gap={16}>
      <Stack gap={6}>
        <H1>Summer Term × Parent portal login</H1>
        <Text tone="secondary" size="small">
          ${j.summerParticipants} summer participants crossed with portal_parent_portal_sessions.
          Sibling families count once per parent login but each child row shows Yes if that parent
          entered. Generated ${j.generatedAt}.
        </Text>
      </Stack>

      <Row gap={12} wrap>
        <Stat value={String(ROWS.length)} label="Summer participants" />
        <Stat value={String(logged)} label="Portal login Yes" tone="success" />
        <Stat value={String(notYet)} label="Not yet" tone="warning" />
        <Stat value={String(notYetWa)} label="Not yet + WA delivered" tone="danger" />
      </Row>

      <Callout tone="info" title="Read this as participants, not families">
        {logged} of {ROWS.length} participants have a parent who has logged in. Chase list: Not yet
        + WA delivered (got the welcome WhatsApp but have not opened the portal).
      </Callout>

      <Row gap={8} wrap>
        <Pill active={filter === "not_yet"} onClick={() => setFilter("not_yet")}>
          Not yet ({notYet})
        </Pill>
        <Pill
          active={filter === "not_yet_wa_yes"}
          onClick={() => setFilter("not_yet_wa_yes")}
        >
          Not yet + WA Yes ({notYetWa})
        </Pill>
        <Pill active={filter === "logged_in"} onClick={() => setFilter("logged_in")}>
          Logged in ({logged})
        </Pill>
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Pill>
      </Row>

      <Text tone="secondary" size="small">
        Showing {filtered.length}
      </Text>

      <Table
        stickyHeader
        striped
        headers={[
          "#",
          "Participant",
          "Parent",
          "Portal login",
          "Logged as",
          "Last used",
          "WA delivered",
          "WA read",
        ]}
        columnAlign={["right", "left", "left", "left", "left", "left", "left", "left"]}
        rowTone={filtered.map((r) =>
          r.portalLogin === "Yes"
            ? "success"
            : r.waDelivered === "Yes"
              ? "warning"
              : r.waDelivered === "No"
                ? "danger"
                : undefined
        )}
        rows={filtered.map((r) => [
          String(r.n),
          r.participant,
          \`\${r.parentFirst} \${r.parentLast}\`,
          r.portalLogin,
          r.loggedParent,
          r.lastUsed,
          r.waDelivered,
          r.waRead,
        ])}
      />
    </Stack>
  );
}
`;

fs.writeFileSync(
  "/Users/victor/.cursor/projects/Users-victor-cursor-PORTALVIC/canvases/summer-portal-login-cross.canvas.tsx",
  code,
);
console.log("canvas written");
