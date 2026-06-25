/**
 * Portal help bot — phase 1 FAQ matching (no LLM).
 * Loads portal_help_knowledge.json and answers from the portal guide content.
 */
(function (global) {
  "use strict";

  var KNOWLEDGE_URL = "/portal/portal_help_knowledge.json?v=20260614-no-menu-guide";
  var AGENT_GUIDE_URL = "/portal/portal_help_agent_guide.json?v=20260625-voice-agent";
  var MIN_SCORE = 5;
  var knowledge = null;
  var knowledgePromise = null;
  var agentGuide = null;
  var agentGuidePromise = null;
  var sessionStarted = false;

  var STOP_WORDS = {
    how: 1,
    do: 1,
    i: 1,
    the: 1,
    a: 1,
    an: 1,
    to: 1,
    where: 1,
    is: 1,
    what: 1,
    can: 1,
    my: 1,
    me: 1,
    of: 1,
    on: 1,
    in: 1,
    at: 1,
    for: 1,
    and: 1,
    or: 1,
    de: 1,
    como: 1,
    donde: 1,
    que: 1,
    el: 1,
    la: 1,
    los: 1,
    las: 1,
    un: 1,
    una: 1,
    por: 1,
    con: 1,
  };

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function loadKnowledge() {
    if (knowledge) return Promise.resolve(knowledge);
    if (knowledgePromise) return knowledgePromise;
    knowledgePromise = fetch(KNOWLEDGE_URL, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("help knowledge fetch failed");
        return res.json();
      })
      .then(function (data) {
        knowledge = data && Array.isArray(data.topics) ? data : { topics: [] };
        return knowledge;
      })
      .catch(function () {
        knowledge = { topics: [] };
        return knowledge;
      });
    return knowledgePromise;
  }

  function loadAgentGuide() {
    if (agentGuide) return Promise.resolve(agentGuide);
    if (agentGuidePromise) return agentGuidePromise;
    agentGuidePromise = fetch(AGENT_GUIDE_URL, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("agent guide fetch failed");
        return res.json();
      })
      .then(function (data) {
        agentGuide = data && Array.isArray(data.sections) ? data : { sections: [] };
        return agentGuide;
      })
      .catch(function () {
        agentGuide = { sections: [] };
        return agentGuide;
      });
    return agentGuidePromise;
  }

  function loadHelpSources() {
    return Promise.all([loadKnowledge(), loadAgentGuide()]).then(function (pair) {
      return { knowledge: pair[0], agentGuide: pair[1] };
    });
  }

  function scoreTopic(queryNorm, tokens, topic) {
    var score = 0;
    var titleNorm = normalize(topic.title);
    var i;
    var kw;
    var nk;

    for (i = 0; i < topic.keywords.length; i++) {
      kw = topic.keywords[i];
      nk = normalize(kw);
      if (!nk) continue;
      if (queryNorm.indexOf(nk) !== -1) {
        score += nk.indexOf(" ") !== -1 ? 10 : 5;
      }
    }

    for (i = 0; i < tokens.length; i++) {
      if (titleNorm.indexOf(tokens[i]) !== -1) score += 3;
      for (var j = 0; j < topic.keywords.length; j++) {
        nk = normalize(topic.keywords[j]);
        if (!nk) continue;
        if (nk.indexOf(tokens[i]) !== -1 || tokens[i].indexOf(nk) !== -1) score += 4;
      }
    }

    if (queryNorm.indexOf(normalize(topic.id).replace(/-/g, " ")) !== -1) score += 6;
    return score;
  }

  function portalHelpMatchQuestion(question, data) {
    var queryNorm = normalize(question);
    if (!queryNorm) return { ok: false, reason: "empty" };

    var tokens = queryNorm
      .split(" ")
      .filter(function (t) {
        return t.length > 1 && !STOP_WORDS[t];
      });

    var topics = (data && data.topics) || [];
    var best = null;
    var bestScore = 0;
    var ranked = [];

    for (var i = 0; i < topics.length; i++) {
      var sc = scoreTopic(queryNorm, tokens, topics[i]);
      if (sc > 0) ranked.push({ topic: topics[i], score: sc });
      if (sc > bestScore) {
        bestScore = sc;
        best = topics[i];
      }
    }

    ranked.sort(function (a, b) {
      return b.score - a.score;
    });

    if (best && bestScore >= MIN_SCORE) {
      return {
        ok: true,
        topic: best,
        score: bestScore,
        suggestions: ranked.slice(1, 4).map(function (r) {
          return r.topic;
        }),
      };
    }

    return {
      ok: false,
      score: bestScore,
      bestGuess: best,
      suggestions: ranked.slice(0, 4).map(function (r) {
        return r.topic;
      }),
    };
  }

  global.portalHelpMatchQuestion = portalHelpMatchQuestion;

  function formatAnswerHtml(answer) {
    return escapeHtml(answer).replace(/\n/g, "<br>");
  }

  function scoreGuideSection(queryNorm, tokens, section) {
    var score = 0;
    var titleNorm = normalize(section.title);
    var i;
    var kw;
    var nk;
    var keywords = Array.isArray(section.keywords) ? section.keywords : [];

    for (i = 0; i < keywords.length; i++) {
      kw = keywords[i];
      nk = normalize(kw);
      if (!nk) continue;
      if (queryNorm.indexOf(nk) !== -1) {
        score += nk.indexOf(" ") !== -1 ? 10 : 5;
      }
    }

    for (i = 0; i < tokens.length; i++) {
      if (titleNorm.indexOf(tokens[i]) !== -1) score += 3;
      for (var j = 0; j < keywords.length; j++) {
        nk = normalize(keywords[j]);
        if (!nk) continue;
        if (nk.indexOf(tokens[i]) !== -1 || tokens[i].indexOf(nk) !== -1) score += 4;
      }
    }

    if (section.id && queryNorm.indexOf(normalize(String(section.id)).replace(/-/g, " ")) !== -1) {
      score += 6;
    }
    return score;
  }

  function guideSectionsForAssist(question, guideData, match) {
    var queryNorm = normalize(question);
    var tokens = queryNorm
      .split(" ")
      .filter(function (t) {
        return t.length > 1 && !STOP_WORDS[t];
      });
    var sections = (guideData && guideData.sections) || [];
    var ranked = [];
    var i;

    for (i = 0; i < sections.length; i++) {
      var sc = scoreGuideSection(queryNorm, tokens, sections[i]);
      if (sc > 0) ranked.push({ section: sections[i], score: sc });
    }
    ranked.sort(function (a, b) {
      return b.score - a.score;
    });

    if (!ranked.length && match && match.bestGuess && match.bestGuess.id) {
      var guessId = String(match.bestGuess.id || "");
      for (i = 0; i < sections.length; i++) {
        if (String(sections[i].id || "") === guessId) {
          ranked.push({ section: sections[i], score: 1 });
          break;
        }
      }
    }

    if (!ranked.length) {
      ranked = sections.slice(0, 6).map(function (section) {
        return { section: section, score: 0 };
      });
    }

    return ranked.slice(0, 6).map(function (row) {
      var s = row.section;
      return {
        id: String(s.id || ""),
        title: String(s.title || ""),
        content: String(s.content || "").slice(0, 1800),
        illustrations: Array.isArray(s.illustrations) ? s.illustrations.slice(0, 6) : [],
      };
    });
  }

  function illustrationCaption(guideData, src) {
    var want = String(src || "").trim();
    if (!want) return "";
    var sections = (guideData && guideData.sections) || [];
    for (var i = 0; i < sections.length; i++) {
      var ill = sections[i].illustrations;
      if (!Array.isArray(ill)) continue;
      for (var j = 0; j < ill.length; j++) {
        if (String(ill[j].src || "") === want) {
          return String(ill[j].caption || "").trim();
        }
      }
    }
    return "";
  }

  function guideUrlForSection(sectionId) {
    var base = "portal_guide.html";
    var id = String(sectionId || "").trim();
    return id ? base + "#" + encodeURIComponent(id) : base;
  }

  function escapeAttr(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function buildAssistBubbleHtml(res, guideData) {
    var html =
      "<strong>AI assistant</strong><br>" + formatAnswerHtml(res.text || "");
    var ill = String(res.illustration || "").trim();
    if (ill.indexOf("/portal/") === 0) {
      var cap = illustrationCaption(guideData, ill);
      html +=
        '<figure class="portal-help-illustration"><img src="' +
        escapeHtml(ill) +
        '" alt="" loading="lazy" decoding="async" />';
      if (cap) {
        html +=
          '<figcaption class="portal-help-illustration__caption muted">' +
          escapeHtml(cap) +
          "</figcaption>";
      }
      html += "</figure>";
    }
    html +=
      '<p class="portal-help-guide-link"><a href="' +
      escapeHtml(guideUrlForSection(res.sectionId)) +
      '" target="_blank" rel="noopener">Open guide section</a></p>';
    if (res.speakText && global.speechSynthesis) {
      html +=
        '<button type="button" class="portal-help-listen-btn" data-speak="' +
        escapeAttr(res.speakText) +
        '">Listen</button>';
    }
    return html;
  }

  function appendBubble(host, role, html) {
    if (!host) return;
    var row = document.createElement("div");
    row.className =
      "portal-help-msg portal-help-msg--" + (role === "user" ? "user" : "bot");
    row.innerHTML =
      '<div class="portal-help-bubble">' +
      html +
      "</div>";
    host.appendChild(row);
    host.scrollTop = host.scrollHeight;
  }

  function renderSuggestions(host, topics, onPick) {
    if (!host) return;
    host.innerHTML = "";
    if (!topics || !topics.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var label = document.createElement("p");
    label.className = "portal-help-suggestions__label muted";
    label.textContent = "Try one of these:";
    host.appendChild(label);
    var row = document.createElement("div");
    row.className = "portal-help-suggestions__row";
    topics.forEach(function (topic) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-help-chip";
      btn.textContent = topic.title;
      btn.addEventListener("click", function () {
        onPick(topic);
      });
      row.appendChild(btn);
    });
    host.appendChild(row);
  }

  function starterTopics(data) {
    var ids = ["login", "feedback", "logo-halo", "participants", "quick-menu", "install"];
    var map = {};
    (data.topics || []).forEach(function (t) {
      map[t.id] = t;
    });
    return ids.map(function (id) {
      return map[id];
    }).filter(Boolean);
  }

  function knowledgeForAssist(data, match) {
    var topics = (data && data.topics) || [];
    var picked = [];
    var i;
    if (match && match.suggestions && match.suggestions.length) {
      for (i = 0; i < match.suggestions.length && picked.length < 6; i++) {
        picked.push(match.suggestions[i]);
      }
    }
    if (match && match.bestGuess && picked.indexOf(match.bestGuess) === -1) {
      picked.unshift(match.bestGuess);
    }
    if (!picked.length) {
      picked = topics.slice(0, 8);
    }
    return picked.slice(0, 8).map(function (t) {
      return {
        title: String(t.title || ""),
        answer: String(t.answer || "").slice(0, 900),
      };
    });
  }

  function configureAssistOnce() {
    if (global.__portalOpenAiAssistConfigured || !global.PortalOpenAiAssist) return;
    global.__portalOpenAiAssistConfigured = true;
    global.PortalOpenAiAssist.configure({
      getClient: function () {
        var box = global.__PORTAL_SUPABASE__;
        return box && box.client ? box.client : null;
      },
      getSupabaseUrl: function () {
        var u = typeof global.SUPABASE_URL === "string" ? global.SUPABASE_URL.trim() : "";
        return u || "https://cklpnwhlqsulpmkipmqb.supabase.co";
      },
      getAnonKey: function () {
        return typeof global.SUPABASE_ANON_KEY === "string" ? global.SUPABASE_ANON_KEY : "";
      },
    });
  }

  async function tryAssistAnswer(question, match, msgsHost, sugHost, data, guideData) {
    if (!global.PortalOpenAiAssist) return false;
    try {
      configureAssistOnce();
      var avail = await global.PortalOpenAiAssist.probe(true);
      if (!avail.openai) return false;

      appendBubble(
        msgsHost,
        "bot",
        '<span class="muted">Thinking…</span>'
      );
      var thinking = msgsHost && msgsHost.lastElementChild;

      var res = await global.PortalOpenAiAssist.helpAnswer(
        question,
        knowledgeForAssist(data, match),
        guideSectionsForAssist(question, guideData, match)
      );
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);

      if (!res || !res.ok || !res.text) return false;

      appendBubble(msgsHost, "bot", buildAssistBubbleHtml(res, guideData));
      renderSuggestions(
        sugHost,
        match.suggestions && match.suggestions.length
          ? match.suggestions
          : starterTopics(data),
        function (topic) {
          appendBubble(msgsHost, "user", escapeHtml(topic.title));
          answerTopic(topic, msgsHost, sugHost);
        }
      );
      return true;
    } catch (_err) {
      return false;
    }
  }

  async function logUnanswered(question, match) {
    try {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      var profile = box && box.staff_profile;
      var session = box && box.session;
      var uid =
        (profile && profile.id) ||
        (session && session.user && session.user.id) ||
        "";
      if (!client || !uid || !client.from) return;
      await client.from("portal_help_unanswered_log").insert([
        {
          staff_id: uid,
          staff_full_name: String((profile && profile.full_name) || "").trim() || null,
          question_text: String(question).slice(0, 2000),
          best_guess_id: (match && match.bestGuess && match.bestGuess.id) || null,
          best_score: (match && match.score) || 0,
        },
      ]);
    } catch (_) {}
  }

  function answerTopic(topic, msgsHost, sugHost) {
    appendBubble(
      msgsHost,
      "bot",
      "<strong>" +
        escapeHtml(topic.title) +
        "</strong><br>" +
        formatAnswerHtml(topic.answer) +
        '<p class="portal-help-guide-link"><a href="portal_guide.html" target="_blank" rel="noopener">Open full guide</a></p>'
    );
    renderSuggestions(sugHost, [], function () {});
  }

  async function handleQuestion(raw, msgsHost, sugHost, data, guideData, ui) {
    var q = String(raw || "").trim();
    if (!q) return;
    if (ui && ui.sendBtn) ui.sendBtn.disabled = true;
    if (ui && ui.input) ui.input.disabled = true;
    try {
      appendBubble(msgsHost, "user", escapeHtml(q));
      var match = portalHelpMatchQuestion(q, data);
      if (match.ok && match.topic) {
        answerTopic(match.topic, msgsHost, sugHost);
        if (match.suggestions && match.suggestions.length) {
          renderSuggestions(sugHost, match.suggestions, function (topic) {
            appendBubble(msgsHost, "user", escapeHtml(topic.title));
            answerTopic(topic, msgsHost, sugHost);
          });
        }
        return;
      }

      var assisted = await tryAssistAnswer(q, match, msgsHost, sugHost, data, guideData);
      if (assisted) {
        await logUnanswered(q, match);
        return;
      }

      appendBubble(
        msgsHost,
        "bot",
        "I could not find an exact match yet. Try rephrasing, pick a topic below, or open the " +
          '<a href="portal_guide.html" target="_blank" rel="noopener">full Portal guide</a>. ' +
          "Your question was saved so we can improve answers."
      );
      await logUnanswered(q, match);
      renderSuggestions(sugHost, match.suggestions && match.suggestions.length ? match.suggestions : starterTopics(data), function (topic) {
        appendBubble(msgsHost, "user", escapeHtml(topic.title));
        answerTopic(topic, msgsHost, sugHost);
      });
    } catch (_err) {
      appendBubble(
        msgsHost,
        "bot",
        "Something went wrong — try again or open the " +
          '<a href="portal_guide.html" target="_blank" rel="noopener">Portal guide</a>.'
      );
    } finally {
      if (ui && ui.sendBtn) ui.sendBtn.disabled = false;
      if (ui && ui.input) {
        ui.input.disabled = false;
        try {
          ui.input.focus();
        } catch (_e2) {}
      }
    }
  }

  function resetHelpSession(msgsHost, sugHost, data) {
    if (!msgsHost) return;
    msgsHost.innerHTML = "";
    appendBubble(
      msgsHost,
      "bot",
      "Hi — ask about login, the dashboard, feedback, announcements, My participants, timesheets or installing CS Portal. When FAQ does not match, AI can help if enabled."
    );
    renderSuggestions(sugHost, starterTopics(data), function (topic) {
      appendBubble(msgsHost, "user", escapeHtml(topic.title));
      answerTopic(topic, msgsHost, sugHost);
    });
  }

  global.portalHelpBotOnOpen = async function portalHelpBotOnOpen() {
    var sheet = global.document && global.document.getElementById("portalHelpSheet");
    var msgsHost = global.document && global.document.getElementById("portalHelpMessages");
    var sugHost = global.document && global.document.getElementById("portalHelpSuggestions");
    var input = global.document && global.document.getElementById("portalHelpInput");
    if (!sheet || !msgsHost) return;

    var data = await loadHelpSources();
    if (!sessionStarted || !msgsHost.children.length) {
      resetHelpSession(msgsHost, sugHost, data.knowledge);
      sessionStarted = true;
    }
    if (input) {
      try {
        input.focus();
      } catch (_) {}
    }
  };

  function bindHelpBot() {
    var sheet = global.document && global.document.getElementById("portalHelpSheet");
    var sendBtn = global.document && global.document.getElementById("portalHelpSendBtn");
    var input = global.document && global.document.getElementById("portalHelpInput");
    var msgsHost = global.document && global.document.getElementById("portalHelpMessages");
    var sugHost = global.document && global.document.getElementById("portalHelpSuggestions");

    if (!sheet || !sendBtn || !input || !msgsHost) return;

    if (global.MutationObserver) {
      var obs = new global.MutationObserver(function () {
        if (sheet.classList.contains("open")) {
          void global.portalHelpBotOnOpen();
        }
      });
      obs.observe(sheet, { attributes: true, attributeFilter: ["class"] });
    }

    sendBtn.addEventListener("click", function () {
      void loadHelpSources().then(function (sources) {
        var q = input.value;
        input.value = "";
        void handleQuestion(q, msgsHost, sugHost, sources.knowledge, sources.agentGuide, {
          sendBtn: sendBtn,
          input: input,
        });
      });
    });

    msgsHost.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".portal-help-listen-btn") : null;
      if (!btn || !global.speechSynthesis) return;
      var text = btn.getAttribute("data-speak") || "";
      if (!text) return;
      try {
        global.speechSynthesis.cancel();
      } catch (_c) {}
      var utt = new global.SpeechSynthesisUtterance(text);
      utt.lang = /[áéíóúñ¿¡]/i.test(text) ? "es-ES" : "en-GB";
      try {
        global.speechSynthesis.speak(utt);
      } catch (_s) {}
    });

    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        sendBtn.click();
      }
    });
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", bindHelpBot);
    } else {
      bindHelpBot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
