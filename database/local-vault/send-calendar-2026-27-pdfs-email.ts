/**
 * Generate clean 1-page Calendar 2026/27 PDFs (no tabs/buttons/links) and optional email.
 *
 *   npx -y deno run --node-modules-dir=auto --allow-env --allow-read --allow-net \
 *     --allow-write --allow-run --allow-sys \
 *     database/local-vault/send-calendar-2026-27-pdfs-email.ts
 *
 *   APPLY=1 …  # also email to info@clubsensational.org
 */
import puppeteer from "npm:puppeteer-core@24.10.0";
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const TO = (Deno.env.get("TO") || "info@clubsensational.org").trim();
const CHROME =
  Deno.env.get("CHROME_PATH") ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DESKTOP_DIR =
  Deno.env.get("DESKTOP_DIR") ||
  path.join(Deno.env.get("HOME") || "", "Desktop", "Calendar-2026-27-PDFs");

function loadEnvFile(filePath: string) {
  try {
    for (const line of Deno.readTextFileSync(filePath).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}

loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/secrets.env");

const ROOT = Deno.cwd();
const HTML = path.join(ROOT, "working_ui/portal/day-centre-calendar-2026-27-section.html");
const LOGO_PATH = path.join(ROOT, "working_ui/portal/F-02-1.png");
const LOGO_DATA_URL =
  `data:image/png;base64,${readFileSync(LOGO_PATH).toString("base64")}`;
const OUT_DIR = path.join(ROOT, "database/local-vault/tmp/calendar-2026-27-pdfs");
mkdirSync(OUT_DIR, { recursive: true });

const TABS = [
  {
    panelId: "dcCalSessionsPanel",
    filename: "Calendar-2026-27-Afterschools-and-Weekends.pdf",
    label: "After-Schools & Weekends",
  },
  {
    panelId: "dcCalCrashPanel",
    filename: "Calendar-2026-27-Crash-Courses.pdf",
    label: "Crash Courses",
  },
  {
    panelId: "dcCalDayCentrePanel",
    filename: "Calendar-2026-27-Day-Centre.pdf",
    label: "Day Centre",
  },
] as const;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

const attachments: {
  filename: string;
  contentBase64: string;
  mimeType: string;
  label: string;
  bytes: number;
}[] = [];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1800, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector("#dcCal2627", { timeout: 15000 });

  await page.addScriptTag({
    url: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  });
  await page.addScriptTag({
    url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  });
  await page.waitForFunction(
    () =>
      !!(window as unknown as { html2canvas?: unknown }).html2canvas &&
      !!(window as unknown as { jspdf?: { jsPDF?: unknown } }).jspdf?.jsPDF,
    { timeout: 30000 },
  );

  for (const tab of TABS) {
    // Fresh DOM each calendar so panel-specific layout does not leak.
    await page.goto(pathToFileURL(HTML).href, { waitUntil: "networkidle0", timeout: 60000 });
    await page.waitForSelector("#dcCal2627", { timeout: 15000 });
    await page.addScriptTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    });
    await page.addScriptTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    });
    await page.waitForFunction(
      () =>
        !!(window as unknown as { html2canvas?: unknown }).html2canvas &&
        !!(window as unknown as { jspdf?: { jsPDF?: unknown } }).jspdf?.jsPDF,
      { timeout: 30000 },
    );

    await page.evaluate(
      ({ panelId, label, logoDataUrl }) => {
        const section = document.getElementById("dcCal2627");
        if (!section) return;
        const isCrash = panelId === "dcCalCrashPanel";

        document.documentElement.style.cssText = "height:auto;overflow:visible;background:#fff;";
        document.body.style.cssText = "height:auto;overflow:visible;margin:0;background:#fff;";

        // Activate panel + matching summary.
        section.querySelectorAll(".dc-cal-panel").forEach((p) => {
          const el = p as HTMLElement;
          const on = el.id === panelId;
          el.hidden = !on;
          el.style.display = on ? "block" : "none";
          el.style.overflow = "visible";
        });
        section.querySelectorAll("[data-dc-cal-summary]").forEach((s) => {
          const el = s as HTMLElement;
          el.hidden = el.getAttribute("data-dc-cal-summary") !== panelId;
        });

        // Hard-remove interactive chrome — no buttons, links, tabs, back.
        section.querySelectorAll("a, button, .dc-cal__back-wrap, .dc-cal-tabs").forEach((n) => {
          n.remove();
        });
        section.querySelectorAll("[onclick], [href], [role='button'], [tabindex]").forEach((n) => {
          n.removeAttribute("onclick");
          n.removeAttribute("href");
          n.removeAttribute("tabindex");
          if (n.getAttribute("role") === "button") n.removeAttribute("role");
          (n as HTMLElement).style.cursor = "default";
          (n as HTMLElement).style.textDecoration = "none";
          (n as HTMLElement).onclick = null;
        });

        // Print-friendly legends (no tap / blinking wording).
        const legendRewrites: Record<string, string> = {
          dcCalLegendSessions: [
            '<li><span class="dc-cal__swatch dc-cal__swatch--green" aria-hidden="true"></span> Green = Sessions running (Mon–Sun)</li>',
            '<li><span class="dc-cal__swatch dc-cal__swatch--red" aria-hidden="true"></span> Red = Closed / no sessions</li>',
          ].join(""),
          dcCalLegendDayCentre: [
            '<li><span class="dc-cal__swatch dc-cal__swatch--green" aria-hidden="true"></span> Green = Open</li>',
            '<li><span class="dc-cal__swatch dc-cal__swatch--red" aria-hidden="true"></span> Red = Closed</li>',
          ].join(""),
          dcCalLegendCrash: [
            '<li><span class="dc-cal__swatch dc-cal__swatch--green" aria-hidden="true"></span> Green = Crash course running</li>',
            '<li><span class="dc-cal__swatch dc-cal__swatch--red" aria-hidden="true"></span> Red = No crash course</li>',
          ].join(""),
        };
        Object.keys(legendRewrites).forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = legendRewrites[id];
        });

        // Title: ClubSENsational logo + year + calendar label (no “TERM DATES & CALENDAR”).
        const header = section.querySelector(".dc-cal__header") as HTMLElement | null;
        if (header) header.style.marginBottom = "6px";
        section.querySelector(".dc-cal__title")?.remove();
        let logo = section.querySelector(".dc-cal-pdf-logo") as HTMLImageElement | null;
        if (!logo) {
          logo = document.createElement("img");
          logo.className = "dc-cal-pdf-logo";
          logo.alt = "ClubSENsational";
          logo.src = logoDataUrl;
          const year = section.querySelector(".dc-cal__year");
          (year?.parentElement || header || section).insertBefore(logo, year || null);
        } else {
          logo.src = logoDataUrl;
        }
        logo.style.cssText =
          "display:block;margin:0 auto 6px;width:88px;height:88px;object-fit:contain;";
        let badge = section.querySelector(".dc-cal-pdf-badge") as HTMLElement | null;
        if (!badge) {
          badge = document.createElement("p");
          badge.className = "dc-cal-pdf-badge";
          const year = section.querySelector(".dc-cal__year");
          (year?.parentElement || section).insertBefore(badge, year?.nextSibling || null);
        }
        badge.textContent = label;
        badge.style.cssText =
          "margin:2px 0 0;text-align:center;font-size:1.05rem;font-weight:800;color:#162B5B;letter-spacing:0.05em;text-transform:uppercase;";

        // Afterschools PDF: drop weekend/Christmas closure lines + weekly intro blurb.
        if (panelId === "dcCalSessionsPanel") {
          const sessions = document.getElementById("dcCalSessionsPanel");
          sessions?.querySelector(".dc-cal-panel__intro")?.remove();
          sessions?.querySelectorAll(".dc-cal-term__info li").forEach((li) => {
            const t = (li.textContent || "").trim().toLowerCase();
            if (t.startsWith("weekend closures:") || t.startsWith("christmas closure:")) {
              li.remove();
            }
          });
        }

        // Shared print polish.
        let pdfStyle = section.querySelector("#dcCalPdfCenterStyle") as HTMLStyleElement | null;
        if (!pdfStyle) {
          pdfStyle = document.createElement("style");
          pdfStyle.id = "dcCalPdfCenterStyle";
          section.appendChild(pdfStyle);
        }
        pdfStyle.textContent = `
          #dcCal2627 a, #dcCal2627 button { display: none !important; }
          #dcCal2627, #dcCal2627 * {
            cursor: default !important;
            -webkit-tap-highlight-color: transparent !important;
            animation: none !important;
          }
          #dcCal2627 .dc-cal-term__head {
            text-align: center !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            margin-bottom: 6px !important;
          }
          #dcCal2627 .dc-cal-term__title {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            width: 100% !important;
            text-align: center !important;
            margin: 0 0 4px !important;
            gap: 4px !important;
          }
          #dcCal2627 .dc-cal-term__icon {
            display: block !important;
            line-height: 1 !important;
          }
          #dcCal2627 .dc-cal-term__info {
            list-style: none !important;
            padding-left: 0 !important;
            margin: 0 auto 4px !important;
            text-align: center !important;
            width: 100% !important;
          }
          #dcCal2627 .dc-cal-term__info li {
            text-align: center !important;
            margin: 0 0 3px !important;
            padding: 0 !important;
          }
          #dcCal2627 .dc-cal-term__weeks {
            display: flex !important;
            justify-content: center !important;
            width: 100% !important;
            margin: 0 auto 6px !important;
            text-align: center !important;
          }
          #dcCal2627 .dc-cal-term__weeks p {
            margin: 0 !important;
            text-align: center !important;
            width: 100% !important;
          }
          #dcCal2627 .dc-cal-cell--crash::after,
          #dcCal2627 .dc-cal-cell--term-edge::after {
            animation: none !important;
            opacity: 1 !important;
          }
        `;

        if (isCrash) {
          const crashPanel = document.getElementById("dcCalCrashPanel");
          if (!crashPanel) return;

          // Static print copy — drop summer blurb; keep half-term heading.
          const intros = crashPanel.querySelectorAll<HTMLElement>(".dc-cal-panel__intro");
          if (intros[0]) intros[0].remove();
          if (intros[1]) {
            intros[1].innerHTML =
              "Half-term crash courses (Monday–Thursday; Fridays off).<br>" +
              "<strong>Slots and times are TBC</strong> — confirmed in September.";
            intros[1].style.marginTop = "10px";
            intros[1].style.textAlign = "center";
            intros[1].style.fontWeight = "700";
            intros[1].style.lineHeight = "1.35";
          }

          const summerInfo = crashPanel.querySelector("#dcCalCrashPanel-term-summer")
            ?.closest(".dc-cal-term")
            ?.querySelector(":scope > .dc-cal-term__info");
          if (summerInfo) {
            summerInfo.innerHTML = [
              "<li><strong>Week 1:</strong> Tuesday 21 – Friday 24 July 2026</li>",
              "<li><strong>Week 2:</strong> Tuesday 28 – Friday 31 July 2026</li>",
              "<li>Book Climbing, Swimming, or both · four-day weekly packs (Tue–Fri)</li>",
              "<li><strong>Pay in full</strong> to reserve a place</li>",
            ].join("");
          }

          // Venue: name on one line, address on the next; no slot/instructor fluff.
          const climbingInfo = crashPanel
            .querySelector(".dc-cal-crash-offer__title")
            ?.closest(".dc-cal-crash-offer")
            ?.querySelector(":scope > .dc-cal-term__info");
          if (climbingInfo) {
            climbingInfo.innerHTML = [
              "<li>Time: <strong>11:00 am – 1:00 pm</strong></li>",
              "<li>Westway Sports &amp; Fitness Centre</li>",
              "<li>1 Crowthorne Road, London W10 6RP</li>",
              "<li>£75 per session · Four-day weekly pack £300</li>",
            ].join("");
          }
          const swimOffer = Array.from(
            crashPanel.querySelectorAll(".dc-cal-crash-offer"),
          ).find((el) =>
            (el.querySelector(".dc-cal-crash-offer__title")?.textContent || "")
              .toLowerCase()
              .includes("swim"),
          );
          const swimInfo = swimOffer?.querySelector(":scope > .dc-cal-term__info");
          if (swimInfo) {
            swimInfo.innerHTML = [
              "<li>Time: <strong>4:30 pm – 6:30 pm</strong></li>",
              "<li>Everyone Active Acton Centre</li>",
              "<li>High Street, Acton, London W3 6NE</li>",
              "<li>Tue &amp; Thu: Big Pool · Wed &amp; Fri: Teaching Pool</li>",
              "<li>£50 per session · Four-day weekly pack £200</li>",
            ].join("");
          }

          // Show both weeks; drop portal “appears when 80%” notes.
          crashPanel.querySelectorAll<HTMLElement>("[data-crash-week='w2']").forEach((el) => {
            el.hidden = false;
            el.style.display = "flex";
            el.style.marginTop = "6px";
          });
          crashPanel.querySelectorAll<HTMLElement>("[data-crash-w2-note]").forEach((el) => {
            el.remove();
          });

          // Wider crash cards + 2-col offers + 3-col half terms.
          section.style.cssText =
            "max-width:1040px;width:1040px;margin:0 auto;padding:10px 12px;overflow:visible;background:#fff;";
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-term").forEach((el) => {
            el.style.maxWidth = "none";
            el.style.marginLeft = "0";
            el.style.marginRight = "0";
            el.style.marginBottom = "10px";
            el.style.padding = "10px 12px 12px";
          });

          const summerTerm = crashPanel.querySelector("#dcCalCrashPanel-term-summer")?.closest(
            ".dc-cal-term",
          ) as HTMLElement | null;
          if (summerTerm) {
            let offersRow = summerTerm.querySelector(".dc-cal-pdf-offers") as HTMLElement | null;
            if (!offersRow) {
              offersRow = document.createElement("div");
              offersRow.className = "dc-cal-pdf-offers";
              const offers = Array.from(
                summerTerm.querySelectorAll<HTMLElement>(":scope > .dc-cal-crash-offer"),
              );
              offers.forEach((o) => offersRow!.appendChild(o));
              summerTerm.appendChild(offersRow);
            }
            offersRow.style.cssText =
              "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;align-items:start;";
          }

          const halfTerms = [
            crashPanel.querySelector("#dcCalCrashPanel-term-october")?.closest(".dc-cal-term"),
            crashPanel.querySelector("#dcCalCrashPanel-term-february")?.closest(".dc-cal-term"),
            crashPanel.querySelector("#dcCalCrashPanel-term-may")?.closest(".dc-cal-term"),
          ].filter(Boolean) as HTMLElement[];
          let halfRow = crashPanel.querySelector(".dc-cal-pdf-halfterms") as HTMLElement | null;
          if (!halfRow && halfTerms.length) {
            halfRow = document.createElement("div");
            halfRow.className = "dc-cal-pdf-halfterms";
            const marker = intros[1] || null;
            if (marker?.parentElement === crashPanel) {
              crashPanel.insertBefore(halfRow, marker.nextSibling);
            } else {
              crashPanel.appendChild(halfRow);
            }
            halfTerms.forEach((t) => halfRow!.appendChild(t));
          }
          if (halfRow) {
            halfRow.style.cssText =
              "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:4px;";
            halfRow.querySelectorAll<HTMLElement>(".dc-cal-term").forEach((el) => {
              el.style.margin = "0";
              el.style.height = "100%";
            });
          }

          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-offer").forEach((el) => {
            el.style.margin = "0";
            el.style.padding = "10px";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-offer__title").forEach((el) => {
            el.style.fontSize = "1rem";
            el.style.margin = "0 0 6px";
            el.style.textAlign = "center";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-days").forEach((el) => {
            el.style.gap = "4px";
            el.style.margin = "6px 0 0";
            el.style.justifyContent = "center";
            el.style.flexWrap = "nowrap";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-day").forEach((el) => {
            el.style.minWidth = "0";
            el.style.flex = "1 1 0";
            el.style.padding = "7px 4px";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-day__num").forEach((el) => {
            el.style.fontSize = "1.05rem";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-day__dow").forEach((el) => {
            el.style.fontSize = "0.55rem";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-crash-day__sub").forEach((el) => {
            el.style.fontSize = "0.5rem";
          });
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal__legend, .dc-cal-panel__intro").forEach(
            (el) => {
              el.style.margin = "0 0 8px";
              el.style.padding = "8px 10px";
              el.style.fontSize = "0.78rem";
              el.style.lineHeight = "1.35";
            },
          );
          crashPanel.querySelectorAll<HTMLElement>(".dc-cal-term__info").forEach((el) => {
            el.style.fontSize = "0.78rem";
            el.style.lineHeight = "1.35";
          });
        } else {
          // Compact month calendars so Afterschools / Day Centre fit one page.
          section.style.cssText =
            "max-width:1180px;width:1180px;margin:0 auto;padding:8px 10px 12px;overflow:visible;background:#fff;";
          section.querySelectorAll<HTMLElement>(".dc-cal__summary").forEach((el) => {
            el.style.margin = "0 0 6px";
            el.style.padding = "6px 8px";
            el.style.fontSize = "0.78rem";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal__legend").forEach((el) => {
            el.style.margin = "0 0 6px";
            el.style.padding = "6px 8px";
            el.style.fontSize = "0.72rem";
            el.style.gap = "4px 10px";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-panel__intro").forEach((el) => {
            el.style.margin = "0 0 8px";
            el.style.padding = "6px 8px";
            el.style.fontSize = "0.72rem";
            el.style.lineHeight = "1.3";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-term").forEach((el) => {
            el.style.margin = "0 0 8px";
            el.style.padding = "8px 10px 10px";
          });
          // Month cards stay 1/4-row wide; Spring (3 months) centres in the term box.
          section.querySelectorAll<HTMLElement>(".dc-cal-term__months").forEach((g) => {
            g.style.display = "flex";
            g.style.flexWrap = "nowrap";
            g.style.justifyContent = "center";
            g.style.alignItems = "stretch";
            g.style.gap = "8px";
            g.style.width = "100%";
            g.style.maxWidth = "100%";
            g.style.marginLeft = "0";
            g.style.marginRight = "0";
            Array.from(g.children).forEach((child) => {
              const m = child as HTMLElement;
              if (!m.classList.contains("dc-cal-month")) return;
              m.style.flex = "0 0 calc((100% - 24px) / 4)";
              m.style.width = "calc((100% - 24px) / 4)";
              m.style.maxWidth = "calc((100% - 24px) / 4)";
              m.style.minWidth = "0";
              m.style.padding = "6px 5px 8px";
              m.style.boxSizing = "border-box";
            });
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-month").forEach((m) => {
            if (!m.style.padding) m.style.padding = "6px 5px 8px";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-month__label").forEach((m) => {
            m.style.fontSize = "0.78rem";
            m.style.margin = "0 0 4px";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-weekdays").forEach((m) => {
            m.style.fontSize = "0.55rem";
            m.style.gap = "2px";
            m.style.marginBottom = "2px";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-grid").forEach((m) => {
            m.style.gap = "2px";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-day").forEach((m) => {
            m.style.fontSize = "0.68rem";
            m.style.minHeight = "18px";
            m.style.lineHeight = "1.1";
          });
          section.querySelectorAll<HTMLElement>(".dc-cal-cell").forEach((m) => {
            m.style.minHeight = "18px";
          });
        }

        // A4 frame: content centred and scaled to fill the page (no giant empty bottom).
        const PAGE_W = 794;
        const PAGE_H = 1123;
        const PAD = 22;
        let frame = document.getElementById("dcCalPdfFrame") as HTMLElement | null;
        if (!frame) {
          frame = document.createElement("div");
          frame.id = "dcCalPdfFrame";
          document.body.appendChild(frame);
        }
        // Park section in the A4 frame first, then hide siblings (never hide the section).
        frame.style.cssText =
          `width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;overflow:hidden;` +
          "display:flex;align-items:center;justify-content:center;margin:0;position:relative;";
        if (section.parentElement !== frame) {
          frame.innerHTML = "";
          frame.appendChild(section);
        }
        section.style.display = "block";
        section.style.visibility = "visible";
        Array.from(document.body.children).forEach((child) => {
          const el = child as HTMLElement;
          if (el.id === "dcCalPdfFrame") {
            el.style.display = "flex";
            return;
          }
          el.style.display = "none";
        });

        section.style.transform = "none";
        section.style.transformOrigin = "center center";
        // Force layout, then scale to fill the A4 box.
        const sw = Math.max(section.scrollWidth, section.offsetWidth, 1);
        const sh = Math.max(section.scrollHeight, section.offsetHeight, 1);
        const scale = Math.min((PAGE_W - PAD * 2) / sw, (PAGE_H - PAD * 2) / sh);
        section.style.transform = `scale(${Number.isFinite(scale) && scale > 0 ? scale : 1})`;
      },
      { panelId: tab.panelId, label: tab.label, logoDataUrl: LOGO_DATA_URL },
    );

    await page.waitForFunction(
      () => {
        const img = document.querySelector(".dc-cal-pdf-logo") as HTMLImageElement | null;
        return !!img && img.complete && img.naturalWidth > 0;
      },
      { timeout: 15000 },
    ).catch(() => null);
    await new Promise((r) => setTimeout(r, 200));

    // Visual check PNG (same A4 frame as PDF).
    const previewPath = path.join(
      OUT_DIR,
      `preview-${tab.filename.replace(/\.pdf$/i, "")}.png`,
    );
    const frameHandle = await page.$("#dcCalPdfFrame");
    if (frameHandle) {
      await frameHandle.screenshot({ path: previewPath, type: "png" });
      console.log("Preview", previewPath);
    }

    const result = await page.evaluate(async (label) => {
      const w = window as unknown as {
        html2canvas: (el: HTMLElement, opts: Record<string, unknown>) => Promise<HTMLCanvasElement>;
        jspdf: {
          jsPDF: new (opts: Record<string, unknown>) => {
            internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
            addImage: (...args: unknown[]) => void;
            output: (type: string) => string;
          };
        };
      };

      const frame = document.getElementById("dcCalPdfFrame") as HTMLElement | null;
      if (!frame) throw new Error("pdf frame missing");

      const canvas = await w.html2canvas(frame, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        letterRendering: true,
        backgroundColor: "#FFFFFF",
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        scrollX: 0,
        scrollY: 0,
      });

      const pdf = new w.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgData = canvas.toDataURL("image/jpeg", 0.94);
      pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);

      const dataUri = pdf.output("datauristring") as string;
      return {
        base64: dataUri.split(",")[1] || "",
        label,
        canvasW: canvas.width,
        canvasH: canvas.height,
        drawW: pageW,
        drawH: pageH,
      };
    }, tab.label);

    const pdfBytes = b64ToBytes(result.base64);
    const outPath = path.join(OUT_DIR, tab.filename);
    writeFileSync(outPath, pdfBytes);
    attachments.push({
      filename: tab.filename,
      contentBase64: result.base64,
      mimeType: "application/pdf",
      label: tab.label,
      bytes: pdfBytes.length,
    });
    console.log(
      "PDF 1-page",
      tab.label,
      `${Math.round(result.drawW)}x${Math.round(result.drawH)}mm`,
      `${result.canvasW}x${result.canvasH}px`,
      outPath,
      pdfBytes.length,
    );
  }
} finally {
  await browser.close();
}

try {
  mkdirSync(DESKTOP_DIR, { recursive: true });
  for (const a of attachments) {
    copyFileSync(path.join(OUT_DIR, a.filename), path.join(DESKTOP_DIR, a.filename));
  }
  console.log("Copied to", DESKTOP_DIR);
} catch (err) {
  console.warn("Desktop copy skipped:", err instanceof Error ? err.message : String(err));
}

const smtp = readParentNotifySmtpConfig();
if (!smtp) {
  console.error("SMTP not configured (SMTP_HOST/USER/PASS)");
  Deno.exit(1);
}

const listHtml = attachments
  .map((a) => `<li><strong>${a.label}</strong> — ${a.filename} (1 page)</li>`)
  .join("");
const html = [
  "<p>Hi,</p>",
  "<p><strong>Reference: GOOD ONES</strong></p>",
  "<p>Calendar <strong>2026/27</strong> PDFs (1 page each — final clean versions, no buttons/tabs):</p>",
  `<ul>${listHtml}</ul>`,
  "<p>Please use these and discard earlier versions from today.</p>",
  "<p>Thanks,<br>Portal</p>",
].join("\n");

const report = {
  at: new Date().toISOString(),
  to: TO,
  apply: APPLY,
  pdfs: attachments.map((a) => ({
    filename: a.filename,
    label: a.label,
    bytes: a.bytes,
    pages: 1,
  })),
  email: null as null | { ok: boolean; error?: string; id?: string },
};

if (!APPLY) {
  console.log("Dry run — set APPLY=1 to email via portal SMTP to", TO);
  writeFileSync(path.join(OUT_DIR, "send-report.json"), JSON.stringify(report, null, 2));
  Deno.exit(0);
}

const mail = await sendEmailWithAttachmentViaSmtp({
  config: smtp,
  to: [TO],
  subject: "GOOD ONES — Calendar 2026/27 PDFs (Afterschools, Crash, Day Centre)",
  html,
  replyTo: "info@clubsensational.org",
  attachments: attachments.map((a) => ({
    filename: a.filename,
    contentBase64: a.contentBase64,
    mimeType: a.mimeType,
  })),
});

report.email = {
  ok: !!mail.ok,
  error: mail.ok ? undefined : mail.error,
  id: mail.ok ? mail.id : undefined,
};
writeFileSync(path.join(OUT_DIR, "send-report.json"), JSON.stringify(report, null, 2));
console.log("Email", report.email);
if (!mail.ok) Deno.exit(1);
