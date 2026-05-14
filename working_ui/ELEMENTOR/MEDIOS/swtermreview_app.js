/**
 * swtermreview.html — term review UI, summary, PDF (jsPDF).
 * Loaded as a classic script after jsPDF. Optional: dynamic import of auth-handler
 * to fill the staff "Name" field from the logged-in user when the URL does not set it.
 */

/* =========================
   Level data
   Notes:
   - Titles do NOT include the word "Section".
   - Colours are controlled by level group (1-2 green, 3-4 orange, 5-6 blue).
   ========================= */

const LEVEL_DATA = {
      1: [
        { title: "Water Familiarisation I", items: [
          { id:"l1_1", text:"Enters water with predictable supported routine" },
          { id:"l1_2", text:"Tolerates splash and water contact on body" },
          { id:"l1_3", text:"Accepts face wetting with support" },
        ]},
        { title: "Water Adaptation I", items: [
          { id:"l1_4", text:"Maintains supported upright position" },
          { id:"l1_5", text:"Holds poolside and releases on cue" },
          { id:"l1_6", text:"Moves short distance with close adult support" },
        ]},
        { title: "Breathing Control I", items: [
          { id:"l1_7", text:"Attempts bubbles or exhale in water" },
          { id:"l1_8", text:"Recovers breathing calmly after splash" },
          { id:"l1_9", text:"Responds to simple breath cue" },
        ]},
        { title: "Water Safety I", items: [
          { id:"l1_10", text:"Responds to stop and wait cues" },
          { id:"l1_11", text:"Returns to wall with support" },
          { id:"l1_12", text:"Demonstrates supported safe poolside behaviour" },
        ]},
      ],
      2: [
        { title: "Water Familiarisation II", items: [
          { id:"l2_1", text:"Enters water with reduced hesitation" },
          { id:"l2_2", text:"Submerges face briefly with support" },
          { id:"l2_3", text:"Transitions between familiar tasks smoothly" },
        ]},
        { title: "Water Adaptation II", items: [
          { id:"l2_4", text:"Maintains supported float position" },
          { id:"l2_5", text:"Rotates body with support and control" },
          { id:"l2_6", text:"Travels short distance with reduced support" },
        ]},
        { title: "Breathing Control II", items: [
          { id:"l2_7", text:"Performs repeatable exhale pattern" },
          { id:"l2_8", text:"Coordinates breath with simple movement" },
          { id:"l2_9", text:"Recovers breathing after submersion with support" },
        ]},
        { title: "Water Safety II", items: [
          { id:"l2_10", text:"Responds to safety cues with reduced prompting" },
          { id:"l2_11", text:"Returns to wall with reduced support" },
          { id:"l2_12", text:"Maintains safe poolside behaviour with reminders" },
        ]},
      ],

      /* If you want Level 3 text to match your official list, replace only this block. */
      3: [
        { title: "Floating and Balance I", items: [
          { id:"l3_1", text:"Maintains float position with reduced support" },
          { id:"l3_2", text:"Transitions between supported positions with confidence" },
          { id:"l3_3", text:"Maintains balance during simple challenge tasks" },
        ]},
        { title: "Streamlining and Rotation I", items: [
          { id:"l3_4", text:"Glides with emerging streamline position" },
          { id:"l3_5", text:"Initiates rotation with minimal support" },
          { id:"l3_6", text:"Maintains body alignment for short travel" },
        ]},
        { title: "Propulsion I", items: [
          { id:"l3_7", text:"Creates propulsion with guided pattern" },
          { id:"l3_8", text:"Coordinates breathing with effort with prompting" },
          { id:"l3_9", text:"Travels with basic directional support" },
        ]},
        { title: "Water Safety III", items: [
          { id:"l3_10", text:"Performs a supported recovery sequence" },
          { id:"l3_11", text:"Maintains calm response during recovery" },
          { id:"l3_12", text:"Returns to safety point with minimal support" },
        ]},
      ],

      4: [
        { title: "Floating and Balance II", items: [
          { id:"l4_1", text:"Holds float positions independently" },
          { id:"l4_2", text:"Transitions between float positions smoothly" },
          { id:"l4_3", text:"Maintains balance during challenge tasks" },
        ]},
        { title: "Streamlining and Rotation II", items: [
          { id:"l4_4", text:"Glide with improved streamline" },
          { id:"l4_5", text:"Controls rotation without support" },
          { id:"l4_6", text:"Maintains body alignment for longer travel" },
        ]},
        { title: "Propulsion II", items: [
          { id:"l4_7", text:"Improves propulsion efficiency" },
          { id:"l4_8", text:"Coordinates breathing with propulsion consistently" },
          { id:"l4_9", text:"Demonstrates directional control" },
        ]},
        { title: "Water Safety IV (Swim Float Swim)", items: [
          { id:"l4_10", text:"Performs supported swim float swim sequence" },
          { id:"l4_11", text:"Demonstrates calm float recovery" },
          { id:"l4_12", text:"Returns independently to safety point" },
        ]},
      ],

      5: [
        { title: "Streamlining and Rotation III", items: [
          { id:"l5_1", text:"Maintains streamline during longer sequences" },
          { id:"l5_2", text:"Controls rotation within continuous movement" },
          { id:"l5_3", text:"Adjusts body position independently" },
        ]},
        { title: "Swimming Strokes", items: [
          { id:"l5_4", text:"Demonstrates refined stroke pattern" },
          { id:"l5_5", text:"Maintains technique under fatigue" },
          { id:"l5_6", text:"Applies stroke choice appropriately" },
        ]},
        { title: "Dive, Starts and Turns I", items: [
          { id:"l5_7", text:"Performs safe and controlled start" },
          { id:"l5_8", text:"Executes turn sequence with reduced support" },
          { id:"l5_9", text:"Pushes off with strong streamlined position" },
        ]},
        { title: "Integrated Water Safety V", items: [
          { id:"l5_10", text:"Applies safe decision making independently" },
          { id:"l5_11", text:"Maintains safety behaviour during excitement" },
          { id:"l5_12", text:"Demonstrates independent safety routine awareness" },
        ]},
      ],

      6: [
        { title: "Stroke Refinement", items: [
          { id:"l6_1", text:"Demonstrates clearer stroke pattern" },
          { id:"l6_2", text:"Coordinates arms and legs more consistently" },
          { id:"l6_3", text:"Maintains improved body alignment" },
        ]},
        { title: "Timing and Rhythm Control", items: [
          { id:"l6_4", text:"Repeats movement with consistent rhythm" },
          { id:"l6_5", text:"Adjusts pace appropriately" },
          { id:"l6_6", text:"Maintains sequence across repetitions" },
        ]},
        { title: "Distance and Endurance", items: [
          { id:"l6_7", text:"Increases distance within ability" },
          { id:"l6_8", text:"Maintains effort without dysregulation" },
          { id:"l6_9", text:"Recovers breathing efficiently between lengths" },
        ]},
        { title: "Dive, Starts and Turns II", items: [
          { id:"l6_10", text:"Demonstrates controlled start entry" },
          { id:"l6_11", text:"Performs turn sequence with coordination" },
          { id:"l6_12", text:"Pushes off wall with consistent alignment" },
        ]},
      ],
    };

    const STAGE_ALLOWED_LEVELS = {
      "Swim Confidence": [1,2],
      "Swim Basic": [3,4],
      "Swim Structured": [5,6],
    };

    const STAGE_DISPLAY = {
      "Swim Confidence": "Stage 1 – Swim Confidence",
      "Swim Basic": "Stage 2 – Swim Basic",
      "Swim Structured": "Stage 3 – Swim Structured",
    };

    let selectedStage = "";
    let selectedLevel = 0;

    let lastTermSummarySections = [];
    /* =========================
       Helpers
       ========================= */
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

    function showToast(msg){
      const t = $("#toast");
      if(!t) return;
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 2200);
    }

    function levelGroupClass(level){
      if(level === 1 || level === 2) return "lvl12";
      if(level === 3 || level === 4) return "lvl34";
      return "lvl56";
    }
    function levelGroupColour(level){
      if(level === 1 || level === 2) return getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
      if(level === 3 || level === 4) return getComputedStyle(document.documentElement).getPropertyValue("--orange").trim();
      return getComputedStyle(document.documentElement).getPropertyValue("--blue").trim();
    }

    function clearActives(groupSelector){
      $$(groupSelector).forEach(el => el.classList.remove("active"));
    }

    function applyStageRules(){
      const allowed = STAGE_ALLOWED_LEVELS[selectedStage] || [];
      $$("#levelTiles .tile.level").forEach(tile => {
        const lvl = Number(tile.dataset.level);
        const isAllowed = allowed.includes(lvl);
        tile.classList.toggle("disabled", !isAllowed);
        const input = tile.querySelector("input");
        input.disabled = !isAllowed;
        if(!isAllowed){
          tile.classList.remove("active");
          input.checked = false;
          if(selectedLevel === lvl){
            selectedLevel = 0;
          }
        }
      });
    }

    /* =========================
       Level Confirmation render
       ========================= */
    function buildTriBtn(name, value, labelHtml, extraClass){
      const lbl = document.createElement("label");
      lbl.className = `triBtn ${extraClass || ""}`.trim();
      lbl.innerHTML = `<input type="radio" name="${name}" value="${value}">${labelHtml}`;
      lbl.addEventListener("click", () => {
        const grid = lbl.closest(".triGrid");
        if(!grid) return;
        grid.querySelectorAll(".triBtn").forEach(b => b.classList.remove("active"));
        lbl.classList.add("active");
        updateLevelConfirmationProgress();
        autoSetTermDecision();
      });
      return lbl;
    }

    function renderFocusAreasForLevel(levelNumber){
      const wrap = $("#focusWrap");
      if(!wrap) return;
      wrap.innerHTML = "";
      if(!levelNumber || !LEVEL_DATA[levelNumber]){
        $("#countTxt").textContent = "Select a level to start";
        $("#badgeTxt").textContent = "Level progress not set";
        $("#meterFill").style.width = "0%";
        $("#percentTxt").textContent = "Completion 0 percent";
        generateTermSummary();
        return;
      }

      const groupCls = levelGroupClass(levelNumber);
      const blocks = LEVEL_DATA[levelNumber];

      blocks.forEach(block => {
        const sec = document.createElement("div");
        sec.className = "focusSection";

        const head = document.createElement("div");
        head.className = "focusHead";
        head.innerHTML = `<p class="focusTitle">${String(block.title || "").toUpperCase()}</p>`;
        sec.appendChild(head);

        (block.items || []).forEach((it, idx) => {
          const item = document.createElement("div");
          item.className = `focusItem ${groupCls}`;

          const p = document.createElement("p");
          p.className = "focusLine";
          p.textContent = `${idx + 1}. ${it.text || ""}`;
          item.appendChild(p);

          const grid = document.createElement("div");
          grid.className = "triGrid";

          const rName = `lvl_${levelNumber}_${it.id || (block.title + "_" + idx)}`;

          const b1 = buildTriBtn(rName, "Fully supported", "Fully<br>supported", "");
          const b2 = buildTriBtn(rName, "Partially supported", "Partially<br>supported", "");
          const b3 = buildTriBtn(rName, "Independent", "Independent", "Independent");

          grid.appendChild(b1);
          grid.appendChild(b2);
          grid.appendChild(b3);

          item.appendChild(grid);
          sec.appendChild(item);
        });

        wrap.appendChild(sec);
      });

      updateLevelConfirmationProgress();
      autoSetTermDecision();
      generateTermSummary();
    }

    function getAllLevelRatings(){
      if(!selectedLevel) return [];
      const wrap = $("#focusWrap");
      const radios = $$(`input[type="radio"][name^="lvl_${selectedLevel}_"]`, wrap);
      const names = Array.from(new Set(radios.map(r => r.name)));
      return names.map(n => {
        const checked = $(`input[name="${n}"]:checked`, wrap);
        return checked ? checked.value : "";
      });
    }

    function computeLevelProgressLabel(ratings){
      const total = ratings.length;
      const answered = ratings.filter(Boolean).length;

      // values: Fully supported=1, Partially supported=2, Independence=3
      const score = ratings.reduce((acc, v) => {
        if(v === "Fully supported") return acc + 1;
        if(v === "Partially supported") return acc + 2;
        if(v === "Independent") return acc + 3;
        return acc + 0;
      }, 0);

      const maxScore = total * 3;
      const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;

      // Building / Progressing / Secure based on percentage
      let label = "Not set";
      if(answered === 0) label = "Not set";
      else if(pct < 55) label = "Building";
      else if(pct < 80) label = "Progressing";
      else label = "Secure";

      return { label, pct, answered, total };
    }

    function buildLevelOutcomeNarrative(info, ratings){
      const { label, pct, answered, total } = info;
      const c = { full: 0, partial: 0, ind: 0 };
      ratings.forEach(v => {
        if(v === "Fully supported") c.full++;
        else if(v === "Partially supported") c.partial++;
        else if(v === "Independent") c.ind++;
      });

      if(!selectedLevel){
        return "Once a swimming level is recorded, this note summarises—in plain language—how pool skills are coming together. It is based on lesson observations and indicates how settled those skills appear overall.";
      }
      if(!total){
        return "No focus skills are listed for this level on this summary. Programme questions can be discussed with the service at the pool.";
      }
      if(answered === 0){
        return "Not every pool skill for this level has been entered on this summary yet. When complete, one of three labels will appear—Building, Progressing, or Secure—meaning still taking shape, moving forward with support, or well established for this level. The label is there to describe progress in the water for families and carers.";
      }

      let pattern = "";
      const share = (n) => (answered ? n / answered : 0);
      if(share(c.ind) >= 0.55){
        pattern = "Across the skills reviewed, the participant is often swimming with less hands-on help than before, which usually reflects growing comfort and capability in the water.";
      }else if(share(c.partial) >= 0.45){
        pattern = "Many skills sit in a middle phase: the participant achieves them with regular guidance or light physical support, and those successful moments are slowly becoming more frequent.";
      }else if(share(c.full) >= 0.45){
        pattern = "Several skills still call for close instructor support much of the time, which is typical while strength, timing, and confidence continue to develop.";
      }else{
        pattern = "The pattern varies from one skill to the next—stronger performance in some areas and more time needed in others is expected.";
      }

      if(label === "Building"){
        return (
          "At this level, the overall profile is described as Building (" + pct + "% on the programme scale): foundations are still growing and need clear structure, patience, and encouragement during sessions. " +
          pattern +
          " Lessons typically repeat key movements and familiar routines so confidence can build."
        );
      }
      if(label === "Progressing"){
        return (
          "The overall profile is described as Progressing (" + pct + "% on the programme scale): skills are advancing, and support is reduced only where safety and readiness allow. " +
          pattern +
          " Swimming may feel somewhat more familiar across successive lessons, including days that are tiring—or progress feels uneven; that variation is a normal part of learning."
        );
      }
      return (
        "The overall profile is described as Secure (" + pct + "% on the programme scale): performance at this level appears well matched to expectations, with fundamentals relatively steady. " +
        pattern +
        " Any step toward a higher demand is taken gradually so that confidence remains the priority."
      );
    }

    function getLevelOutcomeForSummary(){
      const ratings = getAllLevelRatings();
      const info = computeLevelProgressLabel(ratings);
      let headline = "Level outcome: Not set";
      if(!selectedLevel){
        headline = "Level outcome: Not set";
      }else if(!info.total){
        headline = "Level outcome: Not set";
      }else if(info.answered === 0){
        headline = "Level outcome: Not set";
      }else{
        headline = "Level outcome: " + info.label + " (" + info.pct + "%)";
      }
      return {
        headline,
        narrative: buildLevelOutcomeNarrative(info, ratings),
        info,
      };
    }

    function updateLevelConfirmationProgress(){
      const ratings = getAllLevelRatings();
      const info = computeLevelProgressLabel(ratings);

      const countTxt = $("#countTxt");
      const meterFill = $("#meterFill");
      const percentTxt = $("#percentTxt");
      const swatch = $("#badgeSwatch");
      const badgeTxt = $("#badgeTxt");
      if(!countTxt || !meterFill || !percentTxt || !swatch || !badgeTxt) return;

      countTxt.textContent = `${info.answered} of ${info.total} rated`;
      meterFill.style.width = `${info.pct}%`;
      percentTxt.textContent = `Completion ${info.pct} percent`;

      if(!selectedLevel){
        swatch.style.background = "var(--blueDeep)";
        badgeTxt.textContent = "Level progress not set";
        return;
      }

      swatch.style.background = levelGroupColour(selectedLevel);
      badgeTxt.textContent = info.label;
    }

    function isLevelSecure100(){
      const ratings = getAllLevelRatings();
      if(!ratings.length) return false;
      const allAnswered = ratings.every(Boolean);
      const allIndependence = ratings.every(v => v === "Independent");
      return allAnswered && allIndependence;
    }

    function setTermDecision(value){
      const map = {
        "Transition to Next Stage": "td_transition",
        "Consolidate Current Level": "td_consolidate",
      };
      const id = map[value];
      if(!id) return;
      const el = $("#" + id);
      if(!el) return;
      el.checked = true;
    }

    function autoSetTermDecision(){
      // Rule 1: if Level is Secure at 100 percent -> Transition to Next Stage
      if(selectedLevel && isLevelSecure100()){
        setTermDecision("Transition to Next Stage");
        return;
      }

      // Rule 2: if current level is 2 or 4 and there is clear progress, mark Transition to Next Stage
      // Clear progress: at least 80 percent overall from the Level Confirmation score model
      if(selectedLevel === 2 || selectedLevel === 4){
        const info = computeLevelProgressLabel(getAllLevelRatings());
        if(info.label === "Secure"){
          setTermDecision("Transition to Next Stage");
        }
      }
    }

    /* =========================
       Core Development Areas
       ========================= */
    const RSI_VALUE = { "Rarely":1, "Sometimes":2, "Always":3 };

    function computeDomainResult(domain){
      const radios = $$(`.rsiGrid[data-rsi-domain="${domain}"] input[type="radio"]:checked`);
      const totalItems = $$(`.rsiGrid[data-rsi-domain="${domain}"]`).length;
      const answered = radios.length;

      const score = radios.reduce((acc, r) => acc + (RSI_VALUE[r.value] || 0), 0);
      const maxScore = totalItems * 3;
      const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;

      // Parent facing label
      let label = "Not set";
      if(answered === 0) label = "Not set";
      else if(pct < 55) label = "Building";
      else if(pct < 80) label = "Progressing";
      else label = "Secure";

      // Stars 1-5 from pct
      let stars = 0;
      if(answered === 0) stars = 0;
      else if(pct < 20) stars = 1;
      else if(pct < 40) stars = 2;
      else if(pct < 60) stars = 3;
      else if(pct < 80) stars = 4;
      else stars = 5;

      return { totalItems, answered, pct, label, stars };
    }

    function collectRSIRatings(domainKey){
      const vals = [];
      document.querySelectorAll('.rsiGrid[data-rsi-domain="' + domainKey + '"]').forEach(grid => {
        const ck = grid.querySelector('input[type="radio"]:checked');
        vals.push(ck ? ck.value : "");
      });
      return vals;
    }

    function buildCoreDomainSummaryNarrative(domainKey, res){
      const { label, pct, answered } = res;
      const names = {
        engagement: "engagement in lessons",
        independence: "independence during activities",
        regulation: "regulation and comfort in the session",
      };
      const name = names[domainKey] || domainKey;
      const answeredVals = collectRSIRatings(domainKey).filter(Boolean);
      const a = answeredVals.length;

      if(!answered || !a){
        return "When completed, this paragraph summarises how the participant is progressing in " + name + ", using straightforward language. Building, Progressing, and Secure indicate whether patterns are still emerging, advancing steadily, or well established within sessions.";
      }

      let r = 0;
      let som = 0;
      let alw = 0;
      answeredVals.forEach(v => {
        if(v === "Rarely") r++;
        else if(v === "Sometimes") som++;
        else if(v === "Always") alw++;
      });

      let pattern = "";
      if(alw / a >= 0.55){
        pattern = "Most observations were recorded in the highest category on the checklist: the relevant behaviour was seen frequently and with reasonable consistency across lessons.";
      }else if(som / a >= 0.45){
        pattern = "Most observations were recorded in the middle category: the behaviour appeared on many occasions, with normal variation from one lesson to the next.";
      }else if(r / a >= 0.45){
        pattern = "Most observations were recorded in the entry category: the behaviour appears less often at present. That pattern often reflects an area still opening up, where calm pacing and familiar structure in the water help.";
      }else{
        pattern = "Observations vary between checklist items—stronger in some areas and requiring more time in others—which is a common profile.";
      }

      if(label === "Building"){
        return (
          "This term, " + name + " is summarised as Building (" + pct + "% on the observation scale): patterns may still look uneven or new. " +
          pattern +
          " Session planning tends to emphasise small, achievable steps so the participant can build safety and confidence in those areas."
        );
      }
      if(label === "Progressing"){
        return (
          "This term, " + name + " is summarised as Progressing (" + pct + "% on the observation scale): forward movement is evident, although individual sessions will differ. " +
          pattern +
          " Lesson content typically links acknowledgement of progress with the next manageable step."
        );
      }
      return (
        "This term, " + name + " is summarised as Secure (" + pct + "% on the observation scale): recorded observations point to a fairly steady pattern in this area. " +
        pattern +
        " Activities often follow familiar structures; new elements are introduced while the participant remains comfortable."
      );
    }

    function setStars(el, count){
      const full = "★★★★★".slice(0, count);
      const empty = "☆☆☆☆☆".slice(0, 5 - count);
      el.textContent = full + empty;
    }

    function updateDomainUI(domain){
      const res = computeDomainResult(domain);
      const countEl = $(`[data-domain-count="${domain}"]`);
      const labelEl = $(`[data-domain-label="${domain}"]`);
      const starEl = $(`[data-domain-stars="${domain}"]`);
      const fillEl = $(`[data-domain-fill="${domain}"]`);
      if(!countEl || !labelEl || !starEl || !fillEl) return;

      countEl.textContent = `${res.answered} of ${res.totalItems} rated`;
      labelEl.textContent = res.label;
      setStars(starEl, res.stars);
      fillEl.style.width = `${res.pct}%`;
    }

    function wireRSIButtons(){
      $$(".rsiBtn").forEach(btn => {
        btn.addEventListener("click", () => {
          const grid = btn.closest(".rsiGrid");
          if(!grid) return;
          grid.querySelectorAll(".rsiBtn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");

          const domain = grid.getAttribute("data-rsi-domain");
          updateDomainUI(domain);
        });
      });
    }

    /* =========================
       1. Details — lectura (fecha / término / nombre) + participante con autocompletado (clients_info)
       ========================= */
    const PORTAL_CLIENTS_INFO_SCRIPT = "https://www.clubsensational.org/wp-content/uploads/2026/05/clients_info_embed.js?v=20260419-99";
    const PORTAL_AUTH_HANDLER_FILE = "auth-handler.js?v=20260419-99";
    const PORTAL_DOCUMENTS_MODULE_V = "20260423-13";

    let cachedPortalDocumentsMod = null;
    async function importPortalDocumentsModuleSwterm(){
      if(cachedPortalDocumentsMod) return cachedPortalDocumentsMod;
      const bases = swtermPortalUploadBases();
      let lastErr;
      for(let i = 0; i < bases.length; i++){
        const url = bases[i] + "/portal_documents.js?v=" + PORTAL_DOCUMENTS_MODULE_V;
        try{
          const mod = await import(url);
          if(mod && typeof mod.portalUploadPdfAndCreateDocument === "function" && typeof mod.portalRequireUser === "function"){
            cachedPortalDocumentsMod = mod;
            return mod;
          }
        }catch(e){
          lastErr = e;
        }
      }
      throw lastErr || new Error("Could not load portal_documents.js. Upload it to wp-content/uploads/2026/05/ or set window.PORTAL_WP_UPLOADS_BASE.");
    }

    function closeOrReturnSwterm(){
      try{
        if(typeof window.portalGetPortalReturnUrl === "function"){
          const ret = window.portalGetPortalReturnUrl();
          if(ret){
            window.location.replace(ret);
            return;
          }
        }
      }catch(_){}
      try{
        if(typeof portalRedirectToPortalReturn === "function"){
          portalRedirectToPortalReturn();
          return;
        }
      }catch(_){}
      try{
        window.close();
        setTimeout(() => { window.location.href = "/p1/"; }, 180);
      }catch(_){
        window.location.href = "/p1/";
      }
    }

    function loadPortalScriptOnceTerm(src){
      return new Promise((resolve, reject) => {
        const nodes = document.getElementsByTagName("script");
        for(let i = 0; i < nodes.length; i++){
          if(nodes[i].src === src){ resolve(); return; }
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("load failed: " + src));
        document.head.appendChild(s);
      });
    }

    function decodeQsTerm(s){
      let t = String(s || "").trim();
      if(!t) return "";
      try{
        if(t.indexOf("%") !== -1) t = decodeURIComponent(t.replace(/\+/g, " "));
      }catch(_){}
      return t.replace(/\+/g, " ").trim();
    }

    function parseDetailsFromUrl(){
      const qs = new URLSearchParams(typeof location !== "undefined" && location.search ? location.search : "");
      return {
        name: decodeQsTerm(qs.get("name") || qs.get("clientName") || qs.get("client") || qs.get("swimmer") || ""),
        date: decodeQsTerm(qs.get("date") || qs.get("reviewDate") || ""),
        term: decodeQsTerm(qs.get("term") || ""),
        instructor: decodeQsTerm(qs.get("instructor") || qs.get("instructorName") || ""),
      };
    }

    function todayIsoSwterm(){
      const d = new Date();
      return d.toISOString().slice(0, 10);
    }

    function formatReviewDateDisplayStrict(iso){
      const raw = String(iso || "").trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "—";
      const p = raw.split("-").map(Number);
      const d = new Date(p[0], p[1] - 1, p[2]);
      if(Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }

    function defaultTermForToday(){
      const m = new Date().getMonth();
      if(m >= 8 && m <= 11) return "Autumn Term (Sep, Oct, Nov & Dec)";
      if(m >= 0 && m <= 2) return "Spring Term (Jan, Feb & Mar)";
      return "Summer Term (Apr, May, Jun & Jul)";
    }

    function pickTermFromQuery(qRaw){
      const sel = document.getElementById("termSelect");
      if(!sel) return;
      const q = decodeQsTerm(qRaw).toLowerCase().replace(/\s+/g, " ").trim();
      if(!q) return;
      const opts = Array.from(sel.querySelectorAll("option"));
      for(let i = 0; i < opts.length; i++){
        const v = String(opts[i].value || "").trim();
        if(!v) continue;
        const vl = v.toLowerCase();
        const tl = String(opts[i].textContent || "").trim().toLowerCase();
        if(vl === q || tl === q || vl.indexOf(q) !== -1 || q.indexOf(vl) !== -1 || tl.indexOf(q) !== -1){
          sel.value = v;
          return;
        }
      }
    }

    function applyDetailsFromUrlAndDefaults(){
      const p = parseDetailsFromUrl();
      const dateEl = document.getElementById("reviewDate");
      const termEl = document.getElementById("termSelect");
      const instEl = document.getElementById("instructorName");
      const swimEl = document.getElementById("swimmerName");
      if(dateEl){
        let d = p.date;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = todayIsoSwterm();
        dateEl.value = d;
      }
      if(termEl){
        if(p.term) pickTermFromQuery(p.term);
        if(!String(termEl.value || "").trim()){
          const guess = defaultTermForToday();
          const hit = Array.from(termEl.options).find(o => String(o.value || "").trim() === guess);
          if(hit) termEl.value = guess;
        }
      }
      if(instEl) instEl.value = (p.instructor || "").trim();
      if(swimEl && p.name) swimEl.value = p.name;
    }

    function syncDetailsReadonlyDisplay(){
      const dateHidden = document.getElementById("reviewDate");
      const dateSpan = document.getElementById("reviewDateDisplay");
      if(dateSpan && dateHidden) dateSpan.textContent = formatReviewDateDisplayStrict(dateHidden.value);

      const termEl = document.getElementById("termSelect");
      const termSpan = document.getElementById("termSelectDisplay");
      if(termSpan && termEl){
        const opt = termEl.options[termEl.selectedIndex];
        const t = opt ? String(opt.textContent || "").trim() : "";
        termSpan.textContent = t || "—";
      }

      const instHidden = document.getElementById("instructorName");
      const instSpan = document.getElementById("instructorNameDisplay");
      if(instSpan && instHidden){
        const v = String(instHidden.value || "").trim();
        instSpan.textContent = v || "—";
      }
    }

    function swtermPortalUploadBases(){
      const bases = [];
      try{
        if(typeof window !== "undefined" && window.PORTAL_WP_UPLOADS_BASE){
          bases.push(String(window.PORTAL_WP_UPLOADS_BASE).trim().replace(/\/$/, ""));
        }
      }catch(_){}
      try{
        if(typeof location !== "undefined" && location.origin){
          bases.push(String(location.origin).replace(/\/$/, "") + "/wp-content/uploads/2026/05");
        }
      }catch(_){}
      bases.push("https://www.clubsensational.org/wp-content/uploads/2026/05");
      bases.push("https://clubsensational.org/wp-content/uploads/2026/05");
      const seen = {};
      return bases.filter(b => {
        if(!b || seen[b]) return false;
        seen[b] = true;
        return true;
      });
    }

    async function tryImportPortalAuthHandler(){
      const bases = swtermPortalUploadBases();
      let lastErr;
      for(let i = 0; i < bases.length; i++){
        const url = bases[i] + "/" + PORTAL_AUTH_HANDLER_FILE;
        try{
          const mod = await import(url);
          if(mod && typeof mod.getSupabaseClient === "function") return mod;
        }catch(e){
          lastErr = e;
        }
      }
      throw lastErr || new Error("auth-handler import failed");
    }

    /**
     * When #instructorName is empty (no URL ?instructor=), load Supabase via auth-handler
     * and set display name from staff_profiles or auth user metadata.
     */
    async function hydrateLoggedInStaffDisplayName(){
      const instEl = document.getElementById("instructorName");
      if(!instEl || String(instEl.value || "").trim()) return;

      let getSupabaseClient;
      try{
        const mod = await tryImportPortalAuthHandler();
        getSupabaseClient = mod.getSupabaseClient;
      }catch(e){
        console.warn("[swtermreview] Could not load auth-handler for staff name", e);
        return;
      }

      try{
        const supabase = getSupabaseClient();
        if(!supabase) return;

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if(authErr || !authData || !authData.user) return;
        const user = authData.user;

        let display = "";
        const { data: profileRow, error: profileErr } = await supabase
          .from("staff_profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .maybeSingle();
        if(!profileErr && profileRow){
          display = String(profileRow.full_name || profileRow.username || "").trim();
        }
        if(!display && user.user_metadata && typeof user.user_metadata === "object"){
          const md = user.user_metadata;
          display = String(md.full_name || md.name || "").trim();
        }
        if(!display && user.email){
          const local = String(user.email).split("@")[0].trim();
          if(local) display = local.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
        }
        if(!display) return;

        instEl.value = display;
        syncDetailsReadonlyDisplay();
        try{
          generateTermSummary();
        }catch(_){}
      }catch(e){
        console.warn("[swtermreview] Staff name from auth failed", e);
      }
    }

    function getPortalClientNamesSorted(){
      const rows = Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS) ? window.PORTAL_CLIENTS_INFO_ROWS : [];
      const map = new Map();
      rows.forEach(r => {
        const nm = String(r && r.client_name != null ? r.client_name : "").trim();
        if(nm) map.set(nm.toLowerCase(), nm);
      });
      return Array.from(map.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    function wireSwimmerAutocomplete(){
      const input = document.getElementById("swimmerName");
      const list = document.getElementById("swimmerSuggest");
      if(!input || !list) return;

      let blurTimer = null;

      function setOpen(open){
        list.hidden = !open;
        input.setAttribute("aria-expanded", open ? "true" : "false");
      }

      function closeList(){
        setOpen(false);
        list.replaceChildren();
      }

      function pickName(name){
        input.value = name;
        closeList();
        try{ input.dispatchEvent(new Event("input", { bubbles: true })); }catch(_){}
        try{ input.dispatchEvent(new Event("change", { bubbles: true })); }catch(_){}
        generateTermSummary();
      }

      function renderList(query){
        const q = String(query || "").trim();
        list.replaceChildren();
        if(q.length < 1){
          setOpen(false);
          return;
        }
        const all = getPortalClientNamesSorted();
        const ql = q.toLowerCase();
        const matches = all.filter(n => n.toLowerCase().includes(ql)).slice(0, 18);
        if(!matches.length){
          setOpen(false);
          return;
        }
        matches.forEach((name, idx) => {
          const b = document.createElement("button");
          b.type = "button";
          b.role = "option";
          b.id = "swimmerSuggestOpt-" + idx;
          b.textContent = name;
          b.addEventListener("mousedown", ev => {
            ev.preventDefault();
            pickName(name);
          });
          list.appendChild(b);
        });
        setOpen(true);
      }

      input.addEventListener("input", () => {
        clearTimeout(blurTimer);
        renderList(input.value);
        generateTermSummary();
      });

      input.addEventListener("focus", () => {
        renderList(input.value);
      });

      input.addEventListener("keydown", ev => {
        if(ev.key === "Escape"){
          closeList();
          return;
        }
        if(ev.key !== "Enter") return;
        const first = list.querySelector("button");
        if(first && !list.hidden){
          ev.preventDefault();
          pickName(first.textContent || "");
        }
      });

      input.addEventListener("blur", () => {
        blurTimer = setTimeout(() => closeList(), 160);
      });

      document.addEventListener("click", ev => {
        const wrap = document.getElementById("swimmerComboWrap");
        if(wrap && !wrap.contains(ev.target)) closeList();
      });
    }

    function initSwtermDetailsPanel(){
      applyDetailsFromUrlAndDefaults();
      syncDetailsReadonlyDisplay();
      const wire = () => {
        try{ wireSwimmerAutocomplete(); }catch(e){ console.warn("[swtermreview] autocomplete", e); }
      };
      if(Array.isArray(window.PORTAL_CLIENTS_INFO_ROWS) && window.PORTAL_CLIENTS_INFO_ROWS.length){
        wire();
      }else{
        loadPortalScriptOnceTerm(PORTAL_CLIENTS_INFO_SCRIPT).then(wire).catch(wire);
      }
      void hydrateLoggedInStaffDisplayName().catch(() => {});
    }

    /* =========================
       Term Review Summary + PDF
       ========================= */
    function fieldValTerm(id){
      const el = document.getElementById(id);
      return el ? String(el.value || "").trim() : "";
    }
    function escapeHtmlTerm(t){
      const d = document.createElement("div");
      d.textContent = t;
      return d.innerHTML;
    }
    function formatBulletLineHtmlTerm(line){
      const safe = escapeHtmlTerm(line || "");
      const idx = safe.indexOf(":");
      if(idx === -1) return safe;
      return "<strong>" + safe.slice(0, idx + 1) + "</strong>" + safe.slice(idx + 1);
    }
    function formatMultilineBulletLineHtmlTerm(line){
      const raw = line || "";
      const br = raw.indexOf("\n");
      if(br === -1) return formatBulletLineHtmlTerm(raw);
      const head = raw.slice(0, br).trim();
      const tail = raw.slice(br + 1).trim();
      return formatBulletLineHtmlTerm(head) + (tail ? "<br>" + escapeHtmlTerm(tail).replace(/\n/g, "<br>") : "");
    }
    function bulletLineHtmlTerm(line){
      if(line && line.indexOf("\n") !== -1) return formatMultilineBulletLineHtmlTerm(line);
      return formatBulletLineHtmlTerm(line);
    }
    function renderTermReportHtml(sections){
      return sections.map(s => {
        let inner = "";
        if(s.type === "levelConfirmation"){
          const o = s.outcome;
          let outcomeHtml = "";
          if(o && o.headline){
            outcomeHtml =
              "<div class=\"lc-outcome-wrap\">" +
              "<p>" + formatBulletLineHtmlTerm(o.headline) + "</p>" +
              "<p class=\"lc-outcome-narrative\">" + escapeHtmlTerm(o.narrative).replace(/\n/g, "<br>") + "</p>" +
              "</div>";
          }
          const blocks = Array.isArray(s.blocks) ? s.blocks : [];
          const html = blocks.map(b => {
            const title = escapeHtmlTerm(b.title || "");
            const lines = Array.isArray(b.lines) ? b.lines : [];
            const list = "<ul>" + lines.map(line => "<li>" + bulletLineHtmlTerm(line) + "</li>").join("") + "</ul>";
            return "<div class=\"lc-block\"><div class=\"lc-title\">" + title + "</div>" + list + "</div>";
          }).join("");
          inner = "<div class=\"report-block-body lc-wrap\">" + html + outcomeHtml + "</div>";
        }else if(s.type === "coreDevelopment"){
          const blocks = Array.isArray(s.blocks) ? s.blocks : [];
          const html = blocks.map(b => {
            const title = escapeHtmlTerm(b.title || "");
            const lines = Array.isArray(b.lines) ? b.lines : [];
            const list = "<ul>" + lines.map(l => "<li>" + bulletLineHtmlTerm(l) + "</li>").join("") + "</ul>";
            const so = b.summaryOutcome;
            let summaryHtml = "";
            if(so && so.headline){
              summaryHtml =
                "<div class=\"lc-outcome-wrap\">" +
                "<p>" + formatBulletLineHtmlTerm(so.headline) + "</p>" +
                "<p class=\"lc-outcome-narrative\">" + escapeHtmlTerm(so.narrative).replace(/\n/g, "<br>") + "</p>" +
                "</div>";
            }
            return "<div class=\"lc-block\"><div class=\"lc-title\">" + title + "</div>" + list + summaryHtml + "</div>";
          }).join("");
          inner = "<div class=\"report-block-body lc-wrap\">" + html + "</div>";
        }else if(s.type === "bullets"){
          inner = "<div class=\"report-block-body\"><ul>" + s.lines.map(l => "<li>" + bulletLineHtmlTerm(l) + "</li>").join("") + "</ul></div>";
        }else{
          const paras = (s.body || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          inner = "<div class=\"report-block-body\">" + paras.map((p, idx) => {
            if(s.title === "1. Term review details" || s.title === "2. Stage and level" || s.title === "5. Term decision"){
              return "<p>" + p.split("\n").map(line => formatBulletLineHtmlTerm(line)).join("<br>") + "</p>";
            }
            if(s.title === "3. Level confirmation"){
              if(idx === 0) return "<p>" + formatBulletLineHtmlTerm(p) + "</p>";
              return "<p class=\"lc-outcome-narrative\">" + escapeHtmlTerm(p).replace(/\n/g, "<br>") + "</p>";
            }
            return "<p>" + escapeHtmlTerm(p).replace(/\n/g, "<br>") + "</p>";
          }).join("") + "</div>";
        }
        return "<div class=\"report-block\"><div class=\"report-block-title\">" + escapeHtmlTerm(s.title) + "</div>" + inner + "</div>";
      }).join("");
    }
    function hasAnyTermReviewContent(){
      if(fieldValTerm("swimmerName")) return true;
      if(fieldValTerm("reviewDate")) return true;
      if(fieldValTerm("termSelect")) return true;
      if(fieldValTerm("instructorName")) return true;
      if(selectedStage) return true;
      if(selectedLevel) return true;
      if(document.querySelector("#termDecision input[type=\"radio\"]:checked")) return true;
      if(fieldValTerm("decisionNotes")) return true;
      if(fieldValTerm("eviRegulation") || fieldValTerm("eviIndependence") || fieldValTerm("eviEngagement")) return true;
      if(document.querySelector(".rsiGrid input[type=\"radio\"]:checked")) return true;
      if(document.querySelector("#focusWrap input[type=\"radio\"]:checked")) return true;
      return false;
    }
    function buildTermReviewSummarySections(){
      const sections = [];
      const stageLabel = selectedStage ? (STAGE_DISPLAY[selectedStage] || selectedStage) : "—";
      const levelLabel = selectedLevel ? ("Level " + selectedLevel) : "—";

      const stageBlurb = (() => {
        if(!selectedStage) return "";
        const tile = document.querySelector(`#stageTiles .tile.stage[data-stage="${CSS.escape(selectedStage)}"]`);
        const blurbEl = tile ? tile.querySelector(".desc.stageBlurb") : null;
        return blurbEl ? blurbEl.textContent.replace(/\s+/g, " ").trim() : "";
      })();

      const levelBlurb = (() => {
        if(!selectedLevel) return "";
        const tile = document.querySelector(`#levelTiles .tile.level[data-level="${selectedLevel}"]`);
        if(!tile) return "";
        const lines = Array.from(tile.querySelectorAll(".levelSub"))
          .map(el => (el.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .map(t => t.replace(/^\-\s*/, "")); // remove leading "- "
        return lines.join(" ");
      })();

      const reviewIsoDetail = fieldValTerm("reviewDate");
      const dateOfReviewDisplay = reviewIsoDetail
        ? formatReviewDateLongEn(reviewIsoDetail)
        : "—";
      sections.push({
        type: "paragraph",
        title: "1. Term review details",
        body: [
          "Participant: " + (fieldValTerm("swimmerName") || "—"),
          "Date of review: " + dateOfReviewDisplay,
          "Term: " + (fieldValTerm("termSelect") || "—"),
          "Name: " + (fieldValTerm("instructorName") || "—"),
        ].join("\n"),
      });
      sections.push({
        type: "paragraph",
        title: "2. Stage and level",
        body:
          "Stage:\n" +
          stageLabel + (stageBlurb ? " (" + stageBlurb + ")" : "") +
          "\n\n" +
          "Current level:\n" +
          levelLabel + (levelBlurb ? " (" + levelBlurb + ")" : ""),
      });
      const levelOutcome = getLevelOutcomeForSummary();
      const focusWrap = document.getElementById("focusWrap");
      const lcLines = [];
      if(focusWrap && selectedLevel){
        focusWrap.querySelectorAll(".focusSection").forEach(sec => {
          const titleEl = sec.querySelector(".focusTitle");
          let secTitle = titleEl ? titleEl.textContent.replace(/\s+/g, " ").trim() : "";
          // Summary: roman numerals in section headings are not needed (I, II, III, IV, V, VI...)
          secTitle = secTitle.replace(/\s+\b[IVX]+\b$/i, "").trim();
          const items = Array.from(sec.querySelectorAll(".focusItem"));
          if(secTitle && items.length) lcLines.push(secTitle);

          items.forEach(item => {
            const lineEl = item.querySelector(".focusLine");
            const checked = item.querySelector(".triGrid input[type=\"radio\"]:checked");
            const raw = lineEl ? lineEl.textContent.replace(/\s+/g, " ").trim() : "";
            const text = focusLineShort(raw);
            const r = checked ? checked.value : "(not rated)";
            if(text) lcLines.push(text + ": " + r);
          });
        });
      }
      if(lcLines.length){
        // Group by section heading and render without bullets
        const blocks = [];
        let current = null;
        lcLines.forEach(line => {
          const isHeading = !line.includes(":");
          if(isHeading){
            current = { title: line, lines: [] };
            blocks.push(current);
          }else{
            if(!current){
              current = { title: "Level focus", lines: [] };
              blocks.push(current);
            }
            current.lines.push(line);
          }
        });
        sections.push({ type: "levelConfirmation", title: "3. Level confirmation", outcome: levelOutcome, blocks });
      }else{
        sections.push({
          type: "paragraph",
          title: "3. Level confirmation",
          body: levelOutcome.headline + "\n\n" + levelOutcome.narrative,
        });
      }

      // 4. Core development areas (Engagement, Independence, Regulation)
      const coreBlocks = [];
      ["engagement", "independence", "regulation"].forEach(domain => {
        const res = computeDomainResult(domain);
        const dTitle = domain.charAt(0).toUpperCase() + domain.slice(1);
        const lines = [];
        document.querySelectorAll('.rsiGrid[data-rsi-domain="' + domain + '"]').forEach(grid => {
          const row = grid.closest(".obsRow");
          const titleLine = row ? row.querySelector(".obsTitleLine") : null;
          const title = titleLine ? titleLine.textContent.replace(/\s+/g, " ").trim() : "Observation item";
          const ck = grid.querySelector('input[type="radio"]:checked');
          lines.push(title + ": " + (ck ? ck.value : "(not rated)"));
        });

        // Evidence shown inside each category block (not as a separate section)
        const evidenceMap = {
          regulation: fieldValTerm("eviRegulation"),
          independence: fieldValTerm("eviIndependence"),
          engagement: fieldValTerm("eviEngagement"),
        };
        const ev = (evidenceMap[domain] || "").trim();
        if(ev){
          lines.push("Evidence:\n" + ev);
        }

        const summaryHeadline =
          res.answered === 0
            ? dTitle + " summary: Not set"
            : dTitle + " summary: " + res.label + " (" + res.pct + "%)";
        coreBlocks.push({
          title: dTitle,
          lines,
          summaryOutcome: {
            headline: summaryHeadline,
            narrative: buildCoreDomainSummaryNarrative(domain, res),
          },
        });
      });
      sections.push({ type: "coreDevelopment", title: "4. Core development areas", blocks: coreBlocks });
      const td = document.querySelector('#termDecision input[type="radio"]:checked');
      const decVal = td ? td.value : "";
      const notes = fieldValTerm("decisionNotes");
      let decBody = "";
      if(decVal) decBody += "Decision: " + decVal;
      if(notes) decBody += (decBody ? "\n\n" : "") + "Notes:\n" + notes;
      if(!decBody) decBody = "No term decision selected yet.";
      sections.push({ type: "paragraph", title: "5. Term decision", body: decBody });
      return sections;
    }

    function focusLineShort(raw){
      return String(raw || "").replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
    }
    function generateTermSummary(){
      const out = document.getElementById("termSummaryOutput");
      if(!out) return;
      if(!hasAnyTermReviewContent()){
        lastTermSummarySections = [];
        out.classList.remove("summary-rich");
        out.innerHTML = "<p class=\"summary-placeholder\">Complete the term review to generate a summary of details, stage and level, level confirmation, core development areas, and term decision. The PDF mirrors this summary with corporate branding.</p>";
        return;
      }
      lastTermSummarySections = buildTermReviewSummarySections();
      out.classList.add("summary-rich");
      out.innerHTML = renderTermReportHtml(lastTermSummarySections);
    }

    const PDF_HEADER_LOGO_URL = "https://www.clubsensational.org/wp-content/uploads/2026/05/Logo-CS-azul.png";
    /** Landscape “Three stages · six levels” graphic for PDF under section 2 (no rotation). */
    const PDF_PROGRAMME_SW_URL_WWW = "https://www.clubsensational.org/wp-content/uploads/2026/05/SWProgramme.png";
    const PDF_PROGRAMME_SW_URL_APEX = "https://clubsensational.org/wp-content/uploads/2026/05/SWProgramme.png";
    const PDF_PROGRAMME_LEGACY_URL = "https://www.clubsensational.org/wp-content/uploads/2026/05/Programme.png";

    function fetchLogoAsDataUrl(url){
      return fetch(url)
        .then(r => (r.ok ? r.blob() : Promise.reject()))
        .then(blob => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject();
          reader.readAsDataURL(blob);
        }));
    }

    /** Same pipeline as timesheet PDF: smaller JPEG in storage, F-02-1 / logoPDF fallbacks. */
    function shrinkDataUrlAsJpegForPdfSwterm(dataUrl, maxEdgePx, quality){
      if(!dataUrl || String(dataUrl).indexOf("data:") !== 0) return Promise.resolve("");
      const maxE = maxEdgePx > 0 ? maxEdgePx : 380;
      const q = typeof quality === "number" ? quality : 0.85;
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try{
            const w = img.naturalWidth || img.width || 1;
            const h = img.naturalHeight || img.height || 1;
            const scale = Math.min(1, maxE / Math.max(w, h));
            const cw = Math.max(1, Math.round(w * scale));
            const ch = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement("canvas");
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext("2d");
            if(!ctx){
              resolve("");
              return;
            }
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, cw, ch);
            ctx.drawImage(img, 0, 0, cw, ch);
            resolve(canvas.toDataURL("image/jpeg", q));
          }catch(_){
            resolve("");
          }
        };
        img.onerror = () => resolve("");
        img.src = dataUrl;
      });
    }

    async function tryFetchLogoUrlSwterm(url){
      try{
        return await fetchLogoAsDataUrl(url);
      }catch(_){
        return null;
      }
    }

    async function loadPdfLogoPortalPrimarySwterm(){
      const list = [];
      try{
        const base = document.baseURI || (typeof location !== "undefined" ? location.href : "");
        if(base) list.push(new URL("logoPDF.png", base).href);
      }catch(_){}
      try{
        const origin = typeof location !== "undefined" ? String(location.origin || "").trim() : "";
        if(origin) list.push(origin + "/wp-content/uploads/2026/05/F-02-1.png");
      }catch(_){}
      list.push("https://www.clubsensational.org/wp-content/uploads/2026/05/F-02-1.png");
      const seen = new Set();
      for(let i = 0; i < list.length; i++){
        const url = list[i];
        if(!url || seen.has(url)) continue;
        seen.add(url);
        const d = await tryFetchLogoUrlSwterm(url);
        if(d) return d;
      }
      return null;
    }

    function loadPdfHeaderLogo(){
      if(typeof window.__PDF_LOGO_DATA__ === "string" && window.__PDF_LOGO_DATA__.indexOf("base64,") !== -1){
        return Promise.resolve(window.__PDF_LOGO_DATA__);
      }
      return (async () => {
        const portalPrimary = await loadPdfLogoPortalPrimarySwterm();
        if(portalPrimary){
          const compact = await shrinkDataUrlAsJpegForPdfSwterm(portalPrimary, 380, 0.85);
          return compact || portalPrimary;
        }
        let localUrl = null;
        try{
          localUrl = new URL(encodeURI("Logo CS azul.png"), window.location.href).href;
        }catch(e){ /* ignore */ }
        try{
          return await fetchLogoAsDataUrl(PDF_HEADER_LOGO_URL);
        }catch(_){
          if(localUrl){
            try{
              return await fetchLogoAsDataUrl(localUrl);
            }catch(_2){ /* ignore */ }
          }
          return null;
        }
      })();
    }

    function loadPdfProgrammePng(){
      let localSw = null;
      let localLegacy = null;
      try{
        localSw = new URL(encodeURI("SWProgramme.png"), window.location.href).href;
      }catch(_){ /* ignore */ }
      try{
        localLegacy = new URL(encodeURI("Programme.png"), window.location.href).href;
      }catch(_){ /* ignore */ }
      return fetchLogoAsDataUrl(PDF_PROGRAMME_SW_URL_WWW)
        .catch(() => fetchLogoAsDataUrl(PDF_PROGRAMME_SW_URL_APEX))
        .catch(() => (localSw ? fetchLogoAsDataUrl(localSw) : Promise.reject()))
        .catch(() => fetchLogoAsDataUrl(PDF_PROGRAMME_LEGACY_URL))
        .catch(() => (localLegacy ? fetchLogoAsDataUrl(localLegacy) : Promise.reject()))
        .catch(() => null);
    }

    function englishPossessive(name){
      const n = String(name || "").trim();
      if(!n) return "";
      return /s$/i.test(n.slice(-1)) ? n + "'" : n + "'s";
    }
    function formatReviewDateLongEn(isoOrEmpty){
      let d = null;
      const raw = String(isoOrEmpty || "").trim();
      if(raw){
        const p = raw.split("-");
        if(p.length === 3){
          const y = parseInt(p[0], 10);
          const m = parseInt(p[1], 10) - 1;
          const day = parseInt(p[2], 10);
          if(!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(day)) d = new Date(y, m, day);
        }
      }
      if(!d || isNaN(d.getTime())) d = new Date();
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }
    function pdfSafeFilenameStem(s){
      return String(s || "")
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
    }

    function buildTermReviewPdf(logoDataUrl, programmeDataUrl){
      const { jsPDF } = window.jspdf;
      if(!jsPDF) return null;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 18;
      const maxW = pageW - margin * 2;
      let y = 12;
      /* jsPDF only bundles standard fonts; Helvetica is tuned here for a clean SaaS-style report.
         On-screen the form uses Montserrat (HTML). */
      const brandBlue = [45, 132, 179];
      const brandBlueMuted = [56, 122, 168];
      const surface = [248, 250, 252];
      const surfaceBorder = [226, 232, 240];
      const ink = [15, 23, 42];
      const muted = [71, 85, 105];
      const mutedLight = [100, 116, 139];
      const hairline = [226, 232, 240];
      const sectionGapMm = 7.5;
      const bodyPt = 10.5;
      const lineBody = 5.65;
      const textIndent = margin + 5.5;

      function ensureSpace(heightNeeded){
        if(y + heightNeeded <= pageH - 22) return;
        doc.addPage();
        y = 21;
      }
      function drawReportBlockTitle(title){
        const t = String(title || "").trim();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const textPadL = 12;
        const innerW = maxW - textPadL - 5;
        const wrapped = doc.splitTextToSize(t, innerW);
        const lineH = 5.5;
        const padY = 5.5;
        const boxH = Math.max(13, padY * 2 + wrapped.length * lineH + 0.5);
        ensureSpace(boxH + sectionGapMm + 8);
        doc.setFillColor(surface[0], surface[1], surface[2]);
        doc.roundedRect(margin, y, maxW, boxH, 4, 4, "F");
        doc.setDrawColor(surfaceBorder[0], surfaceBorder[1], surfaceBorder[2]);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, y, maxW, boxH, 4, 4, "S");
        doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
        doc.rect(margin, y, 3.2, boxH, "F");
        doc.setTextColor(ink[0], ink[1], ink[2]);
        let ty = y + padY + 5.2;
        wrapped.forEach(line => {
          doc.text(line, margin + textPadL, ty);
          ty += lineH;
        });
        y += boxH + 6;
      }
      function drawLcBlockTitle(title){
        ensureSpace(16);
        y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(brandBlueMuted[0], brandBlueMuted[1], brandBlueMuted[2]);
        const t = String(title || "").toUpperCase();
        const wrapped = doc.splitTextToSize(t, maxW - 6);
        wrapped.forEach(line => {
          doc.text(line, margin + 2, y);
          y += 4.35;
        });
        doc.setDrawColor(hairline[0], hairline[1], hairline[2]);
        doc.setLineWidth(0.35);
        doc.line(margin + 2, y, pageW - margin - 2, y);
        y += 5.5;
      }
      function drawParagraphMirror(s){
        const paras = (s.body || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        const useColonBold =
          s.title === "1. Term review details" ||
          s.title === "2. Stage and level" ||
          s.title === "5. Term decision";
        paras.forEach((p, idx) => {
          const lines = p.split("\n");
          if(s.title === "3. Level confirmation"){
            if(idx === 0){
              lines.forEach(raw => {
                const line = raw.trim();
                if(line) drawDetailLine(line);
              });
            }else{
              lines.forEach(raw => {
                const line = raw.trim();
                if(!line) return;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(bodyPt);
                doc.setTextColor(muted[0], muted[1], muted[2]);
                const wrapped = doc.splitTextToSize(line, maxW - 11);
                ensureSpace(wrapped.length * lineBody + 2);
                wrapped.forEach(w => {
                  doc.text(w, textIndent, y);
                  y += lineBody;
                });
              });
            }
            return;
          }
          if(useColonBold){
            lines.forEach(raw => {
              const line = raw.trim();
              if(line) drawDetailLine(line);
            });
          }else{
            lines.forEach(raw => {
              const line = raw.trim();
              if(!line) return;
              doc.setFont("helvetica", "normal");
              doc.setFontSize(bodyPt);
              doc.setTextColor(muted[0], muted[1], muted[2]);
              const wrapped = doc.splitTextToSize(line, maxW - 11);
              ensureSpace(wrapped.length * lineBody + 2);
              wrapped.forEach(w => {
                doc.text(w, textIndent, y);
                y += lineBody;
              });
            });
          }
        });
        y += 1.5;
      }
      function drawLcBlocks(blocks){
        (Array.isArray(blocks) ? blocks : []).forEach(b => {
          drawLcBlockTitle(b.title || "");
          (b.lines || []).forEach(line => drawBulletWithBoldPrefix(line));
          if(b.summaryOutcome && b.summaryOutcome.headline){
            drawLevelOutcomePdf(b.summaryOutcome);
          }
          y += 1;
        });
      }
      function drawDetailLine(line){
        doc.setFontSize(bodyPt);
        const idx = line.indexOf(":");
        if(idx === -1){
          doc.setFont("helvetica", "normal");
          doc.setTextColor(muted[0], muted[1], muted[2]);
          const wrapped = doc.splitTextToSize(line, maxW - 11);
          ensureSpace(wrapped.length * lineBody + 2);
          wrapped.forEach(w => {
            doc.text(w, textIndent, y);
            y += lineBody;
          });
          return;
        }
        const prefix = line.slice(0, idx + 1);
        const rest = line.slice(idx + 1).trim();
        doc.setFont("helvetica", "bold");
        doc.setTextColor(ink[0], ink[1], ink[2]);
        const prefixW = doc.getTextWidth(prefix + " ");
        const firstLineRestW = Math.max(30, maxW - 11 - prefixW);
        const restWrapped = rest ? doc.splitTextToSize(rest, firstLineRestW) : [];
        ensureSpace((1 + restWrapped.length) * lineBody + 2);
        doc.text(prefix, textIndent, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(muted[0], muted[1], muted[2]);
        if(restWrapped.length) doc.text(restWrapped[0], textIndent + prefixW, y);
        y += lineBody;
        const contX = textIndent + prefixW;
        for(let i = 1; i < restWrapped.length; i++){
          doc.text(restWrapped[i], contX, y);
          y += lineBody;
        }
      }
      function drawLevelOutcomePdf(outcome){
        if(!outcome || !outcome.headline) return;
        y += 2;
        drawDetailLine(outcome.headline);
        const nar = String(outcome.narrative || "").trim();
        if(nar){
          doc.setFont("helvetica", "normal");
          doc.setFontSize(bodyPt);
          doc.setTextColor(mutedLight[0], mutedLight[1], mutedLight[2]);
          nar.split(/\n\n+/).map(p => p.trim()).filter(Boolean).forEach(p => {
            const wrapped = doc.splitTextToSize(p, maxW - 11);
            ensureSpace(wrapped.length * lineBody + 2);
            wrapped.forEach(w => {
              doc.text(w, textIndent, y);
              y += lineBody;
            });
          });
        }
        y += 1;
      }
      function drawTailIndented(tail, indentX){
        if(!tail) return;
        doc.setFont("helvetica", "normal");
        doc.setTextColor(muted[0], muted[1], muted[2]);
        const tw = doc.splitTextToSize(tail, maxW - (indentX - margin));
        ensureSpace(tw.length * lineBody + 1.2);
        tw.forEach(line => {
          doc.text(line, indentX, y);
          y += lineBody;
        });
      }
      function drawBulletWithBoldPrefix(line){
        const bull = "\u00B7  ";
        doc.setFontSize(bodyPt);
        const hang = 6.5;
        const br = line.indexOf("\n");
        if(br !== -1){
          const head = line.slice(0, br).trim();
          const tail = line.slice(br + 1).trim();
          const idx = head.indexOf(":");
          if(idx === -1){
            const wrapped = doc.splitTextToSize(bull + head, maxW - 11);
            ensureSpace(wrapped.length * lineBody + 2 + (tail ? lineBody : 0));
            doc.setFont("helvetica", "normal");
            doc.setTextColor(muted[0], muted[1], muted[2]);
            wrapped.forEach(w => {
              doc.text(w, textIndent, y);
              y += lineBody;
            });
            drawTailIndented(tail, textIndent + hang);
            return;
          }
          const prefix = head.slice(0, idx + 1);
          const inlineRest = head.slice(idx + 1).trim();
          const firstBlockLines = 1 + (inlineRest ? doc.splitTextToSize(inlineRest, maxW - 17).length : 0);
          const tailLines = tail ? doc.splitTextToSize(tail, maxW - 17).length : 0;
          ensureSpace((firstBlockLines + tailLines) * lineBody + 2);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(ink[0], ink[1], ink[2]);
          doc.text(bull + prefix, textIndent, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(muted[0], muted[1], muted[2]);
          y += lineBody;
          if(inlineRest){
            const iw = doc.splitTextToSize(inlineRest, maxW - 17);
            iw.forEach(w => {
              doc.text(w, textIndent + hang, y);
              y += lineBody;
            });
          }
          drawTailIndented(tail, textIndent + hang);
          return;
        }
        const idx = line.indexOf(":");
        if(idx === -1){
          const wrapped = doc.splitTextToSize(bull + line, maxW - 11);
          ensureSpace(wrapped.length * lineBody + 2);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(muted[0], muted[1], muted[2]);
          wrapped.forEach(w => {
            doc.text(w, textIndent, y);
            y += lineBody;
          });
          return;
        }
        const prefix = line.slice(0, idx + 1);
        const rest = line.slice(idx + 1).trim();
        const restWrapped = rest ? doc.splitTextToSize(rest, maxW - 17) : [];
        ensureSpace((1 + restWrapped.length) * lineBody + 2);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(bull + prefix, textIndent, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(muted[0], muted[1], muted[2]);
        y += lineBody;
        for(let i = 0; i < restWrapped.length; i++){
          doc.text(restWrapped[i], textIndent + hang, y);
          y += lineBody;
        }
      }
      function drawBodyLines(lines, useBullets){
        doc.setFont("helvetica", "normal");
        doc.setFontSize(bodyPt);
        doc.setTextColor(muted[0], muted[1], muted[2]);
        lines.forEach(line => {
          if(useBullets) drawBulletWithBoldPrefix(line);
          else{
            const wrapped = doc.splitTextToSize(line, maxW - 11);
            ensureSpace(wrapped.length * lineBody + 2);
            wrapped.forEach(w => {
              doc.text(w, textIndent, y);
              y += lineBody;
            });
          }
        });
        y += 1.2;
      }

      const headerLogoMaxW = pageW - 24;
      const headerLogoMaxH = 48;
      if(logoDataUrl){
        try{
          const fmt = logoDataUrl.includes("jpeg") || logoDataUrl.includes("JPEG") ? "JPEG" : "PNG";
          const props = doc.getImageProperties(logoDataUrl);
          const iw = props.width || 1;
          const ih = props.height || 1;
          const scale = Math.min(headerLogoMaxW / iw, headerLogoMaxH / ih);
          const logoW = iw * scale;
          const logoH = ih * scale;
          const logoX = (pageW - logoW) / 2;
          doc.addImage(logoDataUrl, fmt, logoX, y, logoW, logoH);
          y += logoH + 7;
        }catch(e){
          y += 4;
        }
      }else{
        y += 2;
      }
      const swimNameRaw = (document.getElementById("swimmerName").value || "").trim();
      const poss = englishPossessive(swimNameRaw);
      const titleMain = poss ? poss + " Swimming Review" : "Swimming Review";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("SWIMMING TERM REVIEW", pageW / 2, y, { align: "center" });
      y += 5.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18.5);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      const titleLines = doc.splitTextToSize(titleMain, maxW);
      const titleLineStep = 7.6;
      titleLines.forEach((line, i) => {
        doc.text(line, pageW / 2, y + i * titleLineStep, { align: "center" });
      });
      y += titleLines.length * titleLineStep + 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(mutedLight[0], mutedLight[1], mutedLight[2]);
      doc.text("clubSENsational · Autism Consultancy Services", pageW / 2, y, { align: "center" });
      y += 11;

      const sections = hasAnyTermReviewContent() ? buildTermReviewSummarySections() : [];
      if(!sections.length){
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(bodyPt);
        const emptyLines = doc.splitTextToSize(
          "Complete the term review on the form to generate this summary as a PDF.",
          maxW,
        );
        emptyLines.forEach(line => {
          doc.text(line, margin, y);
          y += lineBody;
        });
      }
      sections.forEach((s, secIdx) => {
        drawReportBlockTitle(s.title);
        if(s.type === "levelConfirmation"){
          drawLcBlocks(s.blocks);
          if(s.outcome) drawLevelOutcomePdf(s.outcome);
        }else if(s.type === "coreDevelopment"){
          drawLcBlocks(s.blocks);
        }else if(s.type === "bullets"){
          drawBodyLines(s.lines || [], true);
        }else{
          drawParagraphMirror(s);
        }

        if(s.title === "2. Stage and level"){
          const progSrc = programmeDataUrl && String(programmeDataUrl).indexOf("base64,") !== -1 ? programmeDataUrl : null;
          if(progSrc){
            try{
              const fmtP = progSrc.includes("jpeg") || progSrc.includes("JPEG") ? "JPEG" : "PNG";
              const pr = doc.getImageProperties(progSrc);
              const iw = pr.width || 0;
              const ih = pr.height || 0;
              if(iw > 0 && ih > 0){
                const footerReserve = 20;
                const gapMm = 5;
                const availW = maxW;
                let availH = pageH - y - footerReserve - gapMm;
                if(availH > 18){
                  const sc = Math.min(availW / iw, availH / ih);
                  const dw = iw * sc;
                  const dh = ih * sc;
                  const dx = margin + (maxW - dw) / 2;
                  const dy = y + gapMm;
                  doc.addImage(progSrc, fmtP, dx, dy, dw, dh);
                  y = dy + dh;
                }
              }
            }catch(_e){ /* omit programme strip if invalid */ }
          }
          doc.addPage();
          y = 21;
        }else if(secIdx < sections.length - 1){
          y += sectionGapMm;
        }
      });

      const totalPages = doc.internal.getNumberOfPages();
      for(let pn = 1; pn <= totalPages; pn++){
        doc.setPage(pn);
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        doc.setDrawColor(surfaceBorder[0], surfaceBorder[1], surfaceBorder[2]);
        doc.setLineWidth(0.25);
        doc.line(margin, ph - 13, pw - margin, ph - 13);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(mutedLight[0], mutedLight[1], mutedLight[2]);
        doc.text("clubSENsational", margin + 0.5, ph - 6.5);
        doc.text(String(pn), pw / 2, ph - 6.5, { align: "center" });
      }

      const saveStem = poss
        ? pdfSafeFilenameStem(poss + " Swimming Review (clubSENsational)")
        : pdfSafeFilenameStem("Swimming Review (clubSENsational)");
      const filename = (saveStem || "Swimming Review (clubSENsational)") + ".pdf";
      return { doc, filename };
    }
    function bindTermSummaryRefresh(){
      const wrap = document.querySelector(".wrap");
      if(!wrap) return;
      wrap.addEventListener("input", generateTermSummary);
      wrap.addEventListener("change", generateTermSummary);
    }

    /* =========================
       Wiring stage and level
       ========================= */
    function wireStageLevel(){
      const stageRoot = $("#stageTiles");
      const levelRoot = $("#levelTiles");
      if(!stageRoot || !levelRoot) return;

      /* Delegación sobre `change`: más fiable que solo `click` en <label> (radios, teclado, móvil). */
      stageRoot.addEventListener("change", (e) => {
        const t = e.target;
        if(!t || t.name !== "stage" || t.type !== "radio" || !t.checked) return;
        const tile = t.closest(".tile.stage");
        if(!tile || tile.classList.contains("disabled")) return;

        clearActives("#stageTiles .tile.stage");
        tile.classList.add("active");

        selectedStage = tile.dataset.stage || tile.dataset.value || "";
        applyStageRules();

        selectedLevel = 0;
        clearActives("#levelTiles .tile.level");
        $$('#levelTiles .tile.level input[type="radio"]').forEach((inp) => {
          inp.checked = false;
        });
        renderFocusAreasForLevel(0);

        showToast("Stage selected");
        generateTermSummary();
      });

      levelRoot.addEventListener("change", (e) => {
        const t = e.target;
        if(!t || t.name !== "level" || t.type !== "radio" || !t.checked) return;
        const tile = t.closest(".tile.level");
        if(!tile || tile.classList.contains("disabled")) return;

        clearActives("#levelTiles .tile.level");
        tile.classList.add("active");

        selectedLevel = Number(tile.dataset.level) || 0;

        renderFocusAreasForLevel(selectedLevel);

        showToast("Level selected");
        generateTermSummary();
      });
    }

    /* =========================
       Init
       ========================= */
    function init(){
      try{
        initSwtermDetailsPanel();
        wireStageLevel();
        wireRSIButtons();

        selectedStage = "";
        applyStageRules();
        renderFocusAreasForLevel(0);

        ["regulation","independence","engagement"].forEach(d => updateDomainUI(d));

        $$('#termDecision input[type="radio"]').forEach(r => {
          r.addEventListener("change", () => showToast("Term decision updated"));
        });

        bindTermSummaryRefresh();
        const submitBtn = $("#btnSwtermSubmit");
        if(submitBtn){
          submitBtn.addEventListener("click", async function(){
            const btn = this;
            btn.disabled = true;
            generateTermSummary();
            try{
              const pdfPromise = Promise.all([
                loadPdfHeaderLogo(),
                loadPdfProgrammePng(),
              ])
                .then(([logoDataUrl, programmeDataUrl]) => buildTermReviewPdf(logoDataUrl, programmeDataUrl))
                .catch(() => buildTermReviewPdf(null, null));
              const [docsMod, built] = await Promise.all([
                importPortalDocumentsModuleSwterm(),
                pdfPromise,
              ]);
              if(!built || !built.doc){
                alert("PDF library not loaded. Please refresh the page and try again.");
                return;
              }
              const pdfBytes = built.doc.output("arraybuffer");
              const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
              const auth = await docsMod.portalRequireUser();
              const reviewIso = fieldValTerm("reviewDate") || new Date().toISOString().slice(0, 10);
              const swimmer = fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
              const poss = englishPossessive(swimmer);
              const title = poss ? poss + " Swimming Term Review" : "Swimming Term Review";
              await docsMod.portalUploadPdfAndCreateDocument({
                blob: pdfBlob,
                document_type: "swim_term_review",
                category: "reports",
                title,
                related_date: String(reviewIso).trim().slice(0, 10),
                related_client: swimmer || null,
                source_page: "swtermreview",
                reuseAuth: auth,
              });
              alert("Term review submitted successfully. Open My Documents to download or print the PDF.");
              closeOrReturnSwterm();
            }catch(err){
              const msg = err && err.message ? String(err.message) : "Unknown error";
              console.error("[swtermreview] submit failed:", err);
              alert("Could not submit term review. " + msg);
            }finally{
              btn.disabled = false;
            }
          });
        }
        generateTermSummary();
      }catch(err){
        console.error("swtermreview init failed:", err);
      }
    }

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", init);
    }else{
      init();
    }
