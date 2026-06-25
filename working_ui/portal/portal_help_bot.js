/**
 * Portal help bot — phase 1 FAQ matching (no LLM).
 * Loads portal_help_knowledge.json and answers from the portal guide content.
 */
(function (global) {
  "use strict";

  var KNOWLEDGE_URL = "/portal/portal_help_knowledge.json?v=20260625-help-guide-v2";
  var AGENT_GUIDE_URL = "/portal/portal_help_agent_guide.json?v=20260625-help-guide-v4";
  var MIN_SCORE = 5;
  var knowledge = null;
  var knowledgePromise = null;
  var agentGuide = null;
  var agentGuidePromise = null;
  var sessionStarted = false;
  var chatSessionStarted = false;

  var PORTAL_HELP_INTRO_SPEAK =
    "Hello. I'm the clubSENsational Portal help chatbot. " +
    "Type or ask me anything — login, the dashboard, feedback, timesheets, announcements, participants and more. I'm here to help.";

  var PORTAL_HELP_INTRO_HTML =
    "<strong>clubSENsational Portal help</strong><br>" +
    "I'm your chatbot for using the portal. Type a question below or tap a topic — login, feedback, timesheets, announcements, My participants and more.";

  var PORTAL_CHAT_INTRO_SPEAK =
    "Hello. I'm the clubSENsational chat bot. " +
    "Tap the microphone and ask me anything about the portal. I will answer with voice.";

  var PORTAL_CHAT_INTRO_HTML =
    "<strong>clubSENsational Chat bot</strong><br>" +
    "Tap the microphone, speak, then tap again to send. I will answer with voice.";

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

  function plainTextFromHtml(html) {
    var div = global.document ? global.document.createElement("div") : null;
    if (!div) return String(html || "");
    div.innerHTML = String(html || "");
    return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
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
    var base = "portal_help_guide.html";
    var id = String(sectionId || "").trim();
    return id ? base + "#" + encodeURIComponent(id) : base;
  }

  function escapeAttr(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function listenButtonHtml(text, surface) {
    var t = String(text || "").trim();
    if (!t) return "";
    if (!(global.speechSynthesis || global.PortalHelpVoiceSpeak)) return "";
    var cls = surface === "chat" ? "portal-chat-listen-btn" : "portal-help-listen-btn";
    var label = surface === "chat" ? "Listen again" : "Listen";
    return (
      '<button type="button" class="' +
      cls +
      '" data-speak="' +
      escapeAttr(t) +
      '">' +
      label +
      "</button>"
    );
  }

  function surfaceUi(surface) {
    if (surface === "chat") {
      return {
        msg: "portal-chat-msg",
        bubble: "portal-chat-bubble",
        sug: "portal-chat-suggestions",
        sugLabel: "portal-chat-suggestions__label",
        sugRow: "portal-chat-suggestions__row",
        chip: "portal-chat-chip",
        listen: "portal-chat-listen-btn",
        ill: "portal-help-illustration",
        guideLink: "portal-help-guide-link",
      };
    }
    return {
      msg: "portal-help-msg",
      bubble: "portal-help-bubble",
      sug: "portal-help-suggestions",
      sugLabel: "portal-help-suggestions__label",
      sugRow: "portal-help-suggestions__row",
      chip: "portal-help-chip",
      listen: "portal-help-listen-btn",
      ill: "portal-help-illustration",
      guideLink: "portal-help-guide-link",
    };
  }

  function buildAssistBubbleHtml(res, guideData, surface) {
    var ui = surfaceUi(surface);
    var html =
      surface === "chat"
        ? formatAnswerHtml(res.text || "")
        : "<strong>AI assistant</strong><br>" + formatAnswerHtml(res.text || "");
    var ill = String(res.illustration || "").trim();
    if (ill.indexOf("/portal/") === 0) {
      var cap = illustrationCaption(guideData, ill);
      html +=
        '<figure class="' + ui.ill + '"><img src="' +
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
    if (surface !== "chat") {
      html +=
        '<p class="' + ui.guideLink + '"><a href="' +
        escapeHtml(guideUrlForSection(res.sectionId)) +
        '" target="_blank" rel="noopener">' +
        "Open guide section" +
        "</a></p>";
    }
    if (surface === "chat") {
      html += listenButtonHtml(res.speakText || res.text || "", surface);
    } else if (res.speakText && (global.speechSynthesis || global.PortalHelpVoiceSpeak)) {
      html += listenButtonHtml(res.speakText, surface);
    }
    return html;
  }

  function appendBubble(host, role, html, surface) {
    if (!host) return;
    surface = surface || "help";
    var ui = surfaceUi(surface);
    var row = document.createElement("div");
    row.className = ui.msg + " " + ui.msg + "--" + (role === "user" ? "user" : "bot");
    if (surface === "chat" && role === "bot") {
      var av = document.createElement("span");
      av.className = "portal-chat-msg__avatar";
      av.setAttribute("aria-hidden", "true");
      av.textContent = "CS";
      row.appendChild(av);
    }
    var bubble = document.createElement("div");
    bubble.className = ui.bubble;
    bubble.innerHTML = html;
    row.appendChild(bubble);
    host.appendChild(row);
    host.scrollTop = host.scrollHeight;
  }

  function renderSuggestions(host, topics, onPick, surface) {
    if (!host) return;
    surface = surface || "help";
    if (surface === "chat") {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    var ui = surfaceUi(surface);
    host.innerHTML = "";
    if (!topics || !topics.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.className = ui.sug;
    var label = document.createElement("p");
    label.className = ui.sugLabel + " muted";
    label.textContent = surface === "chat" ? "Suggestions:" : "Try one of these:";
    host.appendChild(label);
    var row = document.createElement("div");
    row.className = ui.sugRow;
    topics.forEach(function (topic) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = ui.chip;
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

  function assistConfig() {
    return {
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
    };
  }

  function configureAssistOnce() {
    var cfgObj = assistConfig();
    if (global.PortalHelpVoiceSpeak && !global.__portalVoiceConfigured) {
      global.__portalVoiceConfigured = true;
      global.PortalHelpVoiceSpeak.configure(cfgObj);
    }
    if (global.__portalOpenAiAssistConfigured || !global.PortalOpenAiAssist) return;
    global.__portalOpenAiAssistConfigured = true;
    global.PortalOpenAiAssist.configure(cfgObj);
  }

  async function tryAssistAnswer(question, match, msgsHost, sugHost, data, guideData, surface) {
    if (!global.PortalOpenAiAssist) return false;
    try {
      configureAssistOnce();
      var avail = await global.PortalOpenAiAssist.probe(true);
      if (!avail.openai) return false;

      appendBubble(
        msgsHost,
        "bot",
        '<span class="muted">Thinking…</span>',
        surface
      );
      var thinking = msgsHost && msgsHost.lastElementChild;

      var res = await global.PortalOpenAiAssist.helpAnswer(
        question,
        knowledgeForAssist(data, match),
        guideSectionsForAssist(question, guideData, match)
      );
      if (thinking && thinking.parentNode) thinking.parentNode.removeChild(thinking);

      if (!res || !res.ok || !res.text) return false;

      appendBubble(msgsHost, "bot", buildAssistBubbleHtml(res, guideData, surface), surface);
      if (surface === "chat") {
        speakText(res.speakText || res.text || "");
      }
      renderSuggestions(
        sugHost,
        match.suggestions && match.suggestions.length
          ? match.suggestions
          : starterTopics(data),
        function (topic) {
          appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
          answerTopic(topic, msgsHost, sugHost, surface);
        },
        surface
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

  function answerTopic(topic, msgsHost, sugHost, surface) {
    surface = surface || "help";
    var spoken = formatAnswerHtml(topic.answer);
    var answerHtml =
      (surface === "chat" ? "" : "<strong>" + escapeHtml(topic.title) + "</strong><br>") +
      spoken +
      (surface === "chat"
        ? listenButtonHtml(topic.answer, surface)
        : '<p class="portal-help-guide-link"><a href="portal_help_guide.html" target="_blank" rel="noopener">Open full guide</a></p>');
    appendBubble(
      msgsHost,
      "bot",
      answerHtml,
      surface
    );
    if (surface === "chat") {
      speakText(String(topic.answer || ""));
    }
    renderSuggestions(sugHost, [], function () {}, surface);
  }

  async function handleQuestion(raw, msgsHost, sugHost, data, guideData, ui, opts) {
    opts = opts || {};
    var surface = opts.surface || "help";
    var aiFirst = !!opts.aiFirst;
    var q = String(raw || "").trim();
    if (!q) return;
    if (ui && ui.sendBtn) ui.sendBtn.disabled = true;
    if (ui && ui.input) ui.input.disabled = true;
    if (ui && ui.micBtn) {
      ui.micBtn.disabled = true;
      ui.micBtn.classList.add("is-thinking");
    }
    if (ui && ui.status) ui.status.textContent = "Thinking...";
    try {
      appendBubble(msgsHost, "user", escapeHtml(q), surface);
      var match = portalHelpMatchQuestion(q, data);

      if (aiFirst) {
        var assistedFirst = await tryAssistAnswer(q, match, msgsHost, sugHost, data, guideData, surface);
        if (assistedFirst) return;
        if (match.ok && match.topic) {
          answerTopic(match.topic, msgsHost, sugHost, surface);
          if (match.suggestions && match.suggestions.length) {
            renderSuggestions(sugHost, match.suggestions, function (topic) {
              appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
              answerTopic(topic, msgsHost, sugHost, surface);
            }, surface);
          }
          return;
        }
        var unsureSpeak = "I'm not sure yet. Please try asking that another way.";
        var unsureHtml =
          surface === "chat"
            ? escapeHtml(unsureSpeak) + listenButtonHtml(unsureSpeak, surface)
            : "I'm not sure yet — try rephrasing, or open " +
              '<a href="portal_help_guide.html" target="_blank" rel="noopener">Staff help guide</a> for illustrated topics.';
        appendBubble(
          msgsHost,
          "bot",
          unsureHtml,
          surface
        );
        if (surface === "chat") {
          speakText(unsureSpeak);
        }
        await logUnanswered(q, match);
        renderSuggestions(
          sugHost,
          match.suggestions && match.suggestions.length ? match.suggestions : starterTopics(data),
          function (topic) {
            appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
            answerTopic(topic, msgsHost, sugHost, surface);
          },
          surface
        );
        return;
      }

      if (match.ok && match.topic) {
        answerTopic(match.topic, msgsHost, sugHost, surface);
        if (match.suggestions && match.suggestions.length) {
          renderSuggestions(sugHost, match.suggestions, function (topic) {
            appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
            answerTopic(topic, msgsHost, sugHost, surface);
          }, surface);
        }
        return;
      }

      var assisted = await tryAssistAnswer(q, match, msgsHost, sugHost, data, guideData, surface);
      if (assisted) {
        await logUnanswered(q, match);
        return;
      }

      var noMatchSpeak = "I could not find an exact answer yet. Please try asking that another way.";
      var noMatchHtml =
        surface === "chat"
          ? escapeHtml(noMatchSpeak) + listenButtonHtml(noMatchSpeak, surface)
          : "I could not find an exact match yet. Try rephrasing, pick a topic below, or open the " +
            '<a href="portal_help_guide.html" target="_blank" rel="noopener">Staff help guide</a>. ' +
            "Your question was saved so we can improve answers.";
      appendBubble(
        msgsHost,
        "bot",
        noMatchHtml,
        surface
      );
      if (surface === "chat") {
        speakText(noMatchSpeak);
      }
      await logUnanswered(q, match);
      renderSuggestions(sugHost, match.suggestions && match.suggestions.length ? match.suggestions : starterTopics(data), function (topic) {
        appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
        answerTopic(topic, msgsHost, sugHost, surface);
      }, surface);
    } catch (_err) {
      var errHtml =
        surface === "chat"
          ? "Something went wrong. Please try again."
          : "Something went wrong — try again or open the " +
            '<a href="portal_help_guide.html" target="_blank" rel="noopener">Staff help guide</a>.';
      appendBubble(
        msgsHost,
        "bot",
        errHtml,
        surface
      );
      if (surface === "chat") {
        speakText("Something went wrong. Please try again.");
      }
    } finally {
      if (ui && ui.sendBtn) ui.sendBtn.disabled = false;
      if (ui && ui.micBtn) {
        ui.micBtn.disabled = false;
        ui.micBtn.classList.remove("is-thinking");
      }
      if (ui && ui.status) ui.status.textContent = "Tap the microphone to speak again.";
      if (ui && ui.input) {
        ui.input.disabled = false;
        try {
          ui.input.focus();
        } catch (_e2) {}
      }
    }
  }

  var activeVoiceStatus = null;

  function setVoiceStatus(text) {
    if (activeVoiceStatus) activeVoiceStatus.textContent = text;
  }

  function speakIntro(text) {
    void speakText(text);
  }

  function speakText(text) {
    text = String(text || "").trim();
    if (!text) return Promise.resolve({ ok: false });
    if (global.PortalHelpVoiceSpeak) {
      configureAssistOnce();
      try {
        if (typeof global.PortalHelpVoiceSpeak.unlock === "function") {
          global.PortalHelpVoiceSpeak.unlock();
        }
      } catch (_u) {}
      setVoiceStatus("Speaking...");
      return global.PortalHelpVoiceSpeak.speak(text)
        .then(function (r) {
          setVoiceStatus(
            r && r.ok ? "Tap the microphone to speak again." : "Tap Listen again to hear the answer."
          );
          return r;
        })
        .catch(function () {
          setVoiceStatus("Tap Listen again to hear the answer.");
          return { ok: false };
        });
    }
    if (!global.speechSynthesis) return Promise.resolve({ ok: false });
    try {
      global.speechSynthesis.cancel();
    } catch (_c) {}
    var utt = new global.SpeechSynthesisUtterance(text);
    utt.lang = "en-GB";
    try {
      global.speechSynthesis.speak(utt);
      return Promise.resolve({ ok: true, source: "browser" });
    } catch (_s) {
      return Promise.resolve({ ok: false });
    }
  }

  function resetSession(msgsHost, sugHost, data, introHtml, surface) {
    if (!msgsHost) return;
    msgsHost.innerHTML = "";
    appendBubble(msgsHost, "bot", introHtml, surface);
    renderSuggestions(sugHost, starterTopics(data), function (topic) {
      appendBubble(msgsHost, "user", escapeHtml(topic.title), surface);
      answerTopic(topic, msgsHost, sugHost, surface);
    }, surface);
  }

  function bindListenClicks(msgsHost) {
    msgsHost.addEventListener("click", function (ev) {
      var btn =
        ev.target && ev.target.closest
          ? ev.target.closest(".portal-help-listen-btn, .portal-chat-listen-btn")
          : null;
      if (!btn) return;
      var text = btn.getAttribute("data-speak") || "";
      if (!text) return;
      btn.disabled = true;
      var done = function () {
        btn.disabled = false;
      };
      if (global.PortalHelpVoiceSpeak) {
        configureAssistOnce();
        void global.PortalHelpVoiceSpeak.speak(text).then(done).catch(done);
        return;
      }
      if (!global.speechSynthesis) return;
      try {
        global.speechSynthesis.cancel();
      } catch (_c) {}
      var utt = new global.SpeechSynthesisUtterance(text);
      utt.lang = /[áéíóúñ¿¡]/i.test(text) ? "es-ES" : "en-GB";
      utt.onend = done;
      utt.onerror = done;
      try {
        global.speechSynthesis.speak(utt);
      } catch (_s) {
        done();
      }
    });
  }

  function canRecordAudio() {
    return !!(
      global.navigator &&
      global.navigator.mediaDevices &&
      typeof global.navigator.mediaDevices.getUserMedia === "function" &&
      typeof global.MediaRecorder === "function"
    );
  }

  function pickRecorderMime() {
    if (typeof global.MediaRecorder !== "function" || !global.MediaRecorder.isTypeSupported) {
      return "";
    }
    var prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
    for (var i = 0; i < prefs.length; i++) {
      if (global.MediaRecorder.isTypeSupported(prefs[i])) return prefs[i];
    }
    return "";
  }

  function bindVoiceChat(cfg, msgsHost, sugHost, micBtn, status) {
    activeVoiceStatus = status;
    var isRecording = false;
    var mediaRecorder = null;
    var chunks = [];
    var mediaStream = null;

    function setStatus(text) {
      if (status) status.textContent = text;
    }

    function setRecording(on) {
      isRecording = !!on;
      micBtn.classList.toggle("is-listening", isRecording);
      var label = micBtn.querySelector(".portal-chat-mic__label");
      if (label) label.textContent = isRecording ? "Tap to send" : "Tap to talk";
    }

    function stopStream() {
      try {
        if (mediaStream) {
          mediaStream.getTracks().forEach(function (t) {
            try {
              t.stop();
            } catch (_t) {}
          });
        }
      } catch (_s) {}
      mediaStream = null;
    }

    async function askWithText(text) {
      var sources = await loadHelpSources();
      return handleQuestion(text, msgsHost, sugHost, sources.knowledge, sources.agentGuide, {
        micBtn: micBtn,
        status: status,
      }, {
        surface: cfg.surface,
        aiFirst: !!cfg.aiFirst,
      });
    }

    async function onRecordingStop() {
      setRecording(false);
      stopStream();
      var type = (mediaRecorder && mediaRecorder.mimeType) || "audio/webm";
      var blob = chunks.length ? new Blob(chunks, { type: type }) : null;
      chunks = [];
      mediaRecorder = null;
      if (!blob || !blob.size) {
        setStatus("I did not catch that. Tap the microphone and try again.");
        return;
      }
      setStatus("Transcribing...");
      micBtn.disabled = true;
      try {
        configureAssistOnce();
        var tr =
          global.PortalHelpVoiceSpeak && global.PortalHelpVoiceSpeak.transcribe
            ? await global.PortalHelpVoiceSpeak.transcribe(blob)
            : { ok: false, error: "no_transcribe" };
        if (!tr || !tr.ok || !tr.text) {
          micBtn.disabled = false;
          setStatus("I could not understand the audio. Tap the microphone and try again.");
          return;
        }
        await askWithText(tr.text);
      } catch (_e) {
        micBtn.disabled = false;
        setStatus("Something went wrong. Tap the microphone and try again.");
      }
    }

    async function startRecording() {
      if (!canRecordAudio()) {
        var msg = "Microphone recording is not available on this browser. Please open the portal in Safari or Chrome and allow microphone access.";
        appendBubble(msgsHost, "bot", escapeHtml(msg), "chat");
        speakText(msg);
        setStatus("Microphone not available on this browser.");
        return;
      }
      try {
        mediaStream = await global.navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (_perm) {
        setStatus("Microphone permission was blocked. Allow it in your browser settings and try again.");
        return;
      }
      var mime = pickRecorderMime();
      try {
        mediaRecorder = mime
          ? new global.MediaRecorder(mediaStream, { mimeType: mime })
          : new global.MediaRecorder(mediaStream);
      } catch (_mr) {
        stopStream();
        setStatus("Recording could not start on this browser.");
        return;
      }
      chunks = [];
      mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) chunks.push(ev.data);
      };
      mediaRecorder.onstop = function () {
        void onRecordingStop();
      };
      try {
        mediaRecorder.start();
        setRecording(true);
        setStatus("Listening... tap again to send.");
      } catch (_start) {
        stopStream();
        setStatus("Recording could not start. Tap to try again.");
      }
    }

    micBtn.addEventListener("click", function () {
      try {
        if (global.PortalHelpVoiceSpeak && global.PortalHelpVoiceSpeak.unlock) {
          global.PortalHelpVoiceSpeak.unlock();
        }
      } catch (_u) {}

      if (isRecording && mediaRecorder) {
        try {
          mediaRecorder.stop();
        } catch (_s) {}
        return;
      }
      void startRecording();
    });
  }

  function bindBotSurface(cfg) {
    var sheet = global.document && global.document.getElementById(cfg.sheetId);
    var sendBtn = global.document && global.document.getElementById(cfg.sendBtnId);
    var input = global.document && global.document.getElementById(cfg.inputId);
    var micBtn = global.document && global.document.getElementById(cfg.micBtnId);
    var status = global.document && global.document.getElementById(cfg.statusId);
    var msgsHost = global.document && global.document.getElementById(cfg.msgsId);
    var sugHost = global.document && global.document.getElementById(cfg.sugId);
    if (!sheet || !msgsHost) return;
    if (cfg.voiceOnly) {
      if (!micBtn) return;
    } else if (!sendBtn || !input) {
      return;
    }

    bindListenClicks(msgsHost);

    async function onOpen() {
      var data = await loadHelpSources();
      var fresh =
        cfg.surface === "chat"
          ? !chatSessionStarted || !msgsHost.children.length
          : !sessionStarted || !msgsHost.children.length;
      if (fresh) {
        resetSession(msgsHost, sugHost, data.knowledge, cfg.introHtml, cfg.surface);
        if (cfg.surface === "chat") chatSessionStarted = true;
        else sessionStarted = true;
      }
      if (input) {
        try {
          input.focus();
        } catch (_) {}
      }
      if (status && cfg.voiceOnly) {
        status.textContent = canRecordAudio()
          ? "Tap the microphone and speak."
          : "Microphone needs Safari or Chrome with permission.";
      }
      if (cfg.speakOnOpen) speakIntro(cfg.introSpeak);
    }

    if (global.MutationObserver) {
      var obs = new global.MutationObserver(function () {
        if (sheet.classList.contains("open")) {
          void onOpen();
        }
      });
      obs.observe(sheet, { attributes: true, attributeFilter: ["class"] });
    }

    if (cfg.voiceOnly) {
      bindVoiceChat(cfg, msgsHost, sugHost, micBtn, status);
    } else {
      sendBtn.addEventListener("click", function () {
        void loadHelpSources().then(function (sources) {
          var q = input.value;
          input.value = "";
          void handleQuestion(q, msgsHost, sugHost, sources.knowledge, sources.agentGuide, {
            sendBtn: sendBtn,
            input: input,
          }, {
            surface: cfg.surface,
            aiFirst: !!cfg.aiFirst,
          });
        });
      });

      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          sendBtn.click();
        }
      });
    }

    if (cfg.onOpenHook) cfg.onOpenHook(onOpen);
  }

  global.portalOpenChatBot = function portalOpenChatBot() {
    try {
      if (global.PortalHelpVoiceSpeak && global.PortalHelpVoiceSpeak.unlock) {
        global.PortalHelpVoiceSpeak.unlock();
      }
    } catch (_u) {}
    if (typeof global.openSheet === "function") {
      global.openSheet("portalChatBotSheet");
    }
  };

  global.portalHelpBotOnOpen = async function portalHelpBotOnOpen() {
    var sheet = global.document && global.document.getElementById("portalHelpSheet");
    var msgsHost = global.document && global.document.getElementById("portalHelpMessages");
    if (!sheet || !msgsHost || !sheet.classList.contains("open")) return;
    var data = await loadHelpSources();
    var sugHost = global.document && global.document.getElementById("portalHelpSuggestions");
    if (!sessionStarted || !msgsHost.children.length) {
      resetSession(msgsHost, sugHost, data.knowledge, PORTAL_HELP_INTRO_HTML, "help");
      sessionStarted = true;
    }
  };

  function bindHelpBot() {
    bindBotSurface({
      sheetId: "portalHelpSheet",
      msgsId: "portalHelpMessages",
      sugId: "portalHelpSuggestions",
      inputId: "portalHelpInput",
      sendBtnId: "portalHelpSendBtn",
      surface: "help",
      aiFirst: false,
      speakOnOpen: false,
      introHtml: PORTAL_HELP_INTRO_HTML,
      introSpeak: PORTAL_HELP_INTRO_SPEAK,
    });
    bindBotSurface({
      sheetId: "portalChatBotSheet",
      msgsId: "portalChatMessages",
      sugId: "portalChatSuggestions",
      micBtnId: "portalChatMicBtn",
      statusId: "portalChatVoiceStatus",
      surface: "chat",
      aiFirst: true,
      voiceOnly: true,
      speakOnOpen: true,
      introHtml: PORTAL_CHAT_INTRO_HTML,
      introSpeak: PORTAL_CHAT_INTRO_SPEAK,
    });

    var footHelp = global.document.getElementById("portalChatFootHelp");
    if (footHelp) {
      footHelp.addEventListener("click", function () {
        if (typeof global.openSheet === "function") {
          global.openSheet("portalHelpSheet");
        }
      });
    }

    var chatClose = global.document.getElementById("portalChatCloseBtn");
    if (chatClose) {
      chatClose.addEventListener("click", function () {
        if (typeof global.closeSheet === "function") {
          global.closeSheet();
        }
      });
    }
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", bindHelpBot);
    } else {
      bindHelpBot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
