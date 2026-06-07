/**
 * Portal help bot — phase 1 FAQ matching (no LLM).
 * Loads portal_help_knowledge.json and answers from the portal guide content.
 */
(function (global) {
  "use strict";

  var KNOWLEDGE_URL = "/portal/portal_help_knowledge.json?v=20260606-help-faq-v2";
  var MIN_SCORE = 5;
  var knowledge = null;
  var knowledgePromise = null;
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

  async function tryAssistAnswer(question, match, msgsHost, sugHost, data) {
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
        knowledgeForAssist(data, match)
      );
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);

      if (!res || !res.ok || !res.text) return false;

      appendBubble(
        msgsHost,
        "bot",
        "<strong>AI assistant</strong><br>" +
          formatAnswerHtml(res.text) +
          '<p class="portal-help-guide-link"><a href="portal_guide.html" target="_blank" rel="noopener">Open full guide</a></p>'
      );
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

  async function handleQuestion(raw, msgsHost, sugHost, data, ui) {
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

      var assisted = await tryAssistAnswer(q, match, msgsHost, sugHost, data);
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

    var data = await loadKnowledge();
    if (!sessionStarted || !msgsHost.children.length) {
      resetHelpSession(msgsHost, sugHost, data);
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
      void loadKnowledge().then(function (data) {
        var q = input.value;
        input.value = "";
        void handleQuestion(q, msgsHost, sugHost, data, { sendBtn: sendBtn, input: input });
      });
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
