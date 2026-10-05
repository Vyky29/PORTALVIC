/**
 * Presentation for portal_world.html.
 * Reads PortalWorldData only. Playback is a simulation: it does not pay, send, or change a booking.
 */
(function (global) {
  "use strict";

  var Z_FUNCS = 0.62;
  var WORLD_W = 2800;
  var WORLD_H = 1500;
  var FRAME = {};
  var POS = {};

  function layoutFrames(data) {
    function count(id) {
      var n = 0;
      data.STORIES.forEach(function (story) { if (story.world === id) n += 1; });
      if (n) return n;
      var chips = 1;
      data.ISLANDS.forEach(function (island) {
        if (island.id === id) chips = (island.chips && island.chips.length) || 1;
      });
      return chips;
    }
    function height(n, cols) {
      return 58 + Math.ceil(n / cols) * 46 + 14;
    }
    var gap = 28;
    var y = 20;
    var booking = { x: 20, y: y, w: 520, h: height(count("booking"), 2) };
    var admin = { x: booking.x + booking.w + gap, y: y, w: 640, h: height(count("admin"), 2) };
    var staff = { x: admin.x + admin.w + gap, y: y, w: 520, h: height(count("staff"), 2) };
    var row2 = y + Math.max(booking.h, admin.h, staff.h) + gap;
    var auto = { x: 20, y: row2, w: 500, h: height(count("auto"), 2) };
    var parent = { x: auto.x + auto.w + gap, y: row2, w: 540, h: height(count("parent"), 2) };
    var onb = { x: parent.x + parent.w + gap, y: row2, w: 400, h: height(count("onb"), 2) };
    var row3 = row2 + Math.max(auto.h, parent.h, onb.h) + gap;
    var ceo = { x: 20, y: row3, w: 280, h: height(count("ceo"), 1) };
    var comms = { x: ceo.x + ceo.w + gap, y: row3, w: 320, h: height(count("comms"), 1) };
    var email = { x: comms.x + comms.w + gap, y: row3, w: 260, h: height(count("email"), 1) };
    var wa = { x: email.x + email.w + gap, y: row3, w: 280, h: height(count("wa"), 1) };
    var stripe = { x: wa.x + wa.w + gap, y: row3, w: 250, h: height(count("stripe"), 1) };
    var gc = { x: stripe.x + stripe.w + gap, y: row3, w: 230, h: height(count("gc"), 1) };
    var xero = { x: gc.x + gc.w + gap, y: row3, w: 250, h: height(count("xero"), 1) };
    FRAME = { booking: booking, admin: admin, staff: staff, auto: auto, parent: parent, onb: onb, ceo: ceo, comms: comms, email: email, wa: wa, stripe: stripe, gc: gc, xero: xero };
    var maxX = 0;
    var maxY = 0;
    Object.keys(FRAME).forEach(function (id) {
      var frame = FRAME[id];
      POS[id] = { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
      maxX = Math.max(maxX, frame.x + frame.w);
      maxY = Math.max(maxY, frame.y + frame.h);
    });
    WORLD_W = maxX + 40;
    WORLD_H = maxY + 40;
  }

  var COLOR = {
    booking: "#e2b86a",
    auto: "#e2a322",
    admin: "#1f8f7e",
    staff: "#3f7ebf",
    parent: "#e7a294",
    onb: "#6d5bd0",
    ceo: "#9eb0cc",
    comms: "#8ea0be",
    email: "#8eacd0",
    wa: "#3dae6a",
    stripe: "#635bff",
    gc: "#1f8a70",
    xero: "#13b5ea"
  };

  var GUIDE_IDS = {
    auto: ["what_runs_by_itself", "feedback_whatsapp_clock"],
    admin: ["sessions_overview", "schedule_covers", "admin_bell_popup", "pending_alerts", "staff_feedback_voice_vs_admin_ai"],
    staff: ["staff_feedback_voice_vs_admin_ai", "timesheet_what_counts", "feedback_whatsapp_clock"],
    parent: ["parent_notify", "parent_vs_office"],
    comms: ["comms_write_send", "incoming_call_name", "comms_green_vs_read", "admin_comms_stays"],
    booking: ["finish_booking", "leads_vs_registered", "waiting_list"],
    onb: ["onboarding_open_photo", "call_interview_phases", "induction_progress_admin"],
    ceo: ["what_runs_by_itself", "ceo_menu_from_settings"],
    email: ["what_runs_by_itself"],
    wa: ["feedback_whatsapp_clock", "parent_notify"],
    stripe: ["finish_booking", "what_runs_by_itself"],
    gc: ["gocardless_mandate", "what_runs_by_itself"],
    xero: ["create_invoice"]
  };

  function boot(root) {
    var data = global.PortalWorldData;
    if (!data) return;
    layoutFrames(data);
    var byId = {};
    data.ISLANDS.forEach(function (island) { byId[island.id] = island; });
    var linkById = {};
    data.LINKS.forEach(function (link) { linkById[link.id] = link; });
    data.LINKS.forEach(function (link) {
      link.reply = link.id === "auto-b";
      link.color = COLOR[link.from] || "#f4b740";
    });

    var state = {
      x: 40,
      y: 30,
      z: 0.55,
      world: "booking",
      story: "lead",
      step: 0,
      playing: false,
      mode: "map",
      saved: null,
      guide: [],
      drag: null,
      pointers: {},
      pinch: null,
      focusLink: null,
      cruise: true
    };
    var funcPos = {};

    var vw = root.querySelector("#pwViewport");
    var world = root.querySelector("#pwWorld");
    var wires = root.querySelector("#pwPaths");
    world.style.width = WORLD_W + "px";
    world.style.height = WORLD_H + "px";
    var svg = root.querySelector("#pwWires");
    if (svg) {
      svg.setAttribute("viewBox", "0 0 " + WORLD_W + " " + WORLD_H);
      svg.style.width = WORLD_W + "px";
      svg.style.height = WORLD_H + "px";
    }
    var nodes = root.querySelector("#pwNodes");
    var particles = root.querySelector("#pwParticles");
    var flow = root.querySelector("#pwFlow");
    var panel = root.querySelector("#pwPanel");
    var worldsEl = root.querySelector("#pwWorlds");
    var storiesEl = root.querySelector("#pwStories");
    var legend = root.querySelector("#pwLegend");
    var mini = root.querySelector("#pwMini");
    var sim = root.querySelector("#pwSim");
    var backBtn = root.querySelector("#pwBack");

    function storyById(id) {
      for (var i = 0; i < data.STORIES.length; i++) if (data.STORIES[i].id === id) return data.STORIES[i];
      return data.STORIES[0];
    }
    function storiesIn(id) {
      return data.STORIES.filter(function (story) { return story.world === id; });
    }
    function stepIslands(step) {
      return (step && step.islands) || [];
    }
    function stepLinks(step) {
      return (step && step.links) || [];
    }
    function isGate(text) {
      return /\b(si|cuando|hasta)\b/i.test(String(text || ""));
    }
    function effectKinds(text) {
      var t = String(text || "").toLowerCase();
      return {
        notify: /avis|campana|halo|email|whatsapp|push|mensaje/.test(t),
        data: /overview|schedule|places|today|booking|invoice|document|hold|plaza|finance|feedback|timesheet|expense|nota|team|consents/.test(t)
      };
    }

    function applyTransform() {
      world.style.transform = "translate(" + state.x + "px," + state.y + "px) scale(" + state.z + ")";
      world.style.setProperty("--pwz", String(state.z));
      var detail = state.z >= Z_FUNCS ? "funcs" : "worlds";
      world.setAttribute("data-detail", detail);
      paintMini();
    }

    function zoomAt(mx, my, factor) {
      var next = Math.min(2.4, Math.max(0.28, state.z * factor));
      var ratio = next / state.z;
      state.x = mx - (mx - state.x) * ratio;
      state.y = my - (my - state.y) * ratio;
      state.z = next;
      applyTransform();
    }

    function showMain() {
      var rect = vw.getBoundingClientRect();
      var left = FRAME.booking;
      var right = FRAME.admin;
      if (!left || !right) return fit();
      state.z = Math.min(1.05, Math.max(0.72, (rect.width - 48) / (right.x + right.w - left.x + 80)));
      state.x = 16 - left.x * state.z;
      state.y = 16 - left.y * state.z;
      applyTransform();
    }

    function fit(pad) {
      pad = pad || 70;
      var rect = vw.getBoundingClientRect();
      var minX = WORLD_W;
      var minY = WORLD_H;
      var maxX = 0;
      var maxY = 0;
      data.ISLANDS.forEach(function (island) {
        var frame = FRAME[island.id];
        if (!frame) return;
        minX = Math.min(minX, frame.x);
        minY = Math.min(minY, frame.y);
        maxX = Math.max(maxX, frame.x + frame.w);
        maxY = Math.max(maxY, frame.y + frame.h);
      });
      var topInset = 16;
      var availW = rect.width - 28;
      var availH = rect.height - topInset - 28;
      var z = Math.min(availW / (maxX - minX + pad), availH / (maxY - minY + pad));
      z = Math.min(1.1, Math.max(0.28, z));
      state.z = z;
      state.x = (rect.width - (maxX + minX) * z) / 2;
      state.y = topInset - minY * z;
      applyTransform();
    }

    function layoutInside(frame, count) {
      var cols = frame.w >= 460 ? 2 : 1;
      var gap = 10;
      var pad = 14;
      var top = 52;
      var rowH = 46;
      var w = (frame.w - pad * 2 - gap * (cols - 1)) / cols;
      var spots = [];
      var i;
      for (i = 0; i < count; i++) {
        var col = i % cols;
        var row = Math.floor(i / cols);
        spots.push({
          left: pad + col * (w + gap),
          top: top + row * rowH,
          w: w,
          cx: frame.x + pad + col * (w + gap) + w / 2,
          cy: frame.y + top + row * rowH + 18
        });
      }
      return spots;
    }

    function nodeHtml(island) {
      var frame = FRAME[island.id];
      var stories = storiesIn(island.id);
      var items = stories.length
        ? stories.map(function (story) { return { kind: "func", id: story.id, label: story.label }; })
        : (island.chips || []).map(function (chip) { return { kind: "chip", id: chip, label: chip }; });
      var spots = layoutInside(frame, items.length);
      var inner = items.map(function (item, i) {
        var spot = spots[i];
        if (item.kind === "func") funcPos[item.id] = { x: spot.cx, y: spot.cy };
        var attrs = item.kind === "func"
          ? ' data-func="' + item.id + '"'
          : "";
        return '<button type="button" class="pw-fn" data-home="' + island.id + '"' + attrs +
          ' style="left:' + spot.left + "px;top:" + spot.top + "px;width:" + spot.w + 'px">' + item.label + "</button>";
      }).join("");
      return '' +
        '<section class="pw-frame ' + island.cls + '" data-island="' + island.id + '" style="left:' + frame.x + "px;top:" + frame.y + "px;width:" + frame.w + "px;height:" + frame.h + 'px">' +
          '<span class="pw-kicker">' + island.kicker + "</span>" +
          "<h2>" + island.name + "</h2>" +
          inner +
        "</section>";
    }

    function renderNodes() {
      var missing = data.ISLANDS.filter(function (island) { return !FRAME[island.id]; });
      if (missing.length) throw new Error("missing position " + missing.map(function (i) { return i.id; }).join(","));
      funcPos = {};
      nodes.innerHTML = data.ISLANDS.map(function (island) { return nodeHtml(island); }).join("");
    }

    function frameEdge(fromId, toId) {
      var from = POS[fromId];
      var to = POS[toId];
      var frame = FRAME[fromId];
      var dx = to.x - from.x;
      var dy = to.y - from.y;
      var hx = frame.w / 2;
      var hy = frame.h / 2;
      var sx = dx === 0 ? Infinity : hx / Math.abs(dx);
      var sy = dy === 0 ? Infinity : hy / Math.abs(dy);
      var scale = Math.min(sx, sy);
      return { x: from.x + dx * scale, y: from.y + dy * scale };
    }

    function renderWires() {
      var story = storyById(state.story);
      var hot = {};
      var dim = false;
      if (state.mode === "flow") {
        story.steps.forEach(function (step) {
          stepLinks(step).forEach(function (id) { hot[id] = true; });
        });
        dim = true;
      } else if (state.focusLink) {
        hot[state.focusLink] = true;
        dim = true;
      }
      wires.innerHTML = data.LINKS.map(function (link) {
        var a = frameEdge(link.from, link.to);
        var b = frameEdge(link.to, link.from);
        if (!a || !b || !isFinite(a.x) || !isFinite(b.x)) return "";
        var dx = b.x - a.x;
        var dy = b.y - a.y;
        var len = Math.hypot(dx, dy) || 1;
        var bow = typeof link.bow === "number" ? link.bow * 6 : 28;
        var cx = (a.x + b.x) / 2 + (-dy / len) * bow;
        var cy = (a.y + b.y) / 2 + (dx / len) * bow;
        var cls = link.reply ? " is-reply" : "";
        if (hot[link.id]) cls += " is-hot";
        else if (dim) cls += " is-dim";
        var color = link.color;
        return '<path data-link="' + link.id + '" class="' + cls.trim() + '" stroke="' + color + '" d="M ' + a.x + " " + a.y + " Q " + cx + " " + cy + " " + b.x + " " + b.y + '" marker-end="url(#pwArrow)"/>';
      }).join("");
      paintLegend();
    }

    function paintLegend() {
      var bits = [
        '<span><i style="background:' + COLOR.admin + '"></i>Admin</span>',
        '<span><i style="background:' + COLOR.staff + '"></i>Staff / sesiones</span>',
        '<span><i style="background:' + COLOR.stripe + '"></i>Pagos</span>',
        '<span><i style="background:' + COLOR.comms + '"></i>Comms / Chat</span>',
        '<span><i style="background:' + COLOR.booking + '"></i>Acceso / OTP</span>',
        '<span><i style="background:' + COLOR.parent + '"></i>Notas</span>',
        '<span><i style="background:' + COLOR.auto + '"></i>Stats</span>',
        '<span><i class="pw-blink" style="background:#f4b740"></i>Vuelta parpadeante, mismo color</span>'
      ];
      legend.innerHTML = bits.join("");
    }

    function paintMini() {
      var ctx = mini.getContext("2d");
      var w = mini.width;
      var h = mini.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0c3d58";
      ctx.fillRect(0, 0, w, h);
      var sx = w / WORLD_W;
      var sy = h / WORLD_H;
      data.LINKS.forEach(function (link) {
        var a = POS[link.from];
        var b = POS[link.to];
        if (!a || !b) return;
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.beginPath();
        ctx.moveTo(a.x * sx, a.y * sy);
        ctx.lineTo(b.x * sx, b.y * sy);
        ctx.stroke();
      });
      data.ISLANDS.forEach(function (island) {
        var p = POS[island.id];
        ctx.fillStyle = COLOR[island.id] || "#fff";
        ctx.beginPath();
        ctx.arc(p.x * sx, p.y * sy, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      var rect = vw.getBoundingClientRect();
      var vx = (-state.x / state.z) * sx;
      var vy = (-state.y / state.z) * sy;
      var vwW = (rect.width / state.z) * sx;
      var vwH = (rect.height / state.z) * sy;
      ctx.strokeStyle = "#f4b740";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vwW, vwH);
    }

    function renderTabs() {
      worldsEl.innerHTML = data.WORLDS.map(function (world) {
        return '<button type="button" data-world="' + world.id + '"' + (world.id === state.world ? ' class="is-on"' : "") + ">" + world.label + "</button>";
      }).join("");
      storiesEl.innerHTML = storiesIn(state.world).map(function (story) {
        return '<button type="button" data-story="' + story.id + '"' + (story.id === state.story ? ' class="is-on"' : "") + ">" + story.label + "</button>";
      }).join("");
    }

    function guideLessons(ids) {
      var want = {};
      (ids || []).forEach(function (id) { want[id] = true; });
      return state.guide.filter(function (lesson) { return want[lesson.id]; });
    }

    function lessonBlock(lesson) {
      var es = lesson.es || {};
      var steps = (es.steps || lesson.steps || []).slice(0, 4).map(function (line) {
        return "<li>" + line + "</li>";
      }).join("");
      return '<div class="pw-guide"><h3>' + (es.title || lesson.title) + "</h3><p>" + (es.summary || lesson.summary || "") + "</p><ol>" + steps + "</ol></div>";
    }

    function cardPreview(text) {
      var t = String(text || "");
      var kind = "";
      if (/session feedback/i.test(t)) kind = "Session Feedback";
      else if (/today card/i.test(t)) kind = "Today card";
      else if (/overview/i.test(t)) kind = "Sessions Overview";
      else if (/halo|quick menu/i.test(t)) kind = "Staff Today";
      else if (/campana/i.test(t)) kind = "Campana Admin";
      else if (/notas/i.test(t)) kind = "Notes";
      else if (/invoices/i.test(t)) kind = "Invoices";
      else if (/bookings/i.test(t)) kind = "Bookings";
      else if (/team/i.test(t)) kind = "Team";
      if (!kind) return "";
      var fx = effectKinds(t);
      var tag = fx.notify && fx.data
        ? "Aviso y actualizacion de datos. No son el mismo efecto."
        : fx.notify
          ? "Aviso. No reescribe la tarjeta por si solo."
          : "Actualizacion de datos en esa tarjeta.";
      return '<div class="pw-card"><p class="pw-card__kicker">Simulacion de la tarjeta ' + kind + "</p><p>" + t + "</p><p class=\"pw-card__tag\">" + tag + "</p></div>";
    }

    function renderPanel() {
      var story = storyById(state.story);
      var step = story.steps[state.step] || story.steps[0];
      var gate = isGate(step.text);
      var fx = effectKinds(step.text);
      var names = stepIslands(step).map(function (id) { return byId[id] ? byId[id].name : id; }).join(" + ");
      var steps = story.steps.map(function (item, i) {
        var mark = isGate(item.text) ? " Condicion." : "";
        return '<li data-step="' + i + '"' + (i === state.step ? ' class="is-now"' : "") + "><b>" + (i + 1) + "." + mark + "</b> " + item.text + "</li>";
      }).join("");
      var lessons = guideLessons(GUIDE_IDS[story.world] || []).slice(0, 2).map(lessonBlock).join("");
      var playLabel = state.playing ? "Pausa" : "Reproducir";
      panel.innerHTML =
        '<button type="button" class="pw-panel-x" data-act="close">Cerrar</button>' +
        "<h2>" + story.label + "</h2>" +
        '<p class="pw-sub">Simulacion. Paso ' + (state.step + 1) + " de " + story.steps.length + ". No envia pagos, mensajes ni cambia reservas.</p>" +
        '<div class="pw-now"><b>' + names + "</b><p>" + step.text + "</p>" +
          (gate ? '<p class="pw-gate">Condicion pendiente. La animacion se queda aqui hasta que avances el paso.</p>' : "") +
          '<p class="pw-fx">' + (fx.notify ? "Aviso. " : "") + (fx.data ? "Actualizacion de datos." : "") + "</p></div>" +
        cardPreview(step.text) +
        '<div class="pw-controls">' +
          '<button type="button" data-act="play">' + playLabel + "</button>" +
          '<button type="button" data-act="repeat">Repetir</button>' +
          '<button type="button" data-act="prev">Paso anterior</button>' +
          '<button type="button" data-act="next">Paso siguiente</button>' +
        "</div>" +
        '<ol class="pw-steps">' + steps + "</ol>" +
        lessons;
      sim.textContent = state.cruise ? "Pausar movimiento" : "Reanudar movimiento";
    }

    function renderIslandPanel(id) {
      var island = byId[id];
      if (!island) return;
      state.panelOpen = true;
      panel.classList.add("is-open");
      var happens = (island.happens || []).map(function (line) {
        var fx = effectKinds(line);
        return "<p>" + line + "</p><p class=\"pw-fx\">" + (fx.notify ? "Aviso. " : "") + (fx.data ? "Actualizacion de datos." : "") + "</p>";
      }).join("");
      var links = data.LINKS.filter(function (link) {
        return link.from === id || link.to === id;
      }).map(function (link) {
        var other = link.from === id ? byId[link.to] : byId[link.from];
        var way = link.from === id ? "Sale hacia" : "Llega desde";
        var back = link.reply ? " Vuelta: parpadea." : " Ida.";
        return "<p><b>" + way + " " + (other ? other.name : "") + ".</b> " + link.label + "." + back + "</p>";
      }).join("");
      var lessons = guideLessons(GUIDE_IDS[id] || []).map(lessonBlock).join("");
      panel.innerHTML =
        '<button type="button" class="pw-panel-x" data-act="close">Cerrar</button>' +
        "<h2>" + island.name + "</h2>" +
        '<p class="pw-sub">' + island.host + "</p>" +
        "<h3>Que pasa</h3>" + happens +
        "<h3>Conexiones</h3>" + links +
        lessons;
    }

    function renderLinkPanel(id) {
      var link = linkById[id];
      if (!link) return;
      var stories = data.STORIES.filter(function (story) {
        return story.steps.some(function (step) { return stepLinks(step).indexOf(id) !== -1; });
      }).map(function (story) {
        return '<button type="button" data-story="' + story.id + '">' + story.label + "</button>";
      }).join("");
      state.panelOpen = true;
      panel.classList.add("is-open");
      panel.innerHTML =
        '<button type="button" class="pw-panel-x" data-act="close">Cerrar</button>' +
        "<h2>" + byId[link.from].name + " → " + byId[link.to].name + "</h2>" +
        "<p>" + link.label + "</p>" +
        "<p class=\"pw-fx\">" + (link.reply ? "Vuelta. Misma familia de color, parpadea. El camino de ida ya existe al reves." : "Ida. Color fijo de quien lo envia.") + "</p>" +
        "<h3>Recorridos que usan esta linea</h3><div class=\"pw-storypicks\">" + stories + "</div>";
    }

    var frame = 0;
    function stopParticles() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      particles.innerHTML = "";
    }
    function runParticles() {
      stopParticles();
      if (!state.cruise && !state.playing) return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var paths = (state.mode === "flow" || state.focusLink)
        ? wires.querySelectorAll("path.is-hot")
        : wires.querySelectorAll("path");
      if (!paths.length) return;
      var dots = [];
      Array.prototype.forEach.call(paths, function (path) {
        var k;
        for (k = 0; k < 2; k++) {
          var dot = document.createElement("i");
          dot.className = "pw-dot" + (path.classList.contains("is-reply") ? " is-reply" : "");
          dot.style.background = path.getAttribute("stroke") || "#f4b740";
          particles.appendChild(dot);
          dots.push({ el: dot, path: path, len: path.getTotalLength() || 1, t0: performance.now() - k * 1100 });
        }
      });
      function tickFrame(now) {
        dots.forEach(function (dot) {
          var u = ((now - dot.t0) % 2400) / 2400;
          var pt = dot.path.getPointAtLength(u * dot.len);
          dot.el.style.left = pt.x + "px";
          dot.el.style.top = pt.y + "px";
        });
        frame = requestAnimationFrame(tickFrame);
      }
      frame = requestAnimationFrame(tickFrame);
    }

    function paintMap() {
      renderTabs();
      renderWires();
      nodes.querySelectorAll(".pw-frame").forEach(function (el) {
        var id = el.getAttribute("data-island");
        var story = storyById(state.story);
        var involved = {};
        if (state.mode === "flow") {
          story.steps.forEach(function (step) {
            stepIslands(step).forEach(function (islandId) { involved[islandId] = true; });
          });
          involved[story.world] = true;
        }
        var hot = state.mode === "flow" && !!involved[id];
        el.classList.toggle("is-hot", hot);
        el.classList.toggle("is-dim", state.mode === "flow" && !hot);
      });
      nodes.querySelectorAll(".pw-fn").forEach(function (el) {
        var sid = el.getAttribute("data-func");
        var home = el.getAttribute("data-home");
        var story = storyById(state.story);
        var on = state.mode === "flow" && sid === story.id;
        el.classList.toggle("is-hot", on);
        el.classList.toggle("is-dim", state.mode === "flow" && home && !el.closest(".pw-frame").classList.contains("is-hot") && !on);
      });
      renderPanel();
      runParticles();
      flow.hidden = true;
      world.hidden = false;
      backBtn.hidden = state.mode !== "flow";
      panel.classList.toggle("is-open", state.mode === "flow" || !!state.panelOpen);
    }

    function openFlow(storyId, keepStep) {
      var story = storyById(storyId);
      state.story = story.id;
      state.world = story.world || state.world;
      state.focusLink = null;
      state.panelOpen = true;
      if (state.mode !== "flow") state.saved = { x: state.x, y: state.y, z: state.z };
      state.mode = "flow";
      if (!keepStep) {
        state.playing = true;
        state.step = 0;
      }
      world.hidden = false;
      flow.hidden = true;
      backBtn.hidden = false;
      paintMap();
      if (!keepStep) focusFrames(story);
      armTimer();
    }

    function focusFrames(story) {
      var ids = {};
      ids[story.world] = true;
      story.steps.forEach(function (step) {
        stepIslands(step).forEach(function (id) { ids[id] = true; });
      });
      var minX = WORLD_W;
      var minY = WORLD_H;
      var maxX = 0;
      var maxY = 0;
      Object.keys(ids).forEach(function (id) {
        var frame = FRAME[id];
        if (!frame) return;
        minX = Math.min(minX, frame.x);
        minY = Math.min(minY, frame.y);
        maxX = Math.max(maxX, frame.x + frame.w);
        maxY = Math.max(maxY, frame.y + frame.h);
      });
      var rect = vw.getBoundingClientRect();
      var z = Math.min((rect.width - 80) / (maxX - minX + 80), (rect.height - 80) / (maxY - minY + 80));
      z = Math.min(1.15, Math.max(0.45, z));
      state.z = z;
      state.x = (rect.width - (maxX + minX) * z) / 2;
      state.y = 36 - minY * z;
      applyTransform();
    }

    function closeFlow() {
      state.mode = "map";
      state.playing = false;
      state.panelOpen = false;
      if (state.timer) clearTimeout(state.timer);
      if (state.saved) {
        state.x = state.saved.x;
        state.y = state.saved.y;
        state.z = state.saved.z;
      }
      state.saved = null;
      flow.hidden = true;
      world.hidden = false;
      backBtn.hidden = true;
      applyTransform();
      paintMap();
    }

    function armTimer() {
      if (state.timer) clearTimeout(state.timer);
      state.timer = 0;
      if (!state.playing) return;
      var story = storyById(state.story);
      var step = story.steps[state.step];
      if (step && isGate(step.text)) return;
      state.timer = setTimeout(function () {
        state.step = (state.step + 1) % story.steps.length;
        var next = story.steps[state.step];
        if (next && isGate(next.text)) state.playing = false;
        if (state.mode === "flow") openFlow(story.id, true);
        else paintMap();
        armTimer();
      }, 4200);
    }

    function playStory(id) {
      state.focusLink = null;
      state.story = id;
      var story = storyById(id);
      if (story.world) state.world = story.world;
      state.step = 0;
      state.playing = true;
      if (state.mode === "flow") openFlow(id, true);
      else paintMap();
      armTimer();
    }

    vw.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var rect = vw.getBoundingClientRect();
      var factor = Math.exp(-ev.deltaY * 0.0015);
      zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, factor);
    }, { passive: false });

    vw.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".pw-fn, button, a")) return;
      vw.setPointerCapture(ev.pointerId);
      state.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(state.pointers);
      if (ids.length === 1) state.drag = { x: ev.clientX, y: ev.clientY, ox: state.x, oy: state.y };
      if (ids.length === 2) {
        var a = state.pointers[ids[0]];
        var b = state.pointers[ids[1]];
        state.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: state.z };
        state.drag = null;
      }
    });
    vw.addEventListener("pointermove", function (ev) {
      if (!state.pointers[ev.pointerId]) return;
      state.pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(state.pointers);
      if (ids.length >= 2 && state.pinch) {
        var a = state.pointers[ids[0]];
        var b = state.pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        var rect = vw.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, dist / state.pinch.dist);
        state.pinch.dist = dist;
        return;
      }
      if (!state.drag) return;
      state.x = state.drag.ox + (ev.clientX - state.drag.x);
      state.y = state.drag.oy + (ev.clientY - state.drag.y);
      applyTransform();
    });
    function endPointer(ev) {
      delete state.pointers[ev.pointerId];
      if (Object.keys(state.pointers).length < 2) state.pinch = null;
      if (!state.pointers[ev.pointerId]) state.drag = null;
    }
    vw.addEventListener("pointerup", endPointer);
    vw.addEventListener("pointercancel", endPointer);

    nodes.addEventListener("click", function (ev) {
      var func = ev.target.closest("[data-func]");
      if (func) {
        ev.stopPropagation();
        openFlow(func.getAttribute("data-func"));
        return;
      }
      var island = ev.target.closest("[data-island]");
      if (!island) return;
      state.focusLink = null;
      state.playing = false;
      state.panelOpen = true;
      if (state.timer) clearTimeout(state.timer);
      renderWires();
      renderIslandPanel(island.getAttribute("data-island"));
    });

    wires.addEventListener("click", function (ev) {
      var path = ev.target.closest("[data-link]");
      if (!path) return;
      state.focusLink = path.getAttribute("data-link");
      state.playing = false;
      if (state.timer) clearTimeout(state.timer);
      renderWires();
      renderLinkPanel(state.focusLink);
    });

    worldsEl.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-world]");
      if (!btn) return;
      state.world = btn.getAttribute("data-world");
      state.mode = "map";
      state.playing = false;
      if (state.timer) clearTimeout(state.timer);
      renderTabs();
      var pos = POS[state.world];
      if (pos) {
        var rect = vw.getBoundingClientRect();
        var z = Math.max(state.z, 0.72);
        state.z = z;
        state.x = rect.width / 2 - pos.x * z;
        state.y = rect.height / 2 - pos.y * z;
        applyTransform();
      }
      renderWires();
    });

    storiesEl.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-story]");
      if (!btn) return;
      openFlow(btn.getAttribute("data-story"));
    });

    panel.addEventListener("click", function (ev) {
      var act = ev.target.closest("[data-act]");
      var stepBtn = ev.target.closest("[data-step]");
      var storyBtn = ev.target.closest("[data-story]");
      if (storyBtn && panel.contains(storyBtn)) {
        playStory(storyBtn.getAttribute("data-story"));
        return;
      }
      if (stepBtn) {
        state.step = Number(stepBtn.getAttribute("data-step")) || 0;
        state.playing = false;
        if (state.timer) clearTimeout(state.timer);
        if (state.mode === "flow") openFlow(state.story, true);
        else paintMap();
        return;
      }
      if (!act) return;
      var name = act.getAttribute("data-act");
      var story = storyById(state.story);
      if (name === "close") {
        state.panelOpen = false;
        if (state.mode === "flow") closeFlow();
        else panel.classList.remove("is-open");
        return;
      }
      if (name === "play") {
        var onGate = isGate((story.steps[state.step] || {}).text);
        if (onGate) {
          state.playing = false;
          if (state.timer) clearTimeout(state.timer);
          if (state.mode === "flow") openFlow(story.id, true);
          else paintMap();
          return;
        }
        state.playing = !state.playing;
        if (state.mode === "flow") openFlow(story.id, true);
        else paintMap();
        armTimer();
        return;
      }
      if (name === "repeat") {
        playStory(story.id);
        return;
      }
      if (name === "next" || name === "prev") {
        var dir = name === "next" ? 1 : -1;
        state.step = (state.step + dir + story.steps.length) % story.steps.length;
        state.playing = false;
        if (state.timer) clearTimeout(state.timer);
        if (state.mode === "flow") openFlow(story.id, true);
        else paintMap();
      }
    });

    root.querySelector("#pwSim").addEventListener("click", function () {
      state.cruise = !state.cruise;
      sim.textContent = state.cruise ? "Pausar movimiento" : "Reanudar movimiento";
      if (state.cruise || state.playing) runParticles();
      else stopParticles();
    });
    root.querySelector("#pwZoomIn").addEventListener("click", function () {
      var rect = vw.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 1.15);
    });
    root.querySelector("#pwZoomOut").addEventListener("click", function () {
      var rect = vw.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, 1 / 1.15);
    });
    root.querySelector("#pwFit").addEventListener("click", function () {
      state.focusLink = null;
      if (state.mode === "flow") closeFlow();
      fit();
      if (state.mode === "map") renderWires();
    });
    backBtn.addEventListener("click", closeFlow);
    mini.addEventListener("click", function (ev) {
      var rect = mini.getBoundingClientRect();
      var wx = ((ev.clientX - rect.left) / rect.width) * WORLD_W;
      var wy = ((ev.clientY - rect.top) / rect.height) * WORLD_H;
      var view = vw.getBoundingClientRect();
      state.x = view.width / 2 - wx * state.z;
      state.y = view.height / 2 - wy * state.z;
      applyTransform();
    });

    renderNodes();
    showMain();
    paintMap();
    state.playing = false;
    if (state.timer) clearTimeout(state.timer);
    state.cruise = true;
    runParticles();
    if (sim) sim.textContent = "Pausar movimiento";

    fetch("/portal/admin_office_help.json")
      .then(function (res) { return res.json(); })
      .then(function (json) {
        var lessons = [];
        (json.categories || []).forEach(function (cat) {
          (cat.lessons || []).forEach(function (lesson) { lessons.push(lesson); });
        });
        state.guide = lessons;
        if (state.panelOpen || state.mode === "flow") renderPanel();
      })
      .catch(function () {});

    global.PortalWorldCanvas = {
      counts: function () {
        return {
          islands: data.ISLANDS.length,
          links: wires.querySelectorAll("[data-link]").length,
          stories: data.STORIES.length,
          missing: data.ISLANDS.filter(function (island) { return !nodes.querySelector('[data-island="' + island.id + '"]'); }).map(function (island) { return island.id; })
        };
      }
    };
  }

  global.PortalWorldCanvasBoot = boot;
})(typeof window !== "undefined" ? window : globalThis);
