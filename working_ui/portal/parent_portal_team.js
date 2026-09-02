/**
 * Parent portal — participant team (instructors with feedback since 1 Jun 2026).
 * Demo map from roster; replaced by API team[] when live data is wired.
 */
(function (global) {
  "use strict";

  var TEAM_FEEDBACK_SINCE = "2026-06-01";

  var STAFF_CATALOG = {
  "roberto": {
    "name": "Roberto",
    "nationality": "Italian",
    "flag": "🇮🇹",
    "speaks": [
      "Italian",
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/roberto.png",
    "bio": "Roberto brings big Italian energy and a warm smile to every session. Patient and encouraging, he loves football, good food and music — and he has a real gift for helping children feel relaxed and confident in the water."
  },
  "luliya": {
    "name": "Luliya",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "Somali",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/luliya.png",
    "bio": "Luliya is calm, kind and a wonderful listener. She loves arts and crafts, reading and swimming, and is brilliant at making every child feel safe, seen and proud of their progress."
  },
  "giuseppe": {
    "name": "Giuseppe",
    "nationality": "Italian",
    "flag": "🇮🇹",
    "speaks": [
      "Italian",
      "Arabic"
    ],
    "avatar_url": "/portal/staff_photos/giuseppe.png",
    "bio": "Giuseppe is thoughtful, playful and great at building trust. He connects easily with children who need extra time to settle, and he keeps sessions structured without losing the fun."
  },
  "bismark": {
    "name": "Bismark",
    "nationality": "Ghanaian",
    "flag": "🇬🇭",
    "speaks": [
      "English",
      "Ghanaian"
    ],
    "avatar_url": "/portal/staff_photos/bismark.png",
    "bio": "Bismark is energetic and motivating — brilliant with climbing, movement and team games. He celebrates small wins and helps children push themselves while feeling fully supported."
  },
  "godsway": {
    "name": "Godsway",
    "nationality": "Ghanaian",
    "flag": "🇬🇭",
    "speaks": [
      "English",
      "Ghanaian"
    ],
    "avatar_url": "/portal/staff_photos/godsway.png",
    "bio": "Godsway is friendly, upbeat and very reliable. He builds strong rapport with families and keeps sessions positive, active and well organised from start to finish."
  },
  "javier": {
    "name": "Javier",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/javier.png",
    "bio": "Javier is confident in the pool and clear with structure. He explains activities step by step and helps children grow their water skills with patience and praise."
  },
  "raul": {
    "name": "Raul",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/raul.png",
    "bio": "Raul leads with calm authority and a lot of heart. He is experienced across programmes and keeps sessions safe, purposeful and enjoyable for every child."
  },
  "victor": {
    "name": "Victor",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/victor.png",
    "bio": "Victor knows the club programmes inside out. He supports staff and families with high standards, clear communication and a focus on each child making real progress."
  },
  "carlos": {
    "name": "Carlos",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/carlos.png",
    "bio": "Carlos is focused and encouraging on the climbing wall. He helps children try new challenges safely and builds their confidence one hold at a time."
  },
  "andres": {
    "name": "Andres",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/andres.png",
    "bio": "Andres is enthusiastic and hands-on. He keeps groups engaged with creative activities and a steady, supportive presence throughout the session."
  },
  "angel": {
    "name": "Angel",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/angel.png",
    "bio": "Angel is warm, attentive and great in the water. He reads each child quickly and adapts the session so they feel capable and proud of what they achieve."
  },
  "aurora": {
    "name": "Aurora",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/aurora.png",
    "bio": "Aurora is gentle and observant. She creates a calm atmosphere where children can practise skills at their own pace and build real confidence in the pool."
  },
  "berta": {
    "name": "Berta",
    "nationality": "Spanish",
    "flag": "🇪🇸",
    "speaks": [
      "Spanish",
      "English"
    ],
    "avatar_url": "/portal/staff_photos/berta.png",
    "bio": "Berta is organised, caring and very experienced with complex needs. She coordinates sessions smoothly and makes sure every child gets consistent, thoughtful support."
  },
  "alex": {
    "name": "Alex",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/alex.png",
    "bio": "Alex is practical, friendly and safety-focused. He explains climbing and movement clearly and celebrates effort as much as achievement."
  },
  "dan": {
    "name": "Dan",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/dan.png",
    "bio": "Dan is easy-going and dependable in the pool. He keeps sessions flowing, supports nervous swimmers kindly and helps children enjoy being in the water."
  },
  "john": {
    "name": "John",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/john.png",
    "bio": "John is steady, professional and very child-centred. He builds trust quickly and keeps handovers clear so families always know how the session went."
  },
  "sandra": {
    "name": "Sandra",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/sandra.png",
    "bio": "Sandra is positive and encouraging in fitness and movement sessions. She helps children stay active, try new skills and feel good about their effort."
  },
  "simon": {
    "name": "Simon",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/simon.png",
    "bio": "Simon is calm and precise in the water. He breaks skills into manageable steps and gives children the time they need to succeed."
  },
  "michelle": {
    "name": "Michelle",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English"
    ],
    "avatar_url": "/portal/staff_photos/michelle.png",
    "bio": "Michelle is experienced, organised and deeply supportive. She leads sessions with clarity and kindness, especially when children need extra reassurance."
  },
  "youssef": {
    "name": "Youssef",
    "nationality": "English",
    "flag": "🇬🇧",
    "speaks": [
      "English",
      "Arabic"
    ],
    "avatar_url": "/portal/staff_photos/youssef.png",
    "bio": "Youssef is confident in aquatic sessions and very attentive to detail. He keeps children motivated while making sure technique and safety stay front and centre."
  }
};

  var DEMO_INSTRUCTOR_KEYS = {
  "abodi_p": [
    "youssef"
  ],
  "acat": [
    "roberto"
  ],
  "adaam_ah": [
    "bismark",
    "dan",
    "godsway",
    "roberto"
  ],
  "adam_ab": [
    "aurora",
    "berta",
    "dan",
    "giuseppe",
    "javier",
    "john"
  ],
  "adam_me": [
    "javier"
  ],
  "adam_pi": [
    "angel",
    "roberto"
  ],
  "amaar_ah": [
    "bismark",
    "godsway",
    "roberto"
  ],
  "amar_ra": [
    "roberto"
  ],
  "amber": [
    "roberto"
  ],
  "amir": [
    "angel"
  ],
  "aqsa": [
    "aurora",
    "dan"
  ],
  "arthur_ma": [
    "aurora",
    "berta",
    "dan",
    "john"
  ],
  "arthur_mo": [
    "bismark",
    "godsway",
    "roberto"
  ],
  "ayaan": [
    "sandra"
  ],
  "aydaan_ah": [
    "aurora",
    "berta",
    "dan",
    "john"
  ],
  "ayden_w": [
    "alex",
    "andres"
  ],
  "ayman": [
    "javier"
  ],
  "bediako": [
    "aurora"
  ],
  "cayra": [
    "angel"
  ],
  "chaitanya_trial_28_06": [
    "carlos"
  ],
  "cyrus": [
    "aurora",
    "berta",
    "dan",
    "giuseppe",
    "javier",
    "john",
    "victor"
  ],
  "eddie": [
    "youssef"
  ],
  "elia": [
    "alex",
    "andres",
    "angel",
    "aurora",
    "berta",
    "bismark",
    "carlos",
    "dan",
    "giuseppe",
    "godsway",
    "javier",
    "john",
    "luliya",
    "michelle",
    "raul",
    "roberto",
    "sandra",
    "simon",
    "victor",
    "youssef"
  ],
  "eiji": [
    "alex",
    "bismark",
    "giuseppe",
    "javier",
    "roberto",
    "simon"
  ],
  "elijah": [
    "aurora",
    "dan",
    "roberto"
  ],
  "emani": [
    "youssef"
  ],
  "emanuel": [
    "michelle",
    "victor",
    "youssef"
  ],
  "erik": [
    "aurora",
    "berta",
    "dan",
    "john"
  ],
  "fadi": [
    "roberto",
    "youssef"
  ],
  "faris": [
    "aurora",
    "dan"
  ],
  "gabriel": [
    "bismark",
    "godsway",
    "roberto"
  ],
  "gemma": [
    "dan"
  ],
  "haneef": [
    "giuseppe",
    "javier"
  ],
  "hazem": [
    "aurora",
    "bismark",
    "carlos",
    "dan",
    "giuseppe",
    "javier",
    "roberto"
  ],
  "ikram": [
    "luliya",
    "youssef"
  ],
  "jack_s": [
    "bismark",
    "godsway",
    "roberto"
  ],
  "jack_w": [
    "aurora",
    "berta",
    "dan",
    "john"
  ],
  "jad": [
    "roberto"
  ],
  "joel": [
    "youssef"
  ],
  "junaid": [
    "aurora"
  ],
  "kareena": [
    "javier"
  ],
  "karo": [
    "javier"
  ],
  "kayden": [
    "javier"
  ],
  "khalid_ab": [
    "javier"
  ],
  "linda": [
    "javier"
  ],
  "logan": [
    "youssef"
  ],
  "maiyar": [
    "aurora",
    "dan"
  ],
  "mario": [
    "angel"
  ],
  "matthias": [
    "youssef"
  ],
  "max": [
    "javier"
  ],
  "mia": [
    "dan"
  ],
  "mohammed": [
    "roberto"
  ],
  "no_participant": [
    "dan",
    "simon",
    "youssef"
  ],
  "patrick": [
    "bismark",
    "carlos"
  ],
  "rayan_ta": [
    "angel"
  ],
  "rayyan_fi": [
    "giuseppe",
    "javier",
    "youssef"
  ],
  "richard": [
    "angel"
  ],
  "rodin": [
    "alex",
    "andres",
    "roberto"
  ],
  "ruben": [
    "dan"
  ],
  "saaib": [
    "youssef"
  ],
  "samer": [
    "giuseppe",
    "javier"
  ],
  "scott": [
    "alex",
    "andres",
    "berta",
    "raul",
    "youssef"
  ],
  "serine": [
    "bismark",
    "carlos",
    "roberto",
    "sandra"
  ],
  "shaan": [
    "javier"
  ],
  "shire": [
    "javier"
  ],
  "simon": [
    "aurora",
    "dan"
  ],
  "stephanie": [
    "berta",
    "raul",
    "youssef"
  ],
  "steven_c": [
    "angel"
  ],
  "thushyan": [
    "simon"
  ],
  "timi": [
    "raul",
    "victor"
  ],
  "tinashe": [
    "bismark",
    "john"
  ],
  "tom": [
    "roberto"
  ],
  "tyson": [
    "dan"
  ],
  "vithura": [
    "roberto"
  ],
  "yamik": [
    "roberto"
  ],
  "yassir": [
    "roberto"
  ],
  "yoan": [
    "roberto"
  ],
  "yossi": [
    "roberto"
  ],
  "yunis": [
    "roberto"
  ],
  "yuri": [
    "simon"
  ],
  "yusuf_ah": [
    "alex",
    "andres",
    "bismark",
    "godsway",
    "roberto"
  ],
  "zaid": [
    "bismark",
    "carlos",
    "giuseppe",
    "javier"
  ],
  "zakariya": [
    "aurora",
    "bismark",
    "carlos",
    "dan"
  ],
  "zayana": [
    "dan"
  ]
};

  function slugifyParticipantName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function participantSlug(data) {
    var p = (data && data.participant) || {};
    var cid = String(p.contact_id || "").trim();
    var display = String(p.display_name || p.first_name || "").trim();
    if (cid === "105" || /amaar/i.test(display)) return "amaar_ah";
    if (cid === "125" || /aydaan/i.test(display)) return "aydaan_ah";
    if (cid === "124" || /aadam/i.test(display)) return "adaam_ah";
    if (cid === "elia-matilla-demo" || /^elia\b/i.test(display)) return "elia";
    if (/^eiji\b/i.test(display)) return "eiji";
    if (/^hazem\b/i.test(display)) return "hazem";
    var name = display;
    var slug = "";
    if (
      typeof global.PortalParticipantIdentity !== "undefined" &&
      typeof global.PortalParticipantIdentity.canonicalClientId === "function"
    ) {
      slug = global.PortalParticipantIdentity.canonicalClientId(name);
    } else {
      slug = slugifyParticipantName(name);
    }
    if (slug === "amaar_ahmed") return "amaar_ah";
    if (slug === "aydaan_ahmed") return "aydaan_ah";
    if (slug === "aadam_ahmed") return "adaam_ah";
    if (slug === "adam_abed") return "adam_ab";
    if (slug === "elia_matilla" || slug.indexOf("elia_") === 0) return "elia";
    if (slug === "eiji" || slug.indexOf("eiji_") === 0) return "eiji";
    if (slug === "hazem" || slug.indexOf("hazem_") === 0) return "hazem";
    return slug;
  }

  function staffKeyFromFeedbackName(name) {
    var k = String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ");
    if (!k) return "";
    k = k.split(/\s+/)[0] || "";
    if (k === "yousef" || k === "yusef") k = "youssef";
    if (k === "lulia") k = "luliya";
    if (k === "javi") k = "javier";
    return k;
  }

  function memberFromFeedbackName(name) {
    return catalogMember(staffKeyFromFeedbackName(name));
  }

  function teamFromSessions(data) {
    var sessions = (data && data.sessions) || [];
    if (!Array.isArray(sessions) || !sessions.length) return [];
    var seen = {};
    var out = [];
    sessions.forEach(function (session) {
      var date = String((session && session.session_date) || "").slice(0, 10);
      if (!date || date < TEAM_FEEDBACK_SINCE) return;
      var key = staffKeyFromFeedbackName(
        (session && (session.feedback_by_name || session.completed_by_name)) || "",
      );
      if (!key || seen[key]) return;
      var card = catalogMember(key);
      if (!card) return;
      seen[key] = true;
      out.push(card);
    });
    out.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return out;
  }

  /**
   * One instructor for a booked aquatic slot (not the whole pool pair).
   * Northolt Mon 4.30–5 trials / open band → Dan (ops standing).
   */
  function normalizeSlotTimeToken(time) {
    return String(time || "")
      .toLowerCase()
      .replace(/[:.]/g, ".")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function standingInstructorKeyForBookedSlot(slot, data) {
    if (!slot) return "";
    var venue = String(slot.venue || slot.area || "").toLowerCase();
    var dayTok = dayTokenFromIsoOrLabel(slot.iso, slot.day);
    var time = normalizeSlotTimeToken(slot.time || slot.time_label || "");
    var kind = String(slot.kind || "").toLowerCase();
    var isTrial =
      kind === "trial" ||
      (data && (data.is_trial_booking === true || data.place_kind === "trial"));

    if (/northolt/.test(venue) && dayTok === "mon") {
      /* Trial / first band 4.30–5 → Dan (see autumn crossref). */
      if (isTrial || /^4\.?30\s+to\s+5(\.00)?$/.test(time) || time === "4.30 to 5") {
        return "dan";
      }
      if (/^5\s+to\s+5\.?30$/.test(time)) return "luliya";
      if (/^5\.?30\s+to\s+6(\.00)?$/.test(time)) return "luliya";
      if (/^5\s+to\s+6(\.00)?$/.test(time)) return "dan";
      if (/^6\s+to\s+6\.?30$/.test(time)) {
        var pax = String(
          (data && data.participant && (data.participant.display_name || data.participant.first_name)) ||
            "",
        )
          .toLowerCase()
          .trim();
        if (/yamik/.test(pax)) return "luliya";
        return "dan";
      }
      return "dan";
    }

    if (/northolt/.test(venue) && dayTok === "wed") {
      if (/^4\.?30\s+to\s+5/.test(time)) {
        var paxW = String(
          (data && data.participant && (data.participant.display_name || data.participant.first_name)) ||
            "",
        )
          .toLowerCase()
          .trim();
        if (/vithura/.test(paxW)) return "luliya";
        return "dan";
      }
      if (/^5\s+to\s+5\.?30$/.test(time)) return "dan";
      if (/^5\s+to\s+6/.test(time)) return "dan";
      if (/^5\.?30\s+to\s+6/.test(time)) return "dan";
      if (/^6\s+to\s+6\.?30$/.test(time)) return "luliya";
      return "dan";
    }

    if (/acton/.test(venue) && (dayTok === "tue" || dayTok === "thu")) {
      /* Prefer named instructor when API sends it; else do not invent the full pool. */
      var named = staffKeyFromFeedbackName(slot.instructor || slot.staff || "");
      if (named && STAFF_CATALOG[named]) return named;
      return "";
    }

    if (/westway/.test(venue)) return "sandra";
    return "";
  }

  function dayTokenFromIsoOrLabel(iso, dayLabel) {
    var raw = String(dayLabel || "").trim().toLowerCase();
    if (/^mon/.test(raw)) return "mon";
    if (/^tue/.test(raw)) return "tue";
    if (/^wed/.test(raw)) return "wed";
    if (/^thu/.test(raw)) return "thu";
    if (/^fri/.test(raw)) return "fri";
    if (/^sat/.test(raw)) return "sat";
    if (/^sun/.test(raw)) return "sun";
    var s = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
    var parts = s.split("-");
    var dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(dt.getTime())) return "";
    return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dt.getDay()] || "";
  }

  function teamFromStandingPool(data) {
    var seen = {};
    var keys = [];
    function pushKey(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      keys.push(k);
    }
    var upcoming =
      data && Array.isArray(data.upcoming_booked_sessions) ? data.upcoming_booked_sessions : [];
    upcoming.forEach(function (s) {
      pushKey(standingInstructorKeyForBookedSlot(s, data));
    });
    if (!keys.length) {
      var detail =
        data && data.general && Array.isArray(data.general.services_detail)
          ? data.general.services_detail
          : [];
      detail.forEach(function (s) {
        if (!s) return;
        var label = String(s.label || s.service || "").toLowerCase();
        if (label && !/aquatic|swim|pool/.test(label)) return;
        pushKey(
          standingInstructorKeyForBookedSlot(
            {
              venue: s.venue || s.area,
              day: s.day,
              time: s.time || s.time_slot || s.slot,
              kind: data && data.place_kind === "trial" ? "trial" : "",
            },
            data,
          ),
        );
      });
    }
    return keys.map(catalogMember).filter(Boolean);
  }

  function catalogMember(key) {
    var k = String(key || "").trim().toLowerCase();
    if (k === "javi") k = "javier";
    if (k === "lulia") k = "luliya";
    if (k === "yousef" || k === "yusef") k = "youssef";
    if (!k || !STAFF_CATALOG[k]) return null;
    var card = Object.assign({ staff_key: k }, STAFF_CATALOG[k]);
    if (card.avatar_url && card.avatar_url.indexOf("?") === -1) {
      card.avatar_url = card.avatar_url + "?v=20260710-team-photos";
    }
    return card;
  }

  function mergeTeamMember(base, patch) {
    var out = Object.assign({}, base || {}, patch || {});
    if (Array.isArray(patch && patch.speaks) && patch.speaks.length) {
      out.speaks = patch.speaks.slice();
    } else if (base && Array.isArray(base.speaks)) {
      out.speaks = base.speaks.slice();
    }
    /* Catalog is source of truth for photos / bio / nationality when present */
    if (base) {
      if (base.avatar_url) out.avatar_url = base.avatar_url;
      if (base.bio) out.bio = base.bio;
      if (base.nationality) out.nationality = base.nationality;
      if (base.flag) out.flag = base.flag;
      if (base.name) out.name = base.name;
      if (base.staff_key) out.staff_key = base.staff_key;
    }
    return out;
  }

  function demoKeysForParticipant(data) {
    var slug = participantSlug(data);
    var keys = DEMO_INSTRUCTOR_KEYS[slug];
    return Array.isArray(keys) ? keys.slice() : [];
  }

  function resolveTeam(data) {
    var seen = {};
    var out = [];
    function addCard(card) {
      if (!card) return;
      var k = String(card.staff_key || staffKeyFromFeedbackName(card.name) || "")
        .trim()
        .toLowerCase();
      if (!k) return;
      if (seen[k]) return;
      seen[k] = true;
      out.push(card);
    }

    if (data && Array.isArray(data.team)) {
      data.team.forEach(function (m) {
        if (!m) return;
        var key = staffKeyFromFeedbackName(
          m.staff_key || m.key || m.username || m.name || "",
        );
        addCard(mergeTeamMember(catalogMember(key), Object.assign({ staff_key: key }, m)));
      });
    }
    if (!out.length) {
      teamFromSessions(data).forEach(addCard);
    }
    /* Trial / new place: standing pool instructors before any session feedback. */
    if (!out.length) {
      teamFromStandingPool(data).forEach(addCard);
    }
    /* Roster demo map fills gaps (and covers empty live team) for known children */
    demoKeysForParticipant(data).forEach(function (key) {
      addCard(catalogMember(key));
    });
    out.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return out;
  }

  global.PortalParentTeam = {
    TEAM_FEEDBACK_SINCE: TEAM_FEEDBACK_SINCE,
    resolveTeam: resolveTeam,
    participantSlug: participantSlug,
    catalogMember: catalogMember,
    memberFromFeedbackName: memberFromFeedbackName,
    staffKeyFromFeedbackName: staffKeyFromFeedbackName,
  };
})(typeof window !== "undefined" ? window : global);
