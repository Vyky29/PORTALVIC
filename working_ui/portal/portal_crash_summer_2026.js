/* Summer crash courses July 2026 — parent booking (pay in full). */
(function () {
  "use strict";

  var SESSION_KEY = "clubsens_parent_portal_session_v1";
  var HOLD_HINT = "Slots are held for 2 hours until you pay in full.";

  var CATALOG = {
    weeks: [
      {
        id: "w1",
        label: "Week 1 · July 2026 (climb 20–23 · swim 21–24)",
        dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
        climbing_dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"],
        swimming_dates: ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
      },
    ],
    weeksAll: [
      {
        id: "w1",
        label: "Week 1 · July 2026 (climb 20–23 · swim 21–24)",
        dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
        climbing_dates: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"],
        swimming_dates: ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
      },
      {
        id: "w2",
        label: "Week 2 · Tue 28 – Fri 31 July",
        dates: ["2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
        climbing_dates: ["2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
        swimming_dates: ["2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
      },
    ],
    climbing_slots: [
      { id: "c0", label: "10:00–11:00 · 1 instructor" },
      { id: "c1", label: "11:00–12:00 · 1 instructor" },
      { id: "c2", label: "12:00–13:00 · 1 instructor" },
      { id: "c_zak_1300", label: "13:00–14:00 · 1 instructor" },
      {
        id: "c3",
        label: "14:00–15:00 · 1 instructor · waiting list",
        bookable: false,
        waiting_list: true,
      },
    ],
    swimming_slots: [
      { id: "s1", label: "16:30–17:00 · Instructor A", start: "16:30", end: "17:00" },
      { id: "s2", label: "16:30–17:00 · Instructor B", start: "16:30", end: "17:00" },
      { id: "s3", label: "17:00–17:30 · Instructor A", start: "17:00", end: "17:30" },
      { id: "s4", label: "17:00–17:30 · Instructor B", start: "17:00", end: "17:30" },
      { id: "s5", label: "17:30–18:00 · Instructor A", start: "17:30", end: "18:00" },
      { id: "s6", label: "17:30–18:00 · Instructor B", start: "17:30", end: "18:00" },
      { id: "s7", label: "18:00–18:30 · Instructor A", start: "18:00", end: "18:30" },
      { id: "s8", label: "18:00–18:30 · Instructor B", start: "18:00", end: "18:30" },
    ],
    swim_chains: {
      A: ["s1", "s3", "s5", "s7"],
      B: ["s2", "s4", "s6", "s8"],
    },
    swim_time_bands: [
      ["s1", "s2"],
      ["s3", "s4"],
      ["s5", "s6"],
      ["s7", "s8"],
    ],
    swim_max: 4,
    prices: {
      climbing: { session: 75, weekly_pack: 300 },
      swimming: { session: 50, weekly_pack: 200 },
    },
  };

  var INDIVIDUAL_WINDOWS = {
    w1: { from: "2026-07-17", to: "2026-07-19", label: "Fri 17 – Sun 19 July" },
    w2: { from: "2026-07-24", to: "2026-07-26", label: "Fri 24 – Sun 26 July" },
  };

  var state = {
    sessionToken: "",
    children: [],
    weekId: "w1",
    mode: "weekly_pack",
    activities: { climbing: false, swimming: false },
    packSlots: { climbing: "", swimming: [] },
    daySlots: { climbing: {}, swimming: {} },
    availability: null,
    individualDaysOpen: false,
    individualByWeek: { w1: false, w2: false },
    week2Open: false,
    week1FillPct: 0,
    fullyBooked: false,
    pendingPay: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function supabaseUrl() {
    return String(window.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(
      /\/$/,
      "",
    );
  }

  function anonKey() {
    return String(window.SUPABASE_ANON_KEY || "");
  }

  function fn(name) {
    return supabaseUrl() + "/functions/v1/" + name;
  }

  function showNotice(kind, text) {
    var el = $("csNotice");
    if (!el) return;
    el.hidden = !text;
    el.className = "notice notice--" + (kind || "info");
    el.textContent = text || "";
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return "";
      var j = JSON.parse(raw);
      if (!j || !j.token || !j.expiresAt) return "";
      if (Number(j.expiresAt) <= Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return "";
      }
      return String(j.token);
    } catch (_e) {
      return "";
    }
  }

  function weekDates(activity) {
    var w = CATALOG.weeks.find(function (x) {
      return x.id === state.weekId;
    });
    if (!w) return [];
    if (activity === "climbing" && w.climbing_dates) return w.climbing_dates.slice();
    if (activity === "swimming" && w.swimming_dates) return w.swimming_dates.slice();
    return (w.dates || []).slice();
  }

  function slotsFor(activity) {
    return activity === "climbing" ? CATALOG.climbing_slots : CATALOG.swimming_slots;
  }

  function slotBookable(slot) {
    return !(slot && (slot.bookable === false || slot.waiting_list));
  }

  function pricesFor(activity) {
    return CATALOG.prices[activity];
  }

  function asSlotList(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (raw) return [String(raw)];
    return [];
  }

  function swimBandIndex(slotId) {
    var bands = CATALOG.swim_time_bands || [];
    for (var i = 0; i < bands.length; i++) {
      if ((bands[i] || []).indexOf(slotId) >= 0) return i;
    }
    return -1;
  }

  function orderSwim(ids) {
    return asSlotList(ids)
      .slice()
      .sort(function (a, b) {
        return swimBandIndex(a) - swimBandIndex(b);
      });
  }

  function swimBlockOk(ids) {
    var list = orderSwim(ids);
    if (!list.length || list.length > (CATALOG.swim_max || 4)) return false;
    var bands = list.map(swimBandIndex);
    if (bands.some(function (b) {
      return b < 0;
    })) {
      return false;
    }
    var seen = {};
    for (var i = 0; i < bands.length; i++) {
      if (seen[bands[i]]) return false;
      seen[bands[i]] = true;
    }
    for (var j = 1; j < bands.length; j++) {
      if (bands[j] !== bands[j - 1] + 1) return false;
    }
    return true;
  }

  function toggleSwim(current, clickedId) {
    var band = swimBandIndex(clickedId);
    if (band < 0) return [clickedId];
    var cur = orderSwim(current);
    var sameBand = null;
    for (var i = 0; i < cur.length; i++) {
      if (swimBandIndex(cur[i]) === band) {
        sameBand = cur[i];
        break;
      }
    }
    if (sameBand === clickedId) {
      var next = cur.filter(function (id) {
        return id !== clickedId;
      });
      return swimBlockOk(next) || !next.length ? next : [];
    }
    if (sameBand) {
      var swapped = orderSwim(
        cur
          .filter(function (id) {
            return id !== sameBand;
          })
          .concat([clickedId]),
      );
      if (swimBlockOk(swapped)) return swapped;
      return [clickedId];
    }
    if (!cur.length) return [clickedId];
    var trial = orderSwim(cur.concat([clickedId]));
    if (swimBlockOk(trial)) return trial;
    return [clickedId];
  }

  function swimLabel(ids) {
    var list = orderSwim(ids);
    if (!list.length) return "";
    var byId = {};
    slotsFor("swimming").forEach(function (s) {
      byId[s.id] = s;
    });
    var first = byId[list[0]];
    var last = byId[list[list.length - 1]];
    if (!first || !last) return list.join(", ");
    var start = first.start || String(first.label || "").split("–")[0];
    var end = last.end || "";
    if (!end && last.label) {
      var m = String(last.label).match(/–(\d{2}:\d{2})/);
      end = m ? m[1] : "";
    }
    var mix = list
      .map(function (id) {
        var s = byId[id];
        var who = String(s && s.label || "").indexOf("Instructor B") >= 0 ? "B" : "A";
        var t = (s && s.start) || id;
        return t + "(" + who + ")";
      })
      .join(" → ");
    return start + "–" + end + " · " + list.length * 30 + "′ · " + mix;
  }

  function slotUnits(activity, sel) {
    if (activity === "swimming") return asSlotList(sel).length;
    return sel ? 1 : 0;
  }

  function selectedActivities() {
    var out = [];
    if (state.activities.climbing) out.push("climbing");
    if (state.activities.swimming) out.push("swimming");
    return out;
  }

  function isSlotFree(activity, date, slotId) {
    var a = state.availability;
    if (!a || !a[activity] || !a[activity][date]) return true;
    return !!a[activity][date][slotId];
  }

  function slotsFreeOnDates(activity, dates, slotIds) {
    return asSlotList(slotIds).every(function (slotId) {
      return dates.every(function (d) {
        return isSlotFree(activity, d, slotId);
      });
    });
  }

  function computeTotal() {
    var acts = selectedActivities();
    var total = 0;
    acts.forEach(function (activity) {
      var p = pricesFor(activity);
      if (state.mode === "weekly_pack") {
        total += p.weekly_pack * slotUnits(activity, state.packSlots[activity]);
      } else {
        var map = state.daySlots[activity] || {};
        Object.keys(map).forEach(function (d) {
          total += p.session * slotUnits(activity, map[d]);
        });
      }
    });
    return total;
  }

  function updateTotal() {
    var el = $("csTotal");
    if (el) el.textContent = "Total: £" + computeTotal();
  }

  function emptySlotState() {
    state.packSlots = { climbing: "", swimming: [] };
    state.daySlots = { climbing: {}, swimming: {} };
  }

  function applyWeekOpenGate(data) {
    var openIds = Array.isArray(data && data.weeks_open)
      ? data.weeks_open.map(String)
      : data && data.week2_open
        ? ["w1", "w2"]
        : ["w1"];
    if (data && data.catalog && Array.isArray(data.catalog.weeks) && data.catalog.weeks.length) {
      CATALOG.weeks = data.catalog.weeks.slice();
    } else {
      CATALOG.weeks = (CATALOG.weeksAll || []).filter(function (w) {
        return openIds.indexOf(w.id) !== -1;
      });
    }
    state.week2Open = openIds.indexOf("w2") !== -1;
    if (state.fullyBooked && Array.isArray(CATALOG.weeksAll) && CATALOG.weeksAll.length) {
      CATALOG.weeks = CATALOG.weeksAll.slice();
      state.week2Open = true;
    }
    if (typeof (data && data.week1_fill_pct) === "number") {
      state.week1FillPct = data.week1_fill_pct;
    }
    if (!CATALOG.weeks.some(function (w) {
      return w.id === state.weekId;
    })) {
      state.weekId = (CATALOG.weeks[0] && CATALOG.weeks[0].id) || "w1";
      emptySlotState();
    }
    var rules = $("csWeekRules");
    if (rules) {
      if (state.fullyBooked) {
        rules.innerHTML =
          "<strong>Both July weeks are fully booked.</strong> " +
          "Use <strong>Keep me informed</strong> below for spare / leftover hours or last-minute cancellations (Week 1 and Week 2).";
      } else if (state.week2Open) {
        rules.innerHTML =
          "Crash courses are <strong>four-day week packs (Tue–Fri)</strong>. " +
          "Individual leftover hours open only in short windows before each week: " +
          "<strong>Week 1</strong> Fri 17 – Sun 19 July · " +
          "<strong>Week 2</strong> Fri 24 – Sun 26 July (packs only until Thu 23).";
      } else {
        rules.innerHTML =
          "Currently open: <strong>Week 1 only (Tue 21 – Fri 24 July)</strong>. " +
          "Week 2 (28–31 July) opens when Week 1 reaches <strong>80%</strong> of places" +
          (state.week1FillPct
            ? " (now " + state.week1FillPct + "%)"
            : "") +
          ". Individual leftover hours for Week 1: Fri 17 – Sun 19 July.";
      }
    }
    var info = $("csInfo");
    if (info) {
      var w2Li = info.querySelector('[data-crash-week="w2"]');
      if (w2Li) w2Li.hidden = !state.week2Open && !state.fullyBooked;
    }
    var submit = $("csSubmit");
    if (submit) {
      submit.disabled = state.fullyBooked;
      submit.textContent = state.fullyBooked ? "Fully booked" : "Reserve & pay in full";
      submit.hidden = !!state.fullyBooked;
    }
    ["csActClimb", "csActSwim"].forEach(function (id) {
      var control = $(id);
      // Keep activity ticks enabled when fully booked so waiting-list preference can use them.
      if (control && id === "csModeIndividual") control.disabled = state.fullyBooked;
      else if (control && !state.fullyBooked) control.disabled = false;
    });
    var modeIndividual = $("csModeIndividual");
    if (modeIndividual) modeIndividual.disabled = state.fullyBooked;
    var nextWrap = $("csNextInterestWrap");
    var interestWrap = $("csInterestWrap");
    if (nextWrap) nextWrap.hidden = !state.fullyBooked;
    if (interestWrap) interestWrap.hidden = !!state.fullyBooked || !!state.individualDaysOpen;
    var slotsCard = $("csSlotsCard");
    if (slotsCard) {
      slotsCard.querySelectorAll(".day-block, #csSlotsHost, #csSlotsHint, #csTotal").forEach(function () {});
      var hideBookBits = state.fullyBooked;
      ["csSlotsHint", "csSlotsHost", "csTotal"].forEach(function (id) {
        var el = $(id);
        if (el) el.hidden = hideBookBits;
      });
      var payNote = slotsCard.querySelector("p.muted:not([id])");
      if (payNote && /Payment must be completed/.test(payNote.textContent || "")) {
        payNote.hidden = hideBookBits;
      }
    }
    var nextBtn = $("csNextInterestBtn");
    if (nextBtn) nextBtn.disabled = false;
    renderWeeks();
  }

  function renderWeeks() {
    var host = $("csWeeks");
    if (!host) return;
    host.innerHTML = CATALOG.weeks
      .map(function (w) {
        return (
          '<button type="button" class="choice" data-week="' +
          w.id +
          '" aria-pressed="' +
          (state.weekId === w.id ? "true" : "false") +
          '">' +
          w.label +
          (state.fullyBooked ? " · Fully booked" : "") +
          "</button>"
        );
      })
      .join("");
    host.querySelectorAll("[data-week]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.weekId = btn.getAttribute("data-week") || "w1";
        emptySlotState();
        renderWeeks();
        renderSlots();
        loadAvailability();
      });
    });
  }

  function formatDayLabel(iso) {
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    } catch (_e) {
      return iso;
    }
  }

  function poolNote(iso) {
    var d = new Date(iso + "T12:00:00Z");
    var dow = d.getUTCDay();
    if (dow === 2 || dow === 4) return " · Big Pool";
    if (dow === 3 || dow === 5) return " · Teaching Pool";
    return "";
  }

  function renderSlotButtons(activity, date, selectedRaw) {
    var selected = asSlotList(selectedRaw);
    return slotsFor(activity)
      .map(function (slot) {
        var waiting = !slotBookable(slot);
        var free = !waiting && isSlotFree(activity, date, slot.id);
        var pressed = selected.indexOf(slot.id) >= 0;
        return (
          '<button type="button" class="slot-btn' +
          (waiting ? " slot-btn--wait" : "") +
          '" data-act="' +
          activity +
          '" data-date="' +
          date +
          '" data-slot="' +
          slot.id +
          '"' +
          (waiting || free ? "" : " disabled") +
          (waiting ? ' data-waiting="1"' : "") +
          ' aria-pressed="' +
          (pressed ? "true" : "false") +
          '">' +
          slot.label +
          (waiting ? " · tap to join list" : free ? "" : " · full") +
          "</button>"
        );
      })
      .join("");
  }

  function renderSlots() {
    var host = $("csSlotsHost");
    var hint = $("csSlotsHint");
    if (!host) return;
    var acts = selectedActivities();
    if (!acts.length) {
      host.innerHTML = '<p class="muted">Select Climbing and/or Swimming above.</p>';
      updateTotal();
      return;
    }

    if (hint) {
      hint.textContent =
        state.mode === "weekly_pack"
          ? "Climbing: pick one 60′ slot. Swimming: pick 1–4 consecutive 30′ times (up to 120′). You may mix instructors if those places are free. Same times every day of the week."
          : "Tick the days you want. Swimming allows up to 120′ (1–4 consecutive half-hours, instructors mixable) per day when free.";
    }

    var html = "";
    acts.forEach(function (activity) {
      var title = activity === "climbing" ? "Climbing" : "Swimming";
      html += '<h3 style="margin:12px 0 6px;font-size:.95rem;color:var(--ink)">' + title + "</h3>";
      if (activity === "swimming") {
        html +=
          '<p class="muted">Tap consecutive half-hours — mix instructors if free (e.g. 60′ with A then 30′ with B). Max 4 × 30′ = 120′. Price is £' +
          pricesFor("swimming").session +
          " per 30′ (weekly pack £" +
          pricesFor("swimming").weekly_pack +
          " × half-hours).</p>";
      }
      if (state.mode === "weekly_pack") {
        var anyDate = weekDates(activity)[0];
        var sel = state.packSlots[activity];
        html +=
          '<div class="slot-grid" data-pack="' +
          activity +
          '">' +
          renderSlotButtons(activity, anyDate, sel) +
          "</div>";
        if (activity === "swimming" && asSlotList(sel).length) {
          html += '<p class="muted"><strong>Selected:</strong> ' + swimLabel(sel) + "</p>";
        }
        html +=
          '<p class="muted">Availability checked for all four days — every selected slot must be free each day.</p>';
      } else {
        weekDates(activity).forEach(function (date) {
          var sel = (state.daySlots[activity] || {})[date];
          var has = asSlotList(sel).length > 0 || !!sel;
          if (activity === "climbing") has = !!sel;
          html +=
            '<div class="day-block" data-day-act="' +
            activity +
            '" data-day-date="' +
            date +
            '">' +
            "<h3>" +
            formatDayLabel(date) +
            (activity === "swimming" ? poolNote(date) : "") +
            "</h3>" +
            '<label style="display:flex;gap:8px;align-items:center;margin:0 0 8px;font-size:.88rem">' +
            '<input type="checkbox" class="day-enable" data-act="' +
            activity +
            '" data-date="' +
            date +
            '"' +
            (has ? " checked" : "") +
            " /> Book this day</label>" +
            (has
              ? '<div class="slot-grid">' +
                renderSlotButtons(activity, date, sel) +
                "</div>" +
                (activity === "swimming" && asSlotList(sel).length
                  ? '<p class="muted"><strong>Selected:</strong> ' + swimLabel(sel) + "</p>"
                  : "")
              : "") +
            "</div>";
        });
      }
    });
    host.innerHTML = html;

    if (state.mode === "weekly_pack") {
      acts.forEach(function (activity) {
        host.querySelectorAll('.slot-grid[data-pack="' + activity + '"] .slot-btn').forEach(function (btn) {
          var slotId = btn.getAttribute("data-slot");
          if (btn.getAttribute("data-waiting") === "1") return;
          var allFree = weekDates(activity).every(function (d) {
            return isSlotFree(activity, d, slotId);
          });
          if (!allFree) {
            btn.disabled = true;
            if (btn.textContent.indexOf("full") < 0 && btn.textContent.indexOf("not free") < 0) {
              btn.textContent += " · not free all week";
            }
            if (activity === "swimming") {
              state.packSlots.swimming = asSlotList(state.packSlots.swimming).filter(function (id) {
                return id !== slotId;
              });
            } else if (state.packSlots[activity] === slotId) {
              state.packSlots[activity] = "";
            }
          }
        });
      });
    }

    host.querySelectorAll(".slot-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.getAttribute("data-waiting") === "1") {
          void registerInterest("waiting_list_slot", btn.getAttribute("data-slot"));
          return;
        }
        var activity = btn.getAttribute("data-act");
        var date = btn.getAttribute("data-date");
        var slotId = btn.getAttribute("data-slot");
        if (state.mode === "weekly_pack") {
          if (activity === "swimming") {
            var next = toggleSwim(state.packSlots.swimming, slotId);
            if (!slotsFreeOnDates("swimming", weekDates("swimming"), next)) {
              showNotice("error", "That block is not free for the whole week. Try another.");
              return;
            }
            state.packSlots.swimming = next;
          } else {
            state.packSlots[activity] = slotId;
          }
        } else {
          if (!state.daySlots[activity]) state.daySlots[activity] = {};
          if (activity === "swimming") {
            var dayNext = toggleSwim(state.daySlots.swimming[date], slotId);
            if (!slotsFreeOnDates("swimming", [date], dayNext)) {
              showNotice("error", "That block is not free on " + formatDayLabel(date) + ".");
              return;
            }
            state.daySlots.swimming[date] = dayNext;
          } else {
            state.daySlots[activity][date] = slotId;
          }
        }
        renderSlots();
      });
    });

    host.querySelectorAll(".day-enable").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var activity = cb.getAttribute("data-act");
        var date = cb.getAttribute("data-date");
        if (!state.daySlots[activity]) state.daySlots[activity] = {};
        if (cb.checked) {
          var firstFree = slotsFor(activity).find(function (s) {
            return isSlotFree(activity, date, s.id);
          });
          if (!firstFree) {
            cb.checked = false;
            delete state.daySlots[activity][date];
            showNotice("error", "No free slots on " + formatDayLabel(date) + ".");
          } else if (activity === "swimming") {
            state.daySlots.swimming[date] = [firstFree.id];
          } else {
            state.daySlots[activity][date] = firstFree.id;
          }
        } else {
          delete state.daySlots[activity][date];
        }
        renderSlots();
      });
    });

    updateTotal();
  }

  function londonDateIso() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function individualOpenLocally(weekId) {
    var wid = weekId || state.weekId || "w1";
    var win = INDIVIDUAL_WINDOWS[wid];
    if (!win) return false;
    var iso = londonDateIso();
    return iso >= win.from && iso <= win.to;
  }

  function applyIndividualGate(open) {
    state.individualDaysOpen = !!open;
    var btn = $("csModeIndividual");
    var hint = $("csModeHint");
    var interestWrap = $("csInterestWrap");
    var win = INDIVIDUAL_WINDOWS[state.weekId] || INDIVIDUAL_WINDOWS.w1;
    if (btn) {
      btn.disabled = !state.individualDaysOpen;
      btn.setAttribute("aria-disabled", state.individualDaysOpen ? "false" : "true");
      if (!state.individualDaysOpen) {
        btn.title =
          state.weekId === "w2"
            ? "Week 2 individual hours: " + win.label + " (packs only until Thu 23)"
            : "Week 1 individual hours: " + win.label;
      } else {
        btn.removeAttribute("title");
      }
    }
    if (interestWrap) {
      interestWrap.hidden = !!state.fullyBooked || !!state.individualDaysOpen;
    }
    if (hint) {
      if (state.individualDaysOpen) {
        hint.textContent =
          "Individual leftover hours are open for this week (" +
          win.label +
          "). Weekly packs still have priority.";
      } else if (state.weekId === "w2") {
        hint.textContent =
          "Week 2: book a four-day weekly pack until Thursday 23 July. Individual hours for 28–31 July open " +
          win.label +
          ". Tap interest below if you want leftover hours later.";
      } else {
        hint.textContent =
          "Week 1: book a four-day weekly pack now. Individual leftover hours open " +
          win.label +
          " — register interest below so we know you want them.";
      }
    }
    if (!state.individualDaysOpen && state.mode === "individual_days") {
      state.mode = "weekly_pack";
      var host = $("csModes");
      if (host) {
        host.querySelectorAll("[data-mode]").forEach(function (b) {
          b.setAttribute(
            "aria-pressed",
            b.getAttribute("data-mode") === "weekly_pack" ? "true" : "false",
          );
        });
      }
      emptySlotState();
      renderSlots();
    }
  }

  async function registerInterest(interestType, slotId, opts) {
    opts = opts || {};
    if (!state.sessionToken) {
      showNotice("error", "Please sign in via the family portal first.");
      return;
    }
    var contact = ($("csContact") && $("csContact").value) || "";
    if (!contact) {
      showNotice("error", "Choose your child first.");
      return;
    }
    var isNext = interestType === "next_crash_courses";
    var isWait = interestType === "waiting_list_slot";
    var btn = isNext
      ? $("csNextInterestBtn")
      : isWait
        ? $("csWaitlistBtn")
        : $("csInterestBtn");
    var idleLabel = isNext
      ? "Leave details for next crash courses"
      : isWait
        ? "Keep me informed"
        : "I'm interested in individual hours";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending…";
    }
    try {
      var res = await fetch(supabaseUrl() + "/functions/v1/portal-crash-summer-interest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.sessionToken,
        },
        body: JSON.stringify({
          contact_id: contact,
          week_id: isNext ? "next" : opts.weekId || state.weekId || "w1",
          interest_type: interestType || "individual_hours",
          slot_id: isNext ? null : slotId || null,
          note: opts.note || null,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        showNotice("error", (data && data.message) || "Could not save your interest. Try again.");
        return false;
      }
      if (!opts.silentNotice) {
        showNotice(
          "success",
          data.message ||
            (isNext
              ? "Thanks — we have your details for the next crash courses."
              : isWait
                ? "Thanks — you are on the waiting list. We will call you if a place opens."
                : "Thanks — we have noted your interest and will follow up."),
        );
      }
      if (btn && !opts.keepButton) {
        btn.textContent = isNext
          ? "Details saved"
          : isWait
            ? "On waiting list"
            : "Interest registered";
        btn.disabled = true;
      }
      return true;
    } catch (_e) {
      showNotice("error", "Network error — please try again.");
      return false;
    } finally {
      if (btn && btn.textContent === "Sending…") {
        btn.disabled = false;
        btn.textContent = idleLabel;
      }
    }
  }

  async function joinCrashWaitingList() {
    var w1 = $("csWaitW1") && $("csWaitW1").checked;
    var w2 = $("csWaitW2") && $("csWaitW2").checked;
    var spare = $("csWaitSpare") && $("csWaitSpare").checked;
    if (!w1 && !w2) {
      showNotice("error", "Choose Week 1 and/or Week 2 for the waiting list.");
      return;
    }
    var acts = [];
    if ($("csActClimb") && $("csActClimb").checked) acts.push("climbing");
    if ($("csActSwim") && $("csActSwim").checked) acts.push("swimming");
    var noteBits = [
      "Waiting list · July crash",
      spare ? "open to individual/spare days" : "full pack preferred if possible",
    ];
    if (acts.length) noteBits.push("activities: " + acts.join("+"));
    var note = noteBits.join(" · ");
    var weeks = [];
    if (w1) weeks.push("w1");
    if (w2) weeks.push("w2");
    var btn = $("csWaitlistBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sending…";
    }
    var okAny = false;
    for (var i = 0; i < weeks.length; i++) {
      var ok = await registerInterest("waiting_list_slot", null, {
        weekId: weeks[i],
        note: note + " · " + weeks[i].toUpperCase(),
        silentNotice: true,
        keepButton: true,
      });
      if (ok) okAny = true;
    }
    if (okAny) {
      showNotice(
        "success",
        "Thanks — you are on the waiting list for " +
          weeks.map(function (w) {
            return w === "w1" ? "Week 1" : "Week 2";
          }).join(" and ") +
          (spare ? " (spare hours & last-minute cancellations)" : "") +
          ". We will call you if a place opens.",
      );
      if (btn) {
        btn.textContent = "We'll keep you informed";
        btn.disabled = true;
      }
    } else if (btn) {
      btn.disabled = false;
      btn.textContent = "Keep me informed";
    }
  }

  function bindModes() {
    var host = $("csModes");
    if (!host) return;
    host.querySelectorAll("[data-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var next = btn.getAttribute("data-mode") || "weekly_pack";
        if (next === "individual_days" && !state.individualDaysOpen) {
          var win = INDIVIDUAL_WINDOWS[state.weekId] || INDIVIDUAL_WINDOWS.w1;
          showNotice(
            "error",
            state.weekId === "w2"
              ? "Week 2 individual hours open " +
                  win.label +
                  ". Until Thu 23 July book a weekly pack for 28–31 July. Or register interest below."
              : "Week 1 individual hours open " +
                  win.label +
                  ". Until then book a weekly pack — or register interest below so we follow up.",
          );
          return;
        }
        state.mode = next;
        host.querySelectorAll("[data-mode]").forEach(function (b) {
          b.setAttribute(
            "aria-pressed",
            b.getAttribute("data-mode") === next ? "true" : "false",
          );
        });
        emptySlotState();
        renderSlots();
      });
    });
    var interestBtn = $("csInterestBtn");
    if (interestBtn && !interestBtn.getAttribute("data-bound")) {
      interestBtn.setAttribute("data-bound", "1");
      interestBtn.addEventListener("click", function () {
        void registerInterest("individual_hours", null);
      });
    }
    var nextBtn = $("csNextInterestBtn");
    if (nextBtn && !nextBtn.getAttribute("data-bound")) {
      nextBtn.setAttribute("data-bound", "1");
      nextBtn.addEventListener("click", function () {
        void registerInterest("next_crash_courses", null);
      });
    }
    var waitBtn = $("csWaitlistBtn");
    if (waitBtn && !waitBtn.getAttribute("data-bound")) {
      waitBtn.setAttribute("data-bound", "1");
      waitBtn.addEventListener("click", function () {
        void joinCrashWaitingList();
      });
    }
  }

  function bindActivities() {
    ["csActClimb", "csActSwim"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        state.activities.climbing = !!($("csActClimb") && $("csActClimb").checked);
        state.activities.swimming = !!($("csActSwim") && $("csActSwim").checked);
        renderSlots();
      });
    });
  }

  async function loadAvailability() {
    try {
      var res = await fetch(fn("portal-crash-summer-availability"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
        },
        body: JSON.stringify({ week_id: state.weekId }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data.ok) {
        state.fullyBooked = !!data.fully_booked;
        applyWeekOpenGate(data);
        state.availability = data.availability || null;
        if (state.fullyBooked) {
          showNotice(
            "info",
            data.fully_booked_message ||
              "July Crash Course Week 1 and Week 2 are fully booked."
          );
        }
        if (data.individual_windows) {
          if (data.individual_windows.w1) INDIVIDUAL_WINDOWS.w1 = data.individual_windows.w1;
          if (data.individual_windows.w2) INDIVIDUAL_WINDOWS.w2 = data.individual_windows.w2;
        }
        if (data.individual_days_open_by_week) {
          state.individualByWeek = {
            w1: !!data.individual_days_open_by_week.w1,
            w2: !!data.individual_days_open_by_week.w2,
          };
        }
        var openForWeek =
          data.individual_days_open_by_week &&
          typeof data.individual_days_open_by_week[state.weekId] === "boolean"
            ? data.individual_days_open_by_week[state.weekId]
            : typeof data.individual_days_open === "boolean"
              ? data.individual_days_open
              : individualOpenLocally(state.weekId);
        applyIndividualGate(openForWeek);
        if (data.catalog) {
          if (data.catalog.climbing_slots) CATALOG.climbing_slots = data.catalog.climbing_slots;
          if (data.catalog.swimming_slots) CATALOG.swimming_slots = data.catalog.swimming_slots;
          if (data.catalog.prices) CATALOG.prices = data.catalog.prices;
          if (data.catalog.swim_chains) CATALOG.swim_chains = data.catalog.swim_chains;
          if (data.catalog.swim_time_bands) CATALOG.swim_time_bands = data.catalog.swim_time_bands;
          if (data.catalog.swim_max_slots) CATALOG.swim_max = data.catalog.swim_max_slots;
        }
      } else {
        applyIndividualGate(individualOpenLocally(state.weekId));
      }
    } catch (_e) {
      applyIndividualGate(individualOpenLocally(state.weekId));
    }
    renderSlots();
  }

  function childBlocksExtraBooking(c) {
    var blob = [c && c.contact_id, c && c.display_name, c && c.first_name, c && c.last_name]
      .map(function (x) { return String(x || "").toLowerCase(); })
      .join(" ");
    if (/\btinashe\b/.test(blob)) return true;
    if (/\bikram\b/.test(blob)) return true;
    if (/\bfadi\b/.test(blob)) return true;
    if (/\btimi\b/.test(blob) || /oluwatimilehin/.test(blob)) return true;
    return false;
  }

  async function loadChildren() {
    var res = await fetch(fn("parent-portal-home-load"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": state.sessionToken,
      },
      body: JSON.stringify({}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || "session_invalid");
    }
    state.children = (data.children || []).slice();
    var sel = $("csContact");
    if (!sel) return;
    if (!state.children.length) {
      sel.innerHTML = "<option value=\"\">No linked children</option>";
      return;
    }
    var last = "";
    try {
      last = String(localStorage.getItem("pp_last_contact_id") || "");
    } catch (_e) {}
    var preferred = last;
    if (preferred && state.children.some(function (c) {
      return String(c.contact_id || "") === preferred && childBlocksExtraBooking(c);
    })) {
      preferred = "";
    }
    if (!preferred) {
      var openChild = state.children.find(function (c) { return !childBlocksExtraBooking(c); });
      if (openChild) preferred = String(openChild.contact_id || "");
    }
    sel.innerHTML = state.children
      .map(function (c) {
        var id = String(c.contact_id || "");
        var name = String(c.display_name || c.first_name || id);
        var blocked = childBlocksExtraBooking(c);
        return (
          '<option value="' +
          id.replace(/"/g, "") +
          '"' +
          (id === preferred ? " selected" : "") +
          (blocked ? " disabled" : "") +
          ">" +
          name.replace(/</g, "&lt;") +
          (blocked ? " (extras not available)" : "") +
          "</option>"
        );
      })
      .join("");
    if (state.children.every(childBlocksExtraBooking)) {
      if ($("csForm")) $("csForm").hidden = true;
      showNotice(
        "info",
        "Extra holiday sessions (including crash courses) are not available for the linked children on this account. Please contact the office if you need help.",
      );
    }
  }

  async function startCheckout(invoiceId, contactId) {
    var res = await fetch(fn("parent-portal-invoice-checkout"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": state.sessionToken,
      },
      body: JSON.stringify({
        contact_id: contactId,
        invoice_id: invoiceId,
        return_origin: window.location.origin || "",
      }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    var url = (data && (data.checkout_url || data.url)) || "";
    if (!res.ok || !data.ok || !url) {
      var err = new Error("checkout_failed");
      err.code = (data && data.error) || "checkout_failed";
      err.messageText =
        (data && data.message) ||
        "Card / Apple Pay is unavailable right now. Please pay by bank transfer.";
      throw err;
    }
    window.location.href = url;
    return true;
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return "£" + x.toFixed(2);
  }

  function composePayReference() {
    var nameEl = $("csPayRefName");
    return nameEl
      ? String(nameEl.value || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 40)
      : "";
  }

  function syncPayReferencePreview() {
    var ref = composePayReference();
    var dd = $("csPayRef");
    if (dd) dd.textContent = ref || "—";
  }

  function fillPayReferenceEditors(hint) {
    var nameEl = $("csPayRefName");
    var raw = String(hint || "")
      .replace(/\s+/g, " ")
      .trim();
    /* Strip legacy "name + service" / INV-P prefixes so editors stay name-only. */
    raw = raw.replace(/^INV-P-\d+\s+/i, "").trim();
    var legacyServices = [
      "Climbing Activity + Aquatic Activity",
      "Aquatic Activity",
      "Climbing Activity",
      "Physical Activity",
      "Multi-Activity",
      "Active Play and Movement",
      "Bespoke Programme",
    ];
    for (var i = 0; i < legacyServices.length; i++) {
      var svc = legacyServices[i];
      if (raw.toLowerCase().endsWith(svc.toLowerCase())) {
        raw = raw.slice(0, raw.length - svc.length).trim();
        break;
      }
    }
    if (nameEl) nameEl.value = raw.slice(0, 40);
    syncPayReferencePreview();
  }

  var payRefEditorsWired = false;
  function wirePayReferenceEditors() {
    if (payRefEditorsWired) return;
    payRefEditorsWired = true;
    var nameEl = $("csPayRefName");
    if (nameEl) {
      nameEl.addEventListener("input", syncPayReferencePreview);
      nameEl.addEventListener("change", syncPayReferencePreview);
    }
  }

  function showPayPanel(payload) {
    state.pendingPay = payload || null;
    var form = $("csForm");
    var pay = $("csPay");
    var info = $("csInfo");
    if (form) form.hidden = true;
    if (info) info.hidden = true;
    if (!pay) return;
    pay.hidden = false;

    var amount = Number(payload && payload.amount_gbp);
    var invNo = String((payload && payload.invoice_number) || "").trim();
    var summary = $("csPaySummary");
    if (summary) {
      summary.textContent =
        "Slots held for 2 hours. Invoice " +
        (invNo || "ready") +
        " — pay in full to confirm the place.";
    }
    var total = $("csPayTotal");
    if (total) total.textContent = "Total: " + money(amount);

    var invBlock = $("csPayInvoice");
    var invNoEl = $("csPayInvoiceNo");
    var pdfBtn = $("csPayPdfBtn");
    var emailNote = $("csPayEmailNote");
    var pdfUrl = String((payload && payload.pdf_url) || "").trim();
    if (invBlock) {
      invBlock.hidden = !(invNo || pdfUrl);
      if (invNoEl) {
        invNoEl.textContent = invNo
          ? "Invoice " + invNo + " — please pay before the hold expires."
          : "Your invoice is ready.";
      }
      if (pdfBtn) {
        if (pdfUrl) {
          pdfBtn.hidden = false;
          pdfBtn.href = pdfUrl;
        } else {
          pdfBtn.hidden = true;
          pdfBtn.removeAttribute("href");
        }
      }
      if (emailNote) {
        emailNote.hidden = !(payload && payload.invoice_emailed);
      }
    }

    var bank = (payload && payload.bank_transfer) || {};
    var bankMsg = $("csPayBankMsg");
    var bankDl = $("csPayBankDl");
    var bankBtn = $("csPayBankBtn");
    if (bank.available) {
      if (bankMsg) bankMsg.hidden = true;
      if (bankDl) bankDl.hidden = false;
      if ($("csPayPayee")) $("csPayPayee").textContent = bank.payee_name || "—";
      if ($("csPaySort")) $("csPaySort").textContent = bank.sort_code || "—";
      if ($("csPayAccount")) $("csPayAccount").textContent = bank.account_number || "—";
      wirePayReferenceEditors();
      fillPayReferenceEditors(bank.reference_hint || invNo || "");
      if (bankBtn) bankBtn.disabled = false;
    } else {
      if (bankMsg) {
        bankMsg.hidden = false;
        bankMsg.textContent =
          bank.message || "Contact the office for bank transfer details.";
      }
      if (bankDl) bankDl.hidden = true;
      if (bankBtn) bankBtn.disabled = true;
    }

    var card = (payload && payload.card_checkout) || {};
    var cardBtn = $("csPayCardBtn");
    var cardNote = $("csPayCardNote");
    if (cardNote) {
      if (card.available && Number(card.fee_gbp) > 0) {
        cardNote.textContent =
          "Card / Apple Pay total " +
          money(card.charge_gbp) +
          " (includes " +
          money(card.fee_gbp) +
          " processing fee). Bank transfer has no fee.";
      } else {
        cardNote.textContent =
          card.note ||
          "Opens a secure Stripe checkout. Apple Pay appears when available on your device.";
      }
    }
    if (cardBtn) {
      cardBtn.disabled = !card.available;
      cardBtn.textContent = card.available
        ? "Pay with Card / Apple Pay" +
          (Number(card.charge_gbp) > 0 ? " · " + money(card.charge_gbp) : "")
        : "Card / Apple Pay unavailable";
    }

    var invoices = $("csPayInvoices");
    if (invoices && payload && payload.contact_id) {
      invoices.href =
        "/parent/app?view=invoices&contact=" + encodeURIComponent(payload.contact_id);
    }

    if (pay.scrollIntoView) pay.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function reportBankPaid() {
    var p = state.pendingPay;
    if (!p || !p.invoice_id || !p.contact_id) return;
    var btn = $("csPayBankBtn");
    if (btn) btn.disabled = true;
    showNotice("info", "Recording your bank transfer…");
    try {
      var paymentRef = composePayReference();
      var res = await fetch(fn("parent-portal-invoice-report-paid"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.sessionToken,
        },
        body: JSON.stringify({
          contact_id: p.contact_id,
          invoice_id: p.invoice_id,
          payment_ref: paymentRef,
          method: "bank_transfer",
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        showNotice(
          "error",
          (data && data.message) || "Could not record payment — please try again or contact the office.",
        );
        if (btn) btn.disabled = false;
        return;
      }
      showNotice(
        "ok",
        (data && data.message) ||
          "Thanks — payment reported. The office will confirm shortly. Your place stays held while they check the transfer.",
      );
      if (btn) {
        btn.textContent = "Payment reported";
        btn.disabled = true;
      }
      var cardBtn = $("csPayCardBtn");
      if (cardBtn) cardBtn.disabled = true;
    } catch (_e) {
      showNotice("error", "Network error — please try again.");
      if (btn) btn.disabled = false;
    }
  }

  async function payWithCard() {
    var p = state.pendingPay;
    if (!p || !p.invoice_id || !p.contact_id) return;
    var btn = $("csPayCardBtn");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    showNotice("info", "Opening secure Card / Apple Pay checkout…");
    try {
      await startCheckout(p.invoice_id, p.contact_id);
    } catch (err) {
      showNotice("error", (err && err.messageText) || "Could not start Card / Apple Pay.");
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      }
    }
  }

  function bindPayActions() {
    var bankBtn = $("csPayBankBtn");
    if (bankBtn && !bankBtn.__bound) {
      bankBtn.__bound = true;
      bankBtn.addEventListener("click", function () {
        void reportBankPaid();
      });
    }
    var cardBtn = $("csPayCardBtn");
    if (cardBtn && !cardBtn.__bound) {
      cardBtn.__bound = true;
      cardBtn.addEventListener("click", function () {
        void payWithCard();
      });
    }
  }

  async function onSubmit(ev) {
    if (ev) ev.preventDefault();
    showNotice("info", "");
    var contactId = String(($("csContact") && $("csContact").value) || "").trim();
    var acts = selectedActivities();
    if (!contactId) {
      showNotice("error", "Choose a participant.");
      return;
    }
    if (!acts.length) {
      showNotice("error", "Select Climbing and/or Swimming.");
      return;
    }
    if (computeTotal() <= 0) {
      showNotice("error", "Choose your time slots before continuing.");
      return;
    }

    var slots = {};
    for (var i = 0; i < acts.length; i++) {
      var activity = acts[i];
      if (state.mode === "weekly_pack") {
        var packSel = state.packSlots[activity];
        if (!slotUnits(activity, packSel)) {
          showNotice("error", "Pick a time slot for " + activity + ".");
          return;
        }
        if (activity === "swimming" && !swimBlockOk(packSel)) {
          showNotice("error", "Swimming slots must be consecutive half-hours (max 120′). You can mix instructors.");
          return;
        }
        slots[activity] = activity === "swimming" ? asSlotList(packSel) : packSel;
      } else {
        var map = state.daySlots[activity] || {};
        var dates = Object.keys(map).filter(function (d) {
          return slotUnits(activity, map[d]) > 0;
        });
        if (!dates.length) {
          showNotice("error", "Pick at least one day for " + activity + ".");
          return;
        }
        if (activity === "swimming") {
          for (var di = 0; di < dates.length; di++) {
            if (!swimBlockOk(map[dates[di]])) {
              showNotice(
                "error",
                "Swimming on " +
                  formatDayLabel(dates[di]) +
                  " must be consecutive half-hours (max 120′, instructors mixable).",
              );
              return;
            }
          }
        }
        slots[activity] = map;
      }
    }

    var btn = $("csSubmit");
    if (btn) btn.disabled = true;
    showNotice("info", "Reserving slots…");

    try {
      var res = await fetch(fn("portal-crash-summer-book"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.sessionToken,
        },
        body: JSON.stringify({
          contact_id: contactId,
          week_id: state.weekId,
          booking_mode: state.mode,
          activities: acts,
          slots: slots,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        showNotice(
          "error",
          (data && data.message) ||
            (data && data.error === "extras_not_available"
              ? "Extra holiday sessions are not available for this participant."
              : data && data.error === "individual_days_not_open"
              ? data.message ||
                "Individual hours are not open for this week yet. Book a four-day weekly pack."
              : data && data.error === "slot_unavailable"
                ? "One or more slots were just taken. Please pick another time."
                : "Could not reserve — please try again."),
        );
        await loadAvailability();
        return;
      }
      showNotice(
        "ok",
        "Reserved for " +
          money(data.amount_gbp) +
          ". Choose bank transfer or Card / Apple Pay below to confirm.",
      );
      try {
        localStorage.setItem("pp_last_contact_id", contactId);
      } catch (_e) {}
      if (data.invoice_id) {
        showPayPanel({
          contact_id: contactId,
          invoice_id: data.invoice_id,
          invoice_number: data.invoice_number,
          amount_gbp: data.amount_gbp,
          bank_transfer: data.bank_transfer,
          card_checkout: data.card_checkout,
          pdf_url: data.pdf_url || null,
          invoice_emailed: !!data.invoice_emailed,
        });
      } else {
        showNotice(
          "info",
          "Booking reserved, but no invoice was created. Open the family portal Invoices tab or contact the office. " +
            HOLD_HINT,
        );
      }
    } catch (_e) {
      showNotice("error", "Network error — please try again.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function boot() {
    applyIndividualGate(individualOpenLocally(state.weekId));
    renderWeeks();
    bindModes();
    bindActivities();
    bindPayActions();

    var back = $("csBackPortal");
    if (back) {
      back.addEventListener("click", function () {
        window.location.href = "/parent";
      });
    }
    var form = $("csForm");
    if (form) form.addEventListener("submit", onSubmit);

    state.sessionToken = loadSession();
    if (!state.sessionToken) {
      if ($("csGate")) $("csGate").hidden = false;
      if ($("csForm")) $("csForm").hidden = true;
      var login = $("csLoginLink");
      if (login) {
        var ret = encodeURIComponent(
          (window.location.pathname || "/parent/crash-summer") + (window.location.search || ""),
        );
        login.href = "/parent?return=" + ret;
      }
      showNotice("info", "Sign in to the family portal to book. Payment in full is required to confirm a place.");
      return;
    }

    if ($("csGate")) $("csGate").hidden = true;
    if ($("csForm")) $("csForm").hidden = false;

    try {
      await loadChildren();
      await loadAvailability();
      showNotice("info", "Pay in full to confirm — unpaid holds are released automatically.");
    } catch (_e) {
      if ($("csGate")) $("csGate").hidden = false;
      if ($("csForm")) $("csForm").hidden = true;
      showNotice("error", "Your portal session expired. Please sign in again.");
    }
  }

  // Prefer real anon key from bootstrap script if exposed later.
  function waitBootstrapThenBoot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }

  waitBootstrapThenBoot();
})();
