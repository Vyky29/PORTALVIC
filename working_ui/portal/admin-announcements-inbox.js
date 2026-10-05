/**
 * Admin Announcements inbox — same split as family WhatsApp.
 * Left: the group each send went to. Right: the message, who signed, who has not.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    onNewAnnouncement: function () {},
    onNewReminder: function () {},
    onEdit: function () {},
  };

  var state = {
    rows: [],
    films: [],
    acks: [],
    staff: [],
    filter: "all",
    q: "",
    groupKey: "",
    openId: "",
  };

  var FILM_KINDS = [
    { kind: "feedback_watch", label: "How we write session feedback" },
    { kind: "feedback_on_time", label: "Finish feedback before you leave" },
  ];

  function esc(s) {
    return cfg.esc(s);
  }

  function kindOf(row) {
    return String((row && row.message_type) || "announcement").toLowerCase();
  }

  function kindLabel(row) {
    var k = kindOf(row);
    if (k === "reminder") return "Reminder";
    if (k === "schedule") return "Schedule notice";
    if (k === "feedback_watch") return "How we write session feedback";
    if (k === "feedback_on_time") return "Finish feedback before you leave";
    return "Announcement";
  }

  function whenLabel(iso) {
    var d = new Date(iso || "");
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso || "").slice(0, 16);
    }
  }

  function excludedName(name) {
    var who = String(name || "").trim().toLowerCase();
    if (!who) return false;
    if (who.indexOf("javier marquez") !== -1) return true;
    if (who === "javier") return true;
    return false;
  }

  function personName(p) {
    return String((p && (p.full_name || p.username)) || "").trim();
  }

  function groupKey(row) {
    var scope = String((row && row.delivery_scope) || "everyone");
    if (scope === "single_user") return "user:" + String(row.target_user_id || "");
    if (scope === "staff_role") return "role:" + String(row.target_staff_role || "").trim().toLowerCase();
    if (String(row.audience_scope || "") === "leads") return "leads";
    return "all_staff";
  }

  function groupLabel(key, row) {
    if (key === "all_staff") return "All staff";
    if (key === "leads") return "Leads";
    if (key.indexOf("role:") === 0) {
      var role = key.slice(5);
      return role ? "Role · " + role : "Role";
    }
    if (key.indexOf("user:") === 0) {
      var id = key.slice(5);
      var hit = null;
      state.staff.forEach(function (p) {
        if (String(p.id) === id) hit = p;
      });
      if (hit) return personName(hit) || "One person";
      if (row && row.target_user_id) return "One person";
    }
    return "Group";
  }

  function liveAnnouncements(rows) {
    return (rows || []).filter(function (row) {
      var k = kindOf(row);
      if (k !== "announcement" && k !== "reminder" && k !== "schedule") return false;
      if (k === "reminder") return true;
      var d = String(row.created_at || "").slice(0, 10);
      return d && d >= "2026-06-02";
    });
  }

  function acksFor(id) {
    return state.acks.filter(function (a) {
      return String(a.announcement_id || "") === String(id || "");
    });
  }

  function recipientsFor(row) {
    var scope = String(row.delivery_scope || "everyone");
    var audience = String(row.audience_scope || "all_staff");
    if (scope === "single_user") {
      var id = String(row.target_user_id || "");
      return state.staff.filter(function (p) {
        return String(p.id) === id;
      });
    }
    return state.staff.filter(function (p) {
      if (p.is_active === false) return false;
      if (excludedName(personName(p))) return false;
      if (scope === "staff_role") {
        return String(p.staff_role || "").trim().toLowerCase() === String(row.target_staff_role || "").trim().toLowerCase();
      }
      if (audience === "leads") {
        var ar = String(p.app_role || "").trim().toLowerCase();
        return ar === "lead" || ar === "leads";
      }
      return true;
    });
  }

  function receipt(row) {
    var signed = acksFor(row.id).filter(function (a) {
      return !excludedName(a.staff_full_name || a.staff_username || "");
    });
    var signedIds = {};
    signed.forEach(function (a) {
      if (a.staff_id) signedIds[String(a.staff_id)] = 1;
    });
    var missing = recipientsFor(row).filter(function (p) {
      return !signedIds[String(p.id)];
    });
    return { signed: signed, missing: missing };
  }

  function filmSends(kind) {
    return (state.films || []).filter(function (row) {
      return kindOf(row) === kind;
    });
  }

  function ackForSend(row, staffId) {
    var id = String(row && row.id || "");
    var who = String(staffId || "");
    var hit = null;
    state.acks.forEach(function (a) {
      if (String(a.announcement_id || "") !== id) return;
      if (String(a.staff_id || "") !== who) return;
      if (!hit || String(a.signed_at || "") > String(hit.signed_at || "")) hit = a;
    });
    return hit;
  }

  function filmPeople(kind) {
    var map = {};
    filmSends(kind).forEach(function (row) {
      recipientsFor(row).forEach(function (p) {
        var id = String(p.id || "");
        if (!id) return;
        if (!map[id]) map[id] = { id: id, name: personName(p) || "Staff", events: [] };
        var ack = ackForSend(row, id);
        map[id].events.push({
          sentAt: row.created_at || "",
          watchedAt: ack && ack.signed_at ? ack.signed_at : "",
        });
      });
    });
    return Object.keys(map)
      .map(function (id) {
        var person = map[id];
        person.events.sort(function (a, b) {
          return String(b.sentAt).localeCompare(String(a.sentAt));
        });
        person.sentCount = person.events.length;
        person.watchedCount = person.events.filter(function (event) {
          return !!event.watchedAt;
        }).length;
        return person;
      })
      .sort(function (a, b) {
        var aOpen = a.watchedCount < a.sentCount;
        var bOpen = b.watchedCount < b.sentCount;
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  function filmGroups() {
    var q = String(state.q || "").trim().toLowerCase();
    return FILM_KINDS.map(function (film) {
      var people = filmPeople(film.kind);
      var sendCount = 0;
      var waitingCount = 0;
      var latestAt = "";
      people.forEach(function (person) {
        sendCount += person.sentCount;
        waitingCount += person.sentCount - person.watchedCount;
        person.events.forEach(function (event) {
          if (String(event.sentAt) > latestAt) latestAt = String(event.sentAt);
        });
      });
      return {
        key: "film:" + film.kind,
        film: true,
        kind: film.kind,
        label: film.label,
        people: people,
        sendCount: sendCount,
        waitingCount: waitingCount,
        latestAt: latestAt,
      };
    }).filter(function (g) {
      if (state.filter === "films") return true;
      if (!g.sendCount) return false;
      if (!q) return true;
      if (g.label.toLowerCase().indexOf(q) !== -1) return true;
      return g.people.some(function (person) {
        return person.name.toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function groups() {
    var want = state.filter;
    var q = String(state.q || "").trim().toLowerCase();
    var map = {};
    liveAnnouncements(state.rows).forEach(function (row) {
      var k = kindOf(row);
      if (want === "announcement" && k === "reminder") return;
      if (want === "reminder" && k !== "reminder") return;
      var key = groupKey(row);
      if (!map[key]) map[key] = { key: key, label: groupLabel(key, row), rows: [] };
      map[key].rows.push(row);
    });
    var list = Object.keys(map).map(function (key) {
      var g = map[key];
      g.rows.sort(function (a, b) {
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });
      var latest = g.rows[0];
      var latestRec = receipt(latest);
      g.latest = latest;
      g.missingCount = latestRec.missing.length;
      g.latestIsReminder = kindOf(latest) === "reminder";
      return g;
    });
    list.sort(function (a, b) {
      return String((b.latest && b.latest.created_at) || "").localeCompare(String((a.latest && a.latest.created_at) || ""));
    });
    if (!q) return list;
    return list.filter(function (g) {
      if (g.label.toLowerCase().indexOf(q) !== -1) return true;
      return g.rows.some(function (row) {
        return (String(row.title || "") + " " + String(row.body || "")).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function namesHtml(items, nameFn, empty) {
    if (!items.length) return '<p class="muted" style="margin:0">' + esc(empty) + "</p>";
    return (
      '<ul class="admin-ann-names">' +
      items
        .map(function (item) {
          return "<li>" + esc(nameFn(item)) + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function filmPaneHtml(g) {
    var q = String(state.q || "").trim().toLowerCase();
    var people = (g.people || []).filter(function (person) {
      if (!q) return true;
      if (g.label.toLowerCase().indexOf(q) !== -1) return true;
      return person.name.toLowerCase().indexOf(q) !== -1;
    });
    var body = people.length
      ? people
          .map(function (person) {
            var lines = person.events
              .map(function (event) {
                var watched = event.watchedAt
                  ? '<span class="admin-ann-film__ok">Watched ' + esc(whenLabel(event.watchedAt)) + "</span>"
                  : '<span class="admin-ann-film__wait">Not watched yet</span>';
                return (
                  "<li><span>Sent " +
                  esc(whenLabel(event.sentAt) || "-") +
                  "</span>" +
                  watched +
                  "</li>"
                );
              })
              .join("");
            return (
              '<article class="admin-ann-film__person"><h3>' +
              esc(person.name) +
              '</h3><p class="admin-ann-film__count">Sent ' +
              esc(String(person.sentCount)) +
              " · watched " +
              esc(String(person.watchedCount)) +
              '</p><ul class="admin-ann-film__events">' +
              lines +
              "</ul></article>"
            );
          })
          .join("")
      : '<p class="muted" style="margin:0">This film has not been sent yet.</p>';
    return (
      '<div class="portal-pnlog-pane-active">' +
      '<header class="portal-pnlog-pane-head">' +
      '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-pane-back" data-ann-back>Back</button>' +
      '<div class="portal-pnlog-pane-head__text">' +
      '<div class="portal-pnlog-pane-head__who">' +
      esc(g.label) +
      "</div>" +
      '<div class="portal-pnlog-pane-head__sub muted">Each line is one send. Watched is when they finished the film.</div></div></header>' +
      '<div class="portal-pnlog-thread-scroll"><div class="admin-ann-film">' +
      body +
      "</div></div></div>"
    );
  }

  function paneHtml(g) {
    if (g && g.film) return filmPaneHtml(g);
    if (!g) {
      return (
        '<div class="portal-pnlog-pane-empty"><p class="muted" style="margin:0">Choose a group. Each group is one conversation.</p></div>'
      );
    }
    var bubbles = g.rows
      .map(function (row) {
        var rec = receipt(row);
        var open = String(row.id) === String(state.openId);
        var body = String(row.body || "").trim();
        var signWord = kindOf(row) === "reminder" ? "marked read" : "signed";
        var notWord = kindOf(row) === "reminder" ? "not marked" : "not signed";
        var receiptBlock = open
          ? '<div class="admin-ann-receipt">' +
            '<div class="admin-ann-receipt__col"><h4>' +
            esc(kindOf(row) === "reminder" ? "Marked read" : "Signed") +
            " <span>" +
            esc(String(rec.signed.length)) +
            "</span></h4>" +
            namesHtml(
              rec.signed,
              function (a) {
                var who = String(a.staff_full_name || a.staff_username || "Staff").trim();
                var at = whenLabel(a.signed_at);
                return at ? who + " · " + at : who;
              },
              "Nobody yet"
            ) +
            "</div>" +
            '<div class="admin-ann-receipt__col admin-ann-receipt__col--miss"><h4>' +
            esc(kindOf(row) === "reminder" ? "Not marked" : "Not signed") +
            " <span>" +
            esc(String(rec.missing.length)) +
            "</span></h4>" +
            namesHtml(rec.missing, personName, "Everyone in this group has " + signWord) +
            "</div></div>"
          : "";
        return (
          '<article class="admin-ann-bubble' +
          (open ? " is-open" : "") +
          '" data-ann-id="' +
          esc(row.id) +
          '">' +
          '<button type="button" class="admin-ann-bubble__hit" data-ann-open="' +
          esc(row.id) +
          '">' +
          '<span class="admin-ann-bubble__top"><strong>' +
          esc(row.title || kindLabel(row)) +
          '</strong><span class="muted">' +
          esc(whenLabel(row.created_at)) +
          "</span></span>" +
          '<span class="admin-ann-bubble__kind">' +
          esc(kindLabel(row)) +
          "</span>" +
          (body ? '<span class="admin-ann-bubble__body">' + esc(body) + "</span>" : "") +
          '<span class="admin-ann-bubble__meta">' +
          esc(String(rec.signed.length)) +
          " " +
          esc(signWord) +
          " · " +
          esc(String(rec.missing.length)) +
          " " +
          esc(notWord) +
          "</span></button>" +
          receiptBlock +
          (open
            ? '<div class="admin-ann-bubble__actions"><button type="button" class="btn btn--sec btn--sm" data-ann-edit="' +
              esc(row.id) +
              '">Edit</button></div>'
            : "") +
          "</article>"
        );
      })
      .join("");
    return (
      '<div class="portal-pnlog-pane-active">' +
      '<header class="portal-pnlog-pane-head">' +
      '<button type="button" class="btn btn--ghost btn--sm portal-pnlog-pane-back" data-ann-back>Back</button>' +
      '<div class="portal-pnlog-pane-head__text">' +
      '<div class="portal-pnlog-pane-head__who">' +
      esc(g.label) +
      "</div>" +
      '<div class="portal-pnlog-pane-head__sub muted">' +
      esc(String(g.rows.length)) +
      " sent · tap a message to see who signed</div></div></header>" +
      '<div class="portal-pnlog-thread-scroll"><div class="admin-ann-thread">' +
      bubbles +
      "</div></div></div>"
    );
  }

  function render() {
    var root = document.getElementById("adminAnnInboxRoot");
    if (!root) return;
    var list = state.filter === "films" ? filmGroups() : filmGroups().concat(groups());
    if (state.groupKey && !list.some(function (g) { return g.key === state.groupKey; })) {
      state.groupKey = list[0] ? list[0].key : "";
    }
    if (!state.groupKey && list[0] && window.innerWidth > 780) state.groupKey = list[0].key;
    var current = null;
    list.forEach(function (g) {
      if (g.key === state.groupKey) current = g;
    });
    if (current && !current.film && !state.openId) state.openId = String(current.rows[0].id);
    if (current && !current.film && !current.rows.some(function (r) { return String(r.id) === String(state.openId); })) {
      state.openId = String(current.rows[0].id);
    }
    var convs = list.length
      ? list
          .map(function (g) {
            var latest = g.latest || {};
            var preview = g.film
              ? (g.sendCount ? g.sendCount + " sends" : "Not sent yet")
              : String(latest.title || kindLabel(latest));
            var miss = g.film
              ? (g.waitingCount ? g.waitingCount + " not watched" : (g.sendCount ? "All watched" : "No sends"))
              : (g.missingCount
              ? g.missingCount + (g.latestIsReminder ? " not marked" : " not signed")
              : "All signed");
            return (
              '<button type="button" class="portal-pnlog-conv' +
              (g.key === state.groupKey ? " is-selected" : "") +
              ((g.film ? g.waitingCount : g.missingCount) ? " portal-pnlog-conv--unread" : "") +
              '" data-ann-group="' +
              esc(g.key) +
              '">' +
              '<span class="portal-pnlog-conv__top"><span class="portal-pnlog-conv__who">' +
              esc(g.label) +
              '</span><span class="portal-pnlog-conv__when muted">' +
              esc(whenLabel(g.film ? g.latestAt : latest.created_at)) +
              "</span></span>" +
              '<span class="portal-pnlog-conv__preview muted">' +
              esc(preview) +
              "</span>" +
              '<span class="portal-pnlog-conv__sub muted">' +
              esc(String(g.film ? g.people.length : g.rows.length)) +
              " · " +
              esc(miss) +
              "</span></button>"
            );
          })
          .join("")
      : '<p class="muted" style="margin:14px">' +
        (state.filter === "films" ? "No films sent yet." : "No announcements or reminders yet.") +
        "</p>";
    var narrow = window.innerWidth <= 780 && !!state.groupKey;
    root.innerHTML =
      '<div class="portal-pnlog-toolbar">' +
      '<input type="search" id="adminAnnInboxSearch" class="inp portal-pnlog-toolbar__search" placeholder="Search group or message" value="' +
      esc(state.q) +
      '" />' +
      '<select id="adminAnnInboxFilter" class="sel portal-pnlog-toolbar__sel" aria-label="Filter">' +
      '<option value="all"' +
      (state.filter === "all" ? " selected" : "") +
      ">All</option>" +
      '<option value="announcement"' +
      (state.filter === "announcement" ? " selected" : "") +
      ">Announcements</option>" +
      '<option value="films"' +
      (state.filter === "films" ? " selected" : "") +
      ">Films</option>" +
      '<option value="reminder"' +
      (state.filter === "reminder" ? " selected" : "") +
      ">Reminders</option>" +
      "</select>" +
      '<button type="button" class="btn btn--pri btn--sm" id="adminAnnInboxNewAnn">Announcement</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="adminAnnInboxNewRem">Reminder</button>' +
      '<button type="button" class="btn btn--sec btn--sm" data-open-compose data-preset="feedback_watch">Send feedback watch</button>' +
      '<button type="button" class="btn btn--sec btn--sm" data-open-compose data-preset="feedback_on_time">Send end of shift watch</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="adminAnnInboxRefresh">Refresh</button>' +
      "</div>" +
      '<div class="portal-pnlog-chat' +
      (narrow ? " portal-pnlog-chat--thread" : "") +
      '">' +
      '<aside class="portal-pnlog-chat__list"><div class="portal-pnlog-chat__list-inner">' +
      convs +
      "</div></aside>" +
      '<section class="portal-pnlog-chat__pane">' +
      paneHtml(current) +
      "</section></div>";
    var search = document.getElementById("adminAnnInboxSearch");
    if (search) {
      search.addEventListener("input", function () {
        state.q = search.value;
        render();
        var again = document.getElementById("adminAnnInboxSearch");
        if (again) {
          again.focus();
          var n = again.value.length;
          try {
            again.setSelectionRange(n, n);
          } catch (_s) {}
        }
      });
    }
    var filter = document.getElementById("adminAnnInboxFilter");
    if (filter) {
      filter.addEventListener("change", function () {
        state.filter = filter.value || "all";
        state.groupKey = "";
        state.openId = "";
        render();
      });
    }
    var newAnn = document.getElementById("adminAnnInboxNewAnn");
    if (newAnn) newAnn.addEventListener("click", function () { cfg.onNewAnnouncement(); });
    var newRem = document.getElementById("adminAnnInboxNewRem");
    if (newRem) newRem.addEventListener("click", function () { cfg.onNewReminder(); });
    var refresh = document.getElementById("adminAnnInboxRefresh");
    if (refresh) refresh.addEventListener("click", function () { void load(); });
    root.querySelectorAll("[data-ann-group]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.groupKey = btn.getAttribute("data-ann-group") || "";
        state.openId = "";
        render();
      });
    });
    root.querySelectorAll("[data-ann-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.openId = btn.getAttribute("data-ann-open") || "";
        render();
      });
    });
    root.querySelectorAll("[data-ann-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-ann-edit") || "";
        var row = null;
        state.rows.forEach(function (r) {
          if (String(r.id) === id) row = r;
        });
        if (row) cfg.onEdit(row);
      });
    });
    var back = root.querySelector("[data-ann-back]");
    if (back) {
      back.addEventListener("click", function () {
        state.groupKey = "";
        state.openId = "";
        render();
      });
    }
  }

  function loadFilmAcks(client, ids) {
    var chunks = [];
    var i;
    for (i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80));
    if (!chunks.length) return Promise.resolve([]);
    return Promise.all(chunks.map(function (chunk) {
      return client
        .from("portal_staff_announcement_acks")
        .select("announcement_id,staff_id,signed_at,staff_full_name,staff_username")
        .in("announcement_id", chunk);
    })).then(function (parts) {
      var out = [];
      parts.forEach(function (res) {
        if (res.error) throw res.error;
        out = out.concat(res.data || []);
      });
      return out;
    });
  }

  function load() {
    var root = document.getElementById("adminAnnInboxRoot");
    var client = cfg.getClient();
    if (!root) return Promise.resolve();
    if (!client || !client.from) {
      root.innerHTML = '<p class="page-intro">Sign in as admin to see announcements.</p>';
      return Promise.resolve();
    }
    var annSelect = "id,title,body,message_type,created_at,ends_at,reminder_category,audience_scope,delivery_scope,target_staff_role,target_user_id";
    return Promise.all([
      client
        .from("portal_staff_announcements")
        .select(annSelect)
        .in("message_type", ["announcement", "reminder", "schedule"])
        .order("created_at", { ascending: false })
        .limit(80),
      client
        .from("portal_staff_announcements")
        .select(annSelect)
        .in("message_type", ["feedback_watch", "feedback_on_time"])
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("portal_staff_announcement_acks")
        .select("announcement_id,staff_id,signed_at,staff_full_name,staff_username")
        .order("signed_at", { ascending: false })
        .limit(1000),
      client
        .from("staff_profiles")
        .select("id,full_name,username,app_role,staff_role,is_active")
        .limit(500),
    ]).then(function (results) {
      var ann = results[0];
      var films = results[1];
      var ack = results[2];
      var staff = results[3];
      if (ann.error) throw ann.error;
      if (films.error) throw films.error;
      if (ack.error) throw ack.error;
      state.rows = ann.data || [];
      state.films = films.data || [];
      state.staff = staff.error ? [] : staff.data || [];
      var ids = state.films.map(function (row) { return row.id; }).filter(Boolean);
      return loadFilmAcks(client, ids).then(function (filmAcks) {
        var merged = {};
        (ack.data || []).concat(filmAcks || []).forEach(function (row) {
          var key = String(row.announcement_id || "") + "|" + String(row.staff_id || "");
          var prev = merged[key];
          if (!prev || String(row.signed_at || "") > String(prev.signed_at || "")) merged[key] = row;
        });
        state.acks = Object.keys(merged).map(function (key) { return merged[key]; });
        render();
      });
    }).catch(function (err) {
      if (!document.getElementById("adminAnnInboxRoot")) return;
      root.innerHTML =
        '<p class="submission-state is-error" style="margin:0">' +
        esc(String(err && err.message ? err.message : err)) +
        "</p>";
    });
  }

  function viewHtml() {
    return (
      '<h1 class="page-title">Announcements</h1>' +
      '<div id="adminAnnInboxRoot" class="portal-pnlog-root admin-ann-inbox"><p class="muted" style="margin:0">Loading…</p></div>'
    );
  }

  function bind() {
    void load();
  }

  global.PortalAnnouncementsInbox = {
    configure: function (next) {
      cfg = Object.assign(cfg, next || {});
    },
    viewHtml: viewHtml,
    bind: bind,
    reload: load,
  };
})(window);
