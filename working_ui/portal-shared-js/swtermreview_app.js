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
          { id:"l1_1", text:"Accept water contact on the body during aquatic activities, such as pouring water, splashing water or water running over the body." },
          { id:"l1_2", text:"Remain within an aquatic environment whilst water is present around the body, such as the shower, poolside or shallow water." },
          { id:"l1_3", text:"Interact with water through simple aquatic activities, such as touching, moving or playing with water." },
        ]},
        { title: "Water Adaptation I", items: [
          { id:"l1_4", text:"Travel through the water using forward and backward movement patterns." },
          { id:"l1_5", text:"Change direction within the water, such as moving sideways or turning." },
          { id:"l1_6", text:"Travel through the water using environmental features or equipment, such as a wall, rail or float." },
        ]},
        { title: "Breathing Control I", items: [
          { id:"l1_7", text:"Blow air from the mouth whilst water is poured over the head." },
          { id:"l1_8", text:"Blow bubbles at the water surface." },
          { id:"l1_9", text:"Use exhalation to create movement in the water or towards a floating object, such as moving a floating toy across the water surface." },
        ]},
        { title: "Water Safety I", items: [
          { id:"l1_10", text:"Enter the water safely using an appropriate method." },
          { id:"l1_11", text:"Exit the water safely using an appropriate method." },
          { id:"l1_12", text:"Move towards and reach a point of safety, such as the poolside, wall, steps, ladder or appropriate support equipment." },
        ]},
      ],
      2: [
        { title: "Water Familiarisation II", items: [
          { id:"l2_1", text:"Accept water contact on the head and face during aquatic activities, such as pouring water over the head or water running across the face." },
          { id:"l2_2", text:"Interact with water around the head and face during aquatic activities, such as splashing water towards the face or washing the face with water." },
          { id:"l2_3", text:"Continue aquatic activities whilst experiencing changes in water conditions, such as splashing, moving water or small waves." },
        ]},
        { title: "Water Adaptation II", items: [
          { id:"l2_4", text:"Travel through the water with both feet off the pool floor, using the arms, legs or a combination of both." },
          { id:"l2_5", text:"Move into forward and backward body positions within the water, such as leaning forwards or leaning backwards." },
          { id:"l2_6", text:"Combine a range of aquatic movement patterns within a single activity, such as travelling, turning and changing body position during an obstacle course or aquatic game." },
        ]},
        { title: "Breathing Control II", items: [
          { id:"l2_7", text:"Blow bubbles with the face in the water." },
          { id:"l2_8", text:"Combine aquatic movement with blowing bubbles, such as walking or kicking whilst blowing bubbles." },
          { id:"l2_9", text:"Submerge below the water surface to reach or retrieve an object." },
        ]},
        { title: "Water Safety II", items: [
          { id:"l2_10", text:"Move between different areas of the aquatic environment, such as the shower, poolside and shallow water, entering and exiting the water safely when required." },
          { id:"l2_11", text:"Travel away from and return to a point of safety, such as the poolside, wall, steps, ladder or appropriate support equipment." },
          { id:"l2_12", text:"Recover to a standing position following loss of balance." },
        ]},
      ],

      3: [
        { title: "Floating & Balance I", items: [
          { id:"l3_1", text:"Maintain a back floating position using a wide shape, such as a star shape." },
          { id:"l3_2", text:"Maintain a front floating position using a wide shape, such as a star shape." },
          { id:"l3_3", text:"Maintain a back floating position using a narrow shape, such as a soldier shape." },
          { id:"l3_4", text:"Maintain a front floating position using a narrow shape, such as a soldier shape." },
        ]},
        { title: "Streamlining & Rotation I", items: [
          { id:"l3_5", text:"Maintain a back glide position using an open shape." },
          { id:"l3_6", text:"Maintain a front glide position using an open shape." },
          { id:"l3_7", text:"Perform a rotation from a back position to a front position using an open shape, such as a star shape." },
          { id:"l3_8", text:"Perform a rotation from a front position to a back position using an open shape, such as a star shape." },
        ]},
        { title: "Propulsion I", items: [
          { id:"l3_9", text:"Use leg actions to create propulsion through the water in a front position, such as flutter kicking, froggy legs or undulating movements." },
          { id:"l3_10", text:"Use leg actions to create propulsion through the water in a back position, such as flutter kicking, froggy legs or undulating movements." },
          { id:"l3_11", text:"Use arm actions to create propulsion through the water, such as paddling or scooping actions." },
          { id:"l3_12", text:"Combine arm and leg actions to create continuous propulsion through the water, such as paddling and flutter kicking." },
        ]},
        { title: "Water Safety III", items: [
          { id:"l3_13", text:"Perform jump entries into the water from the poolside." },
          { id:"l3_14", text:"Attempt to signal for help when prompted, such as shouting, waving, raising a hand or using an agreed signal." },
          { id:"l3_15", text:"Recover to a standing position from any horizontal position in the water, such as floating, gliding or travelling." },
        ]},
      ],

      4: [
        { title: "Floating & Balance II", items: [
          { id:"l4_1", text:"Maintain a back floating position using a narrow shape with the arms extended above the head, such as a rocket shape." },
          { id:"l4_2", text:"Maintain a front floating position using a narrow shape with the arms extended above the head, such as a rocket shape." },
          { id:"l4_3", text:"Maintain a floating position using a tuck shape, such as a mushroom float." },
          { id:"l4_4", text:"Move between different floating shapes whilst maintaining a floating position, such as star, soldier, rocket or mushroom shapes." },
        ]},
        { title: "Streamlining & Rotation II", items: [
          { id:"l4_5", text:"Push off and glide on the back whilst maintaining a narrow body shape, such as a soldier shape." },
          { id:"l4_6", text:"Push off and glide on the front whilst maintaining a narrow body shape, such as a soldier shape." },
          { id:"l4_7", text:"Perform rotations from back to front and front to back using a narrow body shape, such as a soldier shape." },
          { id:"l4_8", text:"Combine gliding and rotational movements within the same action, such as rotating from front to back or back to front whilst gliding." },
        ]},
        { title: "Propulsion II", items: [
          { id:"l4_9", text:"Perform recognised front crawl kicking actions and combine them with front crawl arm actions (catch up)." },
          { id:"l4_10", text:"Perform recognised backstroke kicking actions and combine them with backstroke double arm actions." },
          { id:"l4_11", text:"Perform breaststroke propulsion patterns (kick-glide) on the front and back." },
          { id:"l4_12", text:"Perform and maintain dolphin kick on the front and back, using a rocket glide position or with the arms on the side." },
        ]},
        { title: "Water Safety IV", items: [
          { id:"l4_13", text:"Perform a sitting dive entry into the water." },
          { id:"l4_14", text:"Move into a back floating position following immersion and maintain the float." },
          { id:"l4_15", text:"Complete a Swim-Float-Kick sequence by moving through the water, rolling onto the back to float and breathe, rolling onto the front and continuing to move through the water." },
        ]},
      ],

      5: [
        { title: "Streamlining & Rotation III", items: [
          { id:"l5_1", text:"Push off and glide on the back using a rocket shape and roll onto the front." },
          { id:"l5_2", text:"Push off and glide on the front using a rocket shape and roll onto the back." },
          { id:"l5_3", text:"Push off and glide whilst combining front to back and back to front rotations using a rocket shape." },
          { id:"l5_4", text:"Push off and glide underwater and perform rotational movements using any body shape." },
        ]},
        { title: "Swimming Strokes I", items: [
          { id:"l5_5", text:"Perform front crawl single arm actions with lateral breathing and continuous leg actions." },
          { id:"l5_6", text:"Perform recognised backstroke alternating arm actions from an arms on the side position with continuous leg actions." },
          { id:"l5_7", text:"Combine recognised breaststroke arm and leg actions using a 1 pull-breathe and 2 kick-glide sequence." },
          { id:"l5_8", text:"Perform dolphin kick from a rocket glide position on the front and back." },
        ]},
        { title: "Dives, Starts & Turns I", items: [
          { id:"l5_9", text:"Perform a controlled kneeling dive entry into a glide followed by propulsion." },
          { id:"l5_10", text:"Perform a head first dive and retrieve an object from the water." },
          { id:"l5_11", text:"Perform basic turning actions in the water, such as a somersault." },
          { id:"l5_12", text:"Perform a tumble turn, including a somersault, push off and glide." },
        ]},
        { title: "Integrated Water Safety & Recovery", items: [
          { id:"l5_13", text:"Maintain treading water whilst signalling or shouting for help." },
          { id:"l5_14", text:"Apply Swim-Float-Kick over a full pool length, using front crawl or butterfly as the swimming phase." },
          { id:"l5_15", text:"Reach for and hold a rescue aid whilst remaining afloat." },
        ]},
      ],

      6: [
        { title: "Swimming Strokes II", items: [
          { id:"l6_1", text:"Swim front crawl using continuous arm and leg actions with lateral or bilateral breathing." },
          { id:"l6_2", text:"Swim backstroke using continuous windmill arm actions and continuous leg actions." },
          { id:"l6_3", text:"Swim breaststroke using coordinated pull-breathe-kick-glide timing." },
          { id:"l6_4", text:"Swim butterfly using coordinated arm actions, dolphin kick actions and breathing every 2 arm cycles." },
          { id:"l6_5", text:"Maintain continuous swimming whilst changing between recognised swimming strokes, such as front crawl to backstroke or backstroke to breaststroke." },
        ]},
        { title: "Distance & Endurance", items: [
          { id:"l6_9", text:"Swim front crawl continuously for at least one pool length or 10 arm cycles, using lateral or bilateral breathing whilst maintaining rhythm and control." },
          { id:"l6_10", text:"Swim backstroke continuously for at least one pool length or 10 arm cycles whilst maintaining rhythm and control." },
          { id:"l6_11", text:"Swim breaststroke continuously for at least one pool length or 6 pull-breathe-kick-glide cycles whilst maintaining rhythm and control." },
          { id:"l6_12", text:"Swim butterfly continuously for at least one pool length or 6 arm cycles whilst maintaining rhythm, control and body undulation." },
        ]},
        { title: "Dives, Starts & Turns II", items: [
          { id:"l6_13", text:"Perform a standing dive entry and continue swimming using a recognised stroke." },
          { id:"l6_14", text:"Perform a racing start from the poolside or starting block and continue swimming using a recognised stroke." },
          { id:"l6_15", text:"Perform a backward somersault in the water." },
          { id:"l6_16", text:"Perform a swim-tumble turn-glide-swim sequence." },
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

    const SWIMMING_LEVEL_MASCOTS = {
      1: {
        animal: "Turtle",
        badge: "First Splash",
        file: "level-1-turtle.png",
        focus: [
          "Building early confidence in the water",
          "Staying calm and safe with support",
        ],
      },
      2: {
        animal: "Starfish",
        badge: "Water Explorer",
        file: "level-2-starfish.png",
        focus: [
          "Progressing with reduced hesitation",
          "Improving breathing with less help",
        ],
      },
      3: {
        animal: "Jellyfish",
        badge: "Floating Friend",
        file: "level-3-jellyfish.png",
        focus: [
          "Developing balance and body position",
          "Moving forward with guidance and control",
        ],
      },
      4: {
        animal: "Ray",
        badge: "Ocean Navigator",
        file: "level-4-ray.png",
        focus: [
          "More control and coordination in movement",
          "Improving rotation, propulsion and direction",
        ],
      },
      5: {
        animal: "Dolphin",
        badge: "Independent Swimmer",
        file: "level-5-dolphin.png",
        focus: [
          "Refining technique with stronger safety awareness",
          "Longer sequences with increasing independence",
        ],
      },
      6: {
        animal: "Whale",
        badge: "Ocean Master",
        file: "level-6-whale.png",
        focus: [
          "Efficiency, rhythm and endurance",
          "Sustaining control and safety throughout sessions",
        ],
      },
    };
    const SWIMMING_MASCOT_BASE = "portal/assets/swimming-mascots/";
    const SWIMMING_STAGE_BG = {
      "Swim Confidence": "portal/assets/swimming-stages/stage-1-world-bg.jpg",
      "Swim Basic": "portal/assets/swimming-stages/stage-2-world-bg.jpg",
      "Swim Structured": "portal/assets/swimming-stages/stage-3-world-bg.jpg",
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

    function getSwimmingLevelMascot(level){
      return SWIMMING_LEVEL_MASCOTS[Number(level)] || null;
    }

    function resolveSwimmingMascotSrc(file){
      if(!file) return "";
      const rel = SWIMMING_MASCOT_BASE + file;
      try{
        if(typeof location !== "undefined" && location.href){
          return new URL(rel, location.href).href;
        }
      }catch(_){}
      return rel;
    }

    function updateLevelMascotSpot(levelNumber){
      const spot = $("#levelMascotSpot");
      const img = $("#levelMascotSpotImg");
      const kicker = $("#levelMascotSpotKicker");
      const headline = $("#levelMascotSpotHeadline");
      const sub = $("#levelMascotSpotSub");
      const focusPanel = $("#levelFocusPanel");
      const focusList = $("#levelFocusList");
      if(!spot || !img) return;
      const mascot = getSwimmingLevelMascot(levelNumber);
      if(!mascot){
        spot.hidden = true;
        spot.classList.remove("is-visible");
        spot.removeAttribute("data-level");
        img.removeAttribute("src");
        if(focusPanel) focusPanel.hidden = true;
        if(focusList) focusList.innerHTML = "";
        return;
      }
      img.src = resolveSwimmingMascotSrc(mascot.file);
      img.alt = mascot.animal + " mascot";
      if(kicker) kicker.textContent = "Current level";
      if(headline) headline.textContent = "Level " + levelNumber + " · " + mascot.animal;
      if(sub) sub.textContent = mascot.badge;
      if(focusList){
        const lines = Array.isArray(mascot.focus) ? mascot.focus : [];
        focusList.innerHTML = lines.map(function(line){
          return "<li>" + String(line).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</li>";
        }).join("");
        if(focusPanel) focusPanel.hidden = lines.length === 0;
      }
      spot.setAttribute("data-level", String(levelNumber));
      spot.hidden = false;
      spot.classList.add("is-visible");
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
    function focusSectionProgress(section){
      const items = Array.from(section.querySelectorAll(".focusItem"));
      const total = items.length;
      const rated = items.filter(it => it.querySelector('.triGrid input[type="radio"]:checked')).length;
      return { total, rated, complete: total > 0 && rated === total };
    }

    function syncFocusSections(options){
      const wrap = $("#focusWrap");
      if(!wrap) return;
      const sections = $$(".focusSection", wrap);
      let firstIncomplete = -1;

      sections.forEach((sec, idx) => {
        const prog = focusSectionProgress(sec);
        const meta = sec.querySelector(".focusSectionMeta");
        if(meta) meta.textContent = prog.rated + " / " + prog.total;
        sec.classList.toggle("is-complete", prog.complete);
        if(!prog.complete && firstIncomplete === -1) firstIncomplete = idx;
      });

      if(options && options.toggleSection){
        const sec = options.toggleSection;
        const willOpen = !sec.classList.contains("is-open");
        if(willOpen){
          sections.forEach(s => s.classList.remove("is-open"));
          sec.classList.add("is-open");
        }else{
          sec.classList.remove("is-open");
          if(firstIncomplete >= 0 && !sections.some(s => s.classList.contains("is-open"))){
            sections[firstIncomplete].classList.add("is-open");
          }
        }
      }else if(options && options.autoAdvanceFrom){
        const idx = sections.indexOf(options.autoAdvanceFrom);
        const prog = focusSectionProgress(options.autoAdvanceFrom);
        if(prog.complete){
          options.autoAdvanceFrom.classList.remove("is-open");
          const next = sections[idx + 1];
          if(next){
            sections.forEach(s => s.classList.remove("is-open"));
            next.classList.add("is-open");
          }
        }
      }else{
        const anyOpen = sections.some(s => s.classList.contains("is-open"));
        if(!anyOpen && firstIncomplete >= 0){
          sections[firstIncomplete].classList.add("is-open");
        }else if(!anyOpen && sections.length){
          sections[sections.length - 1].classList.add("is-open");
        }
      }

      sections.forEach(sec => {
        const head = sec.querySelector(".focusSectionHead");
        if(head) head.setAttribute("aria-expanded", sec.classList.contains("is-open") ? "true" : "false");
      });
    }

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
        updateLevelProgressionUI();
        const section = lbl.closest(".focusSection");
        if(section) syncFocusSections({ autoAdvanceFrom: section });
        generateTermSummary();
      });
      return lbl;
    }

    function renderFocusAreasForLevel(levelNumber){
      const wrap = $("#focusWrap");
      if(!wrap) return;
      updateLevelMascotSpot(levelNumber);
      wrap.innerHTML = "";
      if(!levelNumber || !LEVEL_DATA[levelNumber]){
        $("#countTxt").textContent = "Select a level to start";
        $("#badgeTxt").textContent = "Not set";
        $("#meterFill").style.width = "0%";
        $("#percentTxt").textContent = "0% complete";
        generateTermSummary();
        return;
      }

      const groupCls = levelGroupClass(levelNumber);
      const blocks = LEVEL_DATA[levelNumber];

      blocks.forEach((block, blockIdx) => {
        const itemCount = (block.items || []).length;
        const sec = document.createElement("div");
        sec.className = `focusSection ${groupCls}`;
        if(blockIdx === 0) sec.classList.add("is-open");

        const head = document.createElement("button");
        head.type = "button";
        head.className = "focusSectionHead";
        head.setAttribute("aria-expanded", blockIdx === 0 ? "true" : "false");
        head.innerHTML =
          `<p class="focusTitle">${String(block.title || "")}</p>` +
          `<span class="focusSectionMeta">0 / ${itemCount}</span>` +
          `<span class="focusSectionChevron" aria-hidden="true"></span>`;
        head.addEventListener("click", () => {
          syncFocusSections({ toggleSection: sec });
          head.setAttribute("aria-expanded", sec.classList.contains("is-open") ? "true" : "false");
        });
        sec.appendChild(head);

        const body = document.createElement("div");
        body.className = "focusSectionBody";
        const bodyInner = document.createElement("div");
        bodyInner.className = "focusSectionBodyInner";

        (block.items || []).forEach((it, idx) => {
          const item = document.createElement("div");
          item.className = `focusItem ${groupCls}`;

          const p = document.createElement("p");
          p.className = "focusLine";
          p.innerHTML = `<span class="focusLineNum">${idx + 1}.</span>${it.text || ""}`;
          item.appendChild(p);

          const grid = document.createElement("div");
          grid.className = "triGrid";

          const rName = `lvl_${levelNumber}_${it.id || (block.title + "_" + idx)}`;

          const b1 = buildTriBtn(rName, "Fully supported", "Fully Supported", "");
          const b2 = buildTriBtn(rName, "Partially supported", "Partially Supported", "");
          const b3 = buildTriBtn(rName, "Independent", "Independent", "independence");

          grid.appendChild(b1);
          grid.appendChild(b2);
          grid.appendChild(b3);

          item.appendChild(grid);
          bodyInner.appendChild(item);
        });

        body.appendChild(bodyInner);
        sec.appendChild(body);
        wrap.appendChild(sec);
      });

      syncFocusSections();
      updateLevelConfirmationProgress();
      updateLevelProgressionUI();
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
      percentTxt.textContent = `${info.pct}% complete`;

      if(!selectedLevel){
        swatch.style.background = "var(--blueDeep)";
        badgeTxt.textContent = "Not set";
        return;
      }

      swatch.style.background = levelGroupColour(selectedLevel);
      badgeTxt.textContent = info.answered === 0 ? "Not set" : info.label;
      updateLevelProgressionUI();
    }

    function isLevelSecure100(){
      const ratings = getAllLevelRatings();
      if(!ratings.length) return false;
      const allAnswered = ratings.every(Boolean);
      const allIndependence = ratings.every(v => v === "Independent");
      return allAnswered && allIndependence;
    }

    function setLevelProgressDecision(value){
      const map = {
        "Progress to Next Level": "lpd_progress",
        "Consolidate Current Level": "lpd_consolidate",
        "Transition to Next Stage": "lpd_progress",
      };
      const id = map[value];
      if(!id) return;
      const el = $("#" + id);
      if(!el) return;
      el.checked = true;
    }

    function getLevelProgressionDecisionValue(){
      const checked = document.querySelector('#levelProgressDecisionRadios input[type="radio"]:checked');
      if(checked) return checked.value;
      return computeLevelProgressionRecommendation().decision;
    }

    function isProgressToNextLevel(decision){
      return decision === "Progress to Next Level" || decision === "Transition to Next Stage";
    }

    function buildLearningOutcomeSummary(levelInfo, ratings){
      if(!selectedLevel || !levelInfo.total){
        return "Select a level and complete learning outcome ratings to generate a summary.";
      }
      if(levelInfo.answered === 0){
        return "Learning outcomes not yet rated for this level.";
      }
      const counts = { full: 0, partial: 0, ind: 0 };
      ratings.forEach(v => {
        if(v === "Fully supported") counts.full++;
        else if(v === "Partially supported") counts.partial++;
        else if(v === "Independent") counts.ind++;
      });
      const parts = [];
      if(counts.ind) parts.push(counts.ind + " independent");
      if(counts.partial) parts.push(counts.partial + " partially supported");
      if(counts.full) parts.push(counts.full + " fully supported");
      return (
        levelInfo.answered + " of " + levelInfo.total + " outcomes rated · " +
        levelInfo.label + " (" + levelInfo.pct + "%)" +
        (parts.length ? " · " + parts.join(", ") : "")
      );
    }

    function buildLevelProgressionReason(decision, levelInfo){
      if(!selectedLevel || !levelInfo.total || levelInfo.answered === 0){
        return "Complete learning outcomes to generate a recommendation.";
      }
      if(isProgressToNextLevel(decision)){
        return `Outcomes are ${levelInfo.label.toLowerCase()} (${levelInfo.pct}%) — ready for the next level with familiar routines and safety.`;
      }
      return `Outcomes are ${levelInfo.label.toLowerCase()} (${levelInfo.pct}%) — consolidating this level will strengthen confidence and skills.`;
    }

    function buildLevelProgressionExplanation(decision, levelInfo){
      return buildLevelProgressionReason(decision, levelInfo);
    }

    function computeLevelProgressionRecommendation(){
      const ratings = getAllLevelRatings();
      const levelInfo = computeLevelProgressLabel(ratings);

      let decision = "Consolidate Current Level";
      let confidence = "Preliminary";
      let readinessPct = 40;

      if(selectedLevel && isLevelSecure100()){
        decision = "Progress to Next Level";
        confidence = "High";
        readinessPct = 96;
      }else if((selectedLevel === 2 || selectedLevel === 4) && levelInfo.label === "Secure"){
        decision = "Progress to Next Level";
        confidence = "High";
        readinessPct = 88;
      }else if(levelInfo.label === "Secure" && levelInfo.pct >= 80){
        decision = "Progress to Next Level";
        confidence = "High";
        readinessPct = 86;
      }else if(levelInfo.label === "Secure"){
        decision = "Progress to Next Level";
        confidence = "Good";
        readinessPct = 78;
      }else if(levelInfo.label === "Progressing" && levelInfo.pct >= 70){
        decision = "Consolidate Current Level";
        confidence = "Good";
        readinessPct = 65;
      }else if(levelInfo.answered > 0){
        decision = "Consolidate Current Level";
        confidence = levelInfo.answered === levelInfo.total ? "Moderate" : "Preliminary";
        readinessPct = Math.max(35, Math.min(72, levelInfo.pct));
      }

      return {
        decision,
        confidence,
        readinessPct,
        explanation: buildLevelProgressionExplanation(decision, levelInfo),
        levelInfo,
        learningSummary: buildLearningOutcomeSummary(levelInfo, ratings),
      };
    }

    function updateLevelProgressionUI(){
      const rec = computeLevelProgressionRecommendation();
      const decEl = $("#levelProgressDecisionText");
      const scoreEl = $("#levelProgressScore");
      const completionEl = $("#levelProgressCompletion");
      const reasonEl = $("#levelProgressReason");
      const confEl = $("#levelProgressConfidence");
      const fillEl = $("#levelProgressMeterFill");
      if(decEl) decEl.textContent = rec.decision;
      if(scoreEl){
        scoreEl.textContent = selectedLevel && rec.levelInfo.answered > 0
          ? rec.levelInfo.label + " (" + rec.levelInfo.pct + "%)"
          : "Not set";
      }
      if(completionEl){
        completionEl.textContent = selectedLevel && rec.levelInfo.total
          ? rec.levelInfo.answered + " of " + rec.levelInfo.total + " outcomes rated"
          : "—";
      }
      if(reasonEl) reasonEl.textContent = buildLevelProgressionReason(rec.decision, rec.levelInfo);
      if(confEl) confEl.textContent = rec.confidence;
      if(fillEl) fillEl.style.width = `${rec.readinessPct}%`;

      const overridePanel = $("#levelProgressOverride");
      const overrideActive = overridePanel && !overridePanel.hidden && overridePanel.classList.contains("is-visible");
      if(!overrideActive){
        setLevelProgressDecision(rec.decision);
      }
    }

    function wireLevelProgressionUI(){
      const acceptBtn = $("#btnAcceptLevelProgress");
      const overrideBtn = $("#btnOverrideLevelProgress");
      const overridePanel = $("#levelProgressOverride");

      if(acceptBtn){
        acceptBtn.addEventListener("click", () => {
          const rec = computeLevelProgressionRecommendation();
          setLevelProgressDecision(rec.decision);
          if(overridePanel){
            overridePanel.hidden = true;
            overridePanel.classList.remove("is-visible");
          }
          showToast("Recommendation accepted");
          generateTermSummary();
        });
      }
      if(overrideBtn){
        overrideBtn.addEventListener("click", () => {
          if(overridePanel){
            overridePanel.hidden = false;
            overridePanel.classList.add("is-visible");
          }
          showToast("Choose a manual decision");
          generateTermSummary();
        });
      }
    }

    function computeOverallDevelopmentProfile(){
      const domainKeys = ["regulation", "independence", "engagement"];
      const domains = domainKeys.map(key => ({
        key,
        title: key.charAt(0).toUpperCase() + key.slice(1),
        ...computeDomainResult(key),
      }));
      const rated = domains.filter(d => d.answered > 0);
      const strengths = [];
      const supportAreas = [];

      const strengthLines = {
        regulation: "Shows growing comfort and regulation in the pool environment",
        independence: "Demonstrates useful independence with routines and equipment",
        engagement: "Participates positively and responds well during activities",
      };
      const secureLines = {
        regulation: "Maintains steady regulation and calm across sessions",
        independence: "Shows confident independence with familiar routines and equipment",
        engagement: "Engages consistently and responds well to instruction",
      };
      const supportLines = {
        regulation: "Continue supporting calm transitions, sensory comfort, and recovery in the water",
        independence: "Continue building independence through familiar routines and gentle challenge",
        engagement: "Continue nurturing participation, responsiveness, and sustained engagement",
      };

      domains.forEach(d => {
        if(d.answered === 0) return;
        if(d.label === "Secure"){
          strengths.push(secureLines[d.key] || (d.title + " appears secure this term"));
        }else if(d.label === "Progressing"){
          strengths.push(strengthLines[d.key] || (d.title + " is progressing positively this term"));
        }else{
          supportAreas.push(supportLines[d.key] || ("Continue supporting " + d.title.toLowerCase() + " with calm, structured sessions"));
        }
      });

      if(!rated.length){
        return {
          domains,
          overallSummary: "Complete core development ratings to generate a profile summary.",
          strengths: ["—"],
          supportAreas: ["—"],
        };
      }

      const summaryParts = rated.map(d => d.title.toLowerCase() + " is " + d.label.toLowerCase() + " (" + d.pct + "%)");
      let overallSummary = "This term, " + summaryParts.join(", ") + ".";
      if(strengths.length && !supportAreas.length){
        overallSummary += " The profile reflects steady development across sessions.";
      }else if(strengths.length && supportAreas.length){
        overallSummary += " Clear strengths are evident alongside areas for continued supportive practice.";
      }else{
        overallSummary += " Continued familiar routines and calm pacing will support steady development.";
      }

      if(!strengths.length){
        strengths.push("Shows effort and willingness to participate in swimming sessions");
      }
      if(!supportAreas.length){
        supportAreas.push("Continue familiar routines and positive reinforcement next term");
      }

      return { domains, overallSummary, strengths, supportAreas };
    }

    function updateDevelopmentProfileUI(){
      const profile = computeOverallDevelopmentProfile();
      const map = {
        regulation: { status: "#devProfileRegStatus", pct: "#devProfileRegPct", meter: "#devProfileRegMeter" },
        independence: { status: "#devProfileIndStatus", pct: "#devProfileIndPct", meter: "#devProfileIndMeter" },
        engagement: { status: "#devProfileEngStatus", pct: "#devProfileEngPct", meter: "#devProfileEngMeter" },
      };
      profile.domains.forEach(d => {
        const ids = map[d.key];
        if(!ids) return;
        const statusEl = $(ids.status);
        const pctEl = $(ids.pct);
        const meterEl = $(ids.meter);
        if(statusEl) statusEl.textContent = d.answered === 0 ? "Not set" : d.label;
        if(pctEl) pctEl.textContent = d.answered === 0 ? "—" : d.pct + "%";
        if(meterEl) meterEl.style.width = d.answered === 0 ? "0%" : d.pct + "%";
      });

      const summaryEl = $("#devProfileSummaryText");
      const strengthsEl = $("#devProfileStrengths");
      const supportEl = $("#devProfileSupport");
      if(summaryEl) summaryEl.textContent = profile.overallSummary;
      if(strengthsEl){
        strengthsEl.innerHTML = profile.strengths.map(s => "<li>" + escapeHtmlTerm(s) + "</li>").join("");
      }
      if(supportEl){
        supportEl.innerHTML = profile.supportAreas.map(s => "<li>" + escapeHtmlTerm(s) + "</li>").join("");
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
          updateDevelopmentProfileUI();
          generateTermSummary();
        });
      });
    }

    /* =========================
       1. Details — lectura (fecha / término / nombre) + participante con autocompletado (clients_info)
       ========================= */
    const PORTAL_CLIENTS_INFO_SCRIPT = "portal/clients_info_embed.js?v=20260419-99";
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
      throw lastErr || new Error("Could not load portal_documents.js. Add portal/portal_documents.js on this origin (Vercel/repo), or set window.PORTAL_WP_UPLOADS_BASE.");
    }

    function wireSwtermBackDashboard(){
      const back = document.getElementById("swtermBackDashboard");
      if(!back || back.getAttribute("data-swterm-back-bound") === "1") return;
      back.setAttribute("data-swterm-back-bound", "1");
      back.addEventListener("click", function(ev){
        ev.preventDefault();
        const swimmer = fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
        const notes = fieldValTerm("decisionNotes").replace(/\s+/g, " ").trim();
        if(swimmer || notes){
          const ok = confirm("Leave without submitting? Unsaved changes on this review will be lost.");
          if(!ok) return;
        }
        closeOrReturnSwterm();
      });
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
        setTimeout(() => { window.location.href = typeof portalStaffDashboardUrl === "function" ? portalStaffDashboardUrl() : new URL("staff_dashboard.html", window.location.href).href; }, 180);
      }catch(_){
        window.location.href = typeof portalStaffDashboardUrl === "function" ? portalStaffDashboardUrl() : new URL("staff_dashboard.html", window.location.href).href;
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
        clientId: decodeQsTerm(qs.get("clientId") || qs.get("client_id") || ""),
        date: decodeQsTerm(qs.get("date") || qs.get("reviewDate") || ""),
        term: decodeQsTerm(qs.get("term") || ""),
        instructor: decodeQsTerm(qs.get("instructor") || qs.get("instructorName") || ""),
      };
    }

    const SWTERM_CLIENT_NAME_KEY = "__portal_swterm_client_name_v1";
    const SWTERM_CLIENT_ID_KEY = "__portal_swterm_client_id_v1";

    function rememberSwtermParticipant(name, clientId){
      const nm = String(name || "").replace(/\s+/g, " ").trim();
      const cid = String(clientId || "").trim();
      try{
        if(nm) sessionStorage.setItem(SWTERM_CLIENT_NAME_KEY, nm);
        if(cid) sessionStorage.setItem(SWTERM_CLIENT_ID_KEY, cid);
      }catch(_){}
    }

    function readRememberedSwtermParticipant(){
      try{
        return {
          name: String(sessionStorage.getItem(SWTERM_CLIENT_NAME_KEY) || "").replace(/\s+/g, " ").trim(),
          clientId: String(sessionStorage.getItem(SWTERM_CLIENT_ID_KEY) || "").trim(),
        };
      }catch(_){
        return { name: "", clientId: "" };
      }
    }

    /** Participant name from the form, portal URL, or last portal client hand-off. */
    function resolveParticipantName(){
      const swimEl = document.getElementById("swimmerName");
      const fromInput = swimEl ? String(swimEl.value || "").replace(/\s+/g, " ").trim() : "";
      if(fromInput) return fromInput;
      const fromUrl = parseDetailsFromUrl().name;
      if(fromUrl) return fromUrl;
      const remembered = readRememberedSwtermParticipant().name;
      if(remembered) return remembered;
      return "";
    }

    function ensureParticipantNameInField(){
      const name = resolveParticipantName();
      const swimEl = document.getElementById("swimmerName");
      if(name && swimEl && !String(swimEl.value || "").trim()){
        swimEl.value = name;
        try{ swimEl.dispatchEvent(new Event("input", { bubbles: true })); }catch(_){}
        try{ swimEl.dispatchEvent(new Event("change", { bubbles: true })); }catch(_){}
      }
      if(name) rememberSwtermParticipant(name, parseDetailsFromUrl().clientId || readRememberedSwtermParticipant().clientId);
      return name;
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
      const remembered = readRememberedSwtermParticipant();
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
      const portalName = (p.name || remembered.name || "").trim();
      if(swimEl && portalName && !String(swimEl.value || "").trim()){
        swimEl.value = portalName;
      }
      if(portalName) rememberSwtermParticipant(portalName, p.clientId || remembered.clientId);
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
        if(typeof window !== "undefined" && window.PORTAL_SHARED_JS_BASE){
          bases.push(String(window.PORTAL_SHARED_JS_BASE).trim().replace(/\/$/, ""));
        }
      }catch(_){}
      try{
        if(typeof location !== "undefined" && location.href){
          bases.push(new URL("portal/", location.href).href.replace(/\/$/, ""));
        }
      }catch(_){}
      bases.push("portal");
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
        rememberSwtermParticipant(name, "");
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
        }else if(s.type === "stageLevel"){
          const mascotSrc = s.mascotSrc ? escapeHtmlTerm(s.mascotSrc) : "";
          const mascotAlt = escapeHtmlTerm(s.mascotAlt || "Level mascot");
          const mascotHtml = mascotSrc
            ? "<div class=\"summary-level-mascot\"><img src=\"" + mascotSrc + "\" alt=\"" + mascotAlt + "\" loading=\"lazy\" decoding=\"async\" /></div>"
            : "";
          const bodyParas = (s.body || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          const bodyHtml = bodyParas.map(p =>
            "<p>" + p.split("\n").map(line => formatBulletLineHtmlTerm(line)).join("<br>") + "</p>"
          ).join("");
          inner = "<div class=\"report-block-body summary-stage-level\">" + mascotHtml + "<div class=\"summary-stage-level-copy\">" + bodyHtml + "</div></div>";
        }else if(s.type === "executiveSummary"){
          const paras = (s.body || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          inner = "<div class=\"report-block-body executive-overview\">" +
            paras.map(p => "<p>" + escapeHtmlTerm(p) + "</p>").join("") +
            "</div>";
        }else if(s.type === "bullets"){
          inner = "<div class=\"report-block-body\"><ul>" + s.lines.map(l => "<li>" + bulletLineHtmlTerm(l) + "</li>").join("") + "</ul></div>";
        }else{
          const paras = (s.body || "").split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          inner = "<div class=\"report-block-body\">" + paras.map((p, idx) => {
            if(s.title === "Participant details" || s.title === "Level progression decision" || s.title === "Final review notes"){
              return "<p>" + p.split("\n").map(line => formatBulletLineHtmlTerm(line)).join("<br>") + "</p>";
            }
            if(s.title === "Learning outcomes summary"){
              if(idx === 0) return "<p>" + p.split("\n").map(line => formatBulletLineHtmlTerm(line)).join("<br>") + "</p>";
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
      if(document.querySelector("#levelProgressDecisionRadios input[type=\"radio\"]:checked")) return true;
      if(fieldValTerm("decisionNotes")) return true;
      if(fieldValTerm("eviRegulation") || fieldValTerm("eviIndependence") || fieldValTerm("eviEngagement")) return true;
      if(document.querySelector(".rsiGrid input[type=\"radio\"]:checked")) return true;
      if(document.querySelector("#focusWrap input[type=\"radio\"]:checked")) return true;
      return false;
    }
    function buildLearningOutcomesSummaryBody(){
      const levelOutcome = getLevelOutcomeForSummary();
      const lpdRec = computeLevelProgressionRecommendation();
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const lines = [];
      if(selectedStage){
        lines.push("Stage: " + (STAGE_DISPLAY[selectedStage] || selectedStage));
      }
      if(selectedLevel){
        lines.push("Level: " + selectedLevel + (levelMascot ? " · " + levelMascot.animal : ""));
      }
      if(levelOutcome.info && levelOutcome.info.answered > 0){
        lines.push("Outcome: " + levelOutcome.info.label + " (" + levelOutcome.info.pct + "%)");
        lines.push("Rated: " + levelOutcome.info.answered + " of " + levelOutcome.info.total + " outcomes");
        lines.push(lpdRec.learningSummary);
        if(levelOutcome.narrative){
          return lines.join("\n") + "\n\n" + levelOutcome.narrative;
        }
      }else{
        lines.push("Learning outcomes not yet rated for this level.");
      }
      return lines.join("\n");
    }

    function buildCoreDevelopmentSummaryBody(){
      const lines = [];
      ["regulation", "independence", "engagement"].forEach(domain => {
        const res = computeDomainResult(domain);
        const title = domain.charAt(0).toUpperCase() + domain.slice(1);
        if(res.answered === 0){
          lines.push(title + ": Not set");
        }else{
          lines.push(title + ": " + res.label + " (" + res.pct + "%)");
        }
        const evKey = { regulation: "eviRegulation", independence: "eviIndependence", engagement: "eviEngagement" }[domain];
        const ev = (fieldValTerm(evKey) || "").trim();
        if(ev) lines.push("Note: " + ev);
      });
      return lines.join("\n");
    }

    function buildDevelopmentProfileSummaryBody(){
      const profile = computeOverallDevelopmentProfile();
      const lines = profile.domains.map(d => {
        if(d.answered === 0) return d.title + ": Not set";
        return d.title + ": " + d.label + " (" + d.pct + "%)";
      });
      lines.push("");
      lines.push(profile.overallSummary);
      if(profile.strengths.length){
        lines.push("");
        lines.push("Strengths:");
        profile.strengths.forEach(s => lines.push("• " + s));
      }
      if(profile.supportAreas.length){
        lines.push("");
        lines.push("Continue supporting:");
        profile.supportAreas.forEach(s => lines.push("• " + s));
      }
      return lines.join("\n");
    }

    function buildExecutiveTermReviewSummary(){
      const swimmer = ensureParticipantNameInField() || fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
      const firstName = swimmer.split(/\s+/)[0] || "The participant";
      const term = fieldValTerm("termSelect").trim();
      const stageLabel = selectedStage ? (STAGE_DISPLAY[selectedStage] || selectedStage) : "";
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const levelText = selectedLevel
        ? ("Level " + selectedLevel + (levelMascot ? " (" + levelMascot.animal + ")" : ""))
        : "";
      const levelOutcome = getLevelOutcomeForSummary();
      const lpdRec = computeLevelProgressionRecommendation();
      const decision = getLevelProgressionDecisionValue();
      const profile = computeOverallDevelopmentProfile();
      const paragraphs = [];

      if(swimmer || selectedLevel || selectedStage){
        let p1 = firstName + " completed " + (term || "this term");
        if(stageLabel && levelText) p1 += " at " + stageLabel + ", " + levelText + ".";
        else if(stageLabel) p1 += " within " + stageLabel + ".";
        else p1 += ".";
        if(levelOutcome.info && levelOutcome.info.answered > 0){
          p1 += " Learning outcomes are " + levelOutcome.info.label.toLowerCase() + " (" + levelOutcome.info.pct + "% complete).";
        }
        paragraphs.push(p1);
      }

      if(selectedLevel){
        const decPhrase = isProgressToNextLevel(decision)
          ? "The recommendation is to progress to the next level"
          : "The recommendation is to consolidate the current level";
        paragraphs.push(
          decPhrase + ". " + buildLevelProgressionReason(decision, lpdRec.levelInfo)
        );
      }

      const ratedDomains = profile.domains.filter(d => d.answered > 0);
      if(ratedDomains.length){
        const domText = ratedDomains.map(d => d.title.toLowerCase() + " (" + d.label.toLowerCase() + ", " + d.pct + "%)").join(", ");
        paragraphs.push("Across regulation, independence, and engagement, the developmental profile shows " + domText + ". " + profile.overallSummary);
      }

      let nextP = "Next term, ";
      if(isProgressToNextLevel(decision)){
        nextP += "introduce new challenges gradually while maintaining familiar routines, safety, and positive participation.";
      }else{
        nextP += "continue consolidating skills with calm pacing, structure, and positive reinforcement.";
      }
      if(profile.strengths[0] && profile.strengths[0] !== "—"){
        nextP += " Strengths to build on include " + profile.strengths.slice(0, 2).join("; ").toLowerCase() + ".";
      }
      if(profile.supportAreas[0] && profile.supportAreas[0] !== "—"){
        nextP += " " + profile.supportAreas[0];
      }
      paragraphs.push(nextP);

      return paragraphs.filter(Boolean).join("\n\n");
    }

    function buildTermReviewSummarySections(){
      const sections = [];
      const stageLabel = selectedStage ? (STAGE_DISPLAY[selectedStage] || selectedStage) : "—";
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const levelLabel = selectedLevel
        ? ("Level " + selectedLevel + (levelMascot ? " · " + levelMascot.animal : ""))
        : "—";

      const reviewIsoDetail = fieldValTerm("reviewDate");
      const dateOfReviewDisplay = reviewIsoDetail
        ? formatReviewDateLongEn(reviewIsoDetail)
        : "—";
      sections.push({
        type: "paragraph",
        title: "Participant details",
        body: [
          "Participant: " + (fieldValTerm("swimmerName") || "—"),
          "Date of review: " + dateOfReviewDisplay,
          "Term: " + (fieldValTerm("termSelect") || "—"),
          "Instructor: " + (fieldValTerm("instructorName") || "—"),
        ].join("\n"),
      });
      sections.push({
        type: "stageLevel",
        title: "Stage & level",
        mascotSrc: levelMascot ? resolveSwimmingMascotSrc(levelMascot.file) : "",
        mascotAlt: levelMascot ? (levelMascot.animal + " mascot") : "",
        body:
          "Stage: " + stageLabel +
          (levelMascot ? "\nLevel: " + levelLabel + " (" + levelMascot.badge + ")" : "\nLevel: " + levelLabel),
      });
      sections.push({
        type: "paragraph",
        title: "Learning outcomes summary",
        body: buildLearningOutcomesSummaryBody(),
      });

      const lpd = document.querySelector('#levelProgressDecisionRadios input[type="radio"]:checked');
      const lpdRec = computeLevelProgressionRecommendation();
      const lpdVal = lpd ? lpd.value : "";
      const lpdBody = [
        "Recommendation: " + (lpdVal || lpdRec.decision),
        "Level score: " + (
          selectedLevel && lpdRec.levelInfo.answered > 0
            ? lpdRec.levelInfo.label + " (" + lpdRec.levelInfo.pct + "%)"
            : "Not set"
        ),
        "Learning outcome completion: " + (
          selectedLevel && lpdRec.levelInfo.total
            ? lpdRec.levelInfo.answered + " of " + lpdRec.levelInfo.total
            : "—"
        ),
        buildLevelProgressionReason(lpdVal || lpdRec.decision, lpdRec.levelInfo),
      ].join("\n");
      sections.push({ type: "paragraph", title: "Level progression decision", body: lpdBody });

      sections.push({
        type: "paragraph",
        title: "Core development areas summary",
        body: buildCoreDevelopmentSummaryBody(),
      });

      sections.push({
        type: "paragraph",
        title: "Overall development profile",
        body: buildDevelopmentProfileSummaryBody(),
      });

      const notes = fieldValTerm("decisionNotes").trim();
      sections.push({
        type: "paragraph",
        title: "Final review notes",
        body: notes || "No notes added.",
      });

      sections.push({
        type: "executiveSummary",
        title: "Executive term review summary",
        body: buildExecutiveTermReviewSummary(),
      });
      return sections;
    }

    function focusLineShort(raw){
      return String(raw || "").replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
    }

    /* =========================
       Guided accordion (parts)
       ========================= */
    const REVIEW_PART_ORDER = ["details", "pathway", "development", "summary"];
    const REVIEW_PART_STATUS_LABEL = {
      not_started: "Not started",
      in_progress: "In progress",
      complete: "Complete",
      ready: "Ready",
    };
    let openReviewPart = "details";
    const reviewPartAutoAdvanced = {
      details: false,
      pathway: false,
      development: false,
    };
    let reviewPartsWired = false;

    function isDetailsPartComplete(){
      const swimmer = (fieldValTerm("swimmerName") || "").replace(/\s+/g, " ").trim();
      const term = fieldValTerm("termSelect").trim();
      return !!(swimmer && term);
    }

    function isDetailsPartStarted(){
      const swimmer = (fieldValTerm("swimmerName") || "").replace(/\s+/g, " ").trim();
      const term = fieldValTerm("termSelect").trim();
      return !!(swimmer || term);
    }

    function isPathwayPartComplete(){
      if(!selectedStage || !selectedLevel) return false;
      const ratings = getAllLevelRatings();
      const info = computeLevelProgressLabel(ratings);
      if(!info.total || info.answered < info.total) return false;
      return !!document.querySelector('#levelProgressDecisionRadios input[type="radio"]:checked');
    }

    function isPathwayPartStarted(){
      if(selectedStage || selectedLevel) return true;
      const ratings = getAllLevelRatings();
      return ratings.some(Boolean);
    }

    function isDevelopmentPartComplete(){
      return ["engagement", "independence", "regulation"].every(function(domain){
        const res = computeDomainResult(domain);
        return res.totalItems > 0 && res.answered >= res.totalItems;
      });
    }

    function isDevelopmentPartStarted(){
      return ["engagement", "independence", "regulation"].some(function(domain){
        return computeDomainResult(domain).answered > 0;
      });
    }

    function getReviewPartState(key){
      if(key === "details"){
        if(isDetailsPartComplete()) return "complete";
        if(isDetailsPartStarted()) return "in_progress";
        return "not_started";
      }
      if(key === "pathway"){
        if(isPathwayPartComplete()) return "complete";
        if(isPathwayPartStarted()) return "in_progress";
        return "not_started";
      }
      if(key === "development"){
        if(isDevelopmentPartComplete()) return "complete";
        if(isDevelopmentPartStarted()) return "in_progress";
        return "not_started";
      }
      if(key === "summary"){
        if(isDevelopmentPartComplete()) return "ready";
        if(isPathwayPartComplete() || isDetailsPartComplete()) return "in_progress";
        return "not_started";
      }
      return "not_started";
    }

    function setOpenReviewPart(key, opts){
      const options = opts || {};
      if(REVIEW_PART_ORDER.indexOf(key) < 0) return;
      openReviewPart = key;
      $$(".review-part[data-part]").forEach(function(part){
        const partKey = part.getAttribute("data-part");
        const isOpen = partKey === key;
        part.classList.toggle("is-open", isOpen);
        const btn = part.querySelector(".review-part-head");
        if(btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
      if(options.scroll){
        const el = document.getElementById("reviewPart-" + key);
        if(el && typeof el.scrollIntoView === "function"){
          try{
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }catch(_){
            el.scrollIntoView(true);
          }
        }
      }
    }

    function refreshReviewPartsFlow(opts){
      const options = opts || {};
      const states = {};
      REVIEW_PART_ORDER.forEach(function(key){
        states[key] = getReviewPartState(key);
        if(states[key] !== "complete" && key !== "summary"){
          reviewPartAutoAdvanced[key] = false;
        }
      });

      $$(".review-part[data-part]").forEach(function(part){
        const key = part.getAttribute("data-part");
        const state = states[key] || "not_started";
        part.classList.toggle("is-complete", state === "complete" || state === "ready");
        const statusEl = part.querySelector("[data-part-status]");
        if(statusEl){
          statusEl.setAttribute("data-state", state);
          statusEl.textContent = REVIEW_PART_STATUS_LABEL[state] || "Not started";
        }
      });

      if(!options.skipAutoAdvance){
        const current = openReviewPart;
        const canAdvance = (
          (current === "details" || current === "pathway" || current === "development") &&
          states[current] === "complete" &&
          !reviewPartAutoAdvanced[current]
        );
        if(canAdvance){
          reviewPartAutoAdvanced[current] = true;
          const idx = REVIEW_PART_ORDER.indexOf(current);
          const next = REVIEW_PART_ORDER[idx + 1];
          if(next){
            setOpenReviewPart(next, { scroll: true });
            return;
          }
        }
      }

      setOpenReviewPart(openReviewPart, { scroll: false });
    }

    function wireReviewPartsAccordion(){
      if(reviewPartsWired) return;
      reviewPartsWired = true;
      $$(".review-part[data-part]").forEach(function(part){
        const btn = part.querySelector(".review-part-head");
        if(!btn) return;
        btn.addEventListener("click", function(){
          const key = part.getAttribute("data-part");
          if(!key) return;
          if(openReviewPart === key){
            // Keep one part open — re-click focuses current section.
            setOpenReviewPart(key, { scroll: true });
            return;
          }
          setOpenReviewPart(key, { scroll: true });
          refreshReviewPartsFlow({ skipAutoAdvance: true });
        });
      });
      const openEl = document.querySelector(".review-part.is-open[data-part]");
      openReviewPart = (openEl && openEl.getAttribute("data-part")) || "details";
      refreshReviewPartsFlow({ skipAutoAdvance: true });
    }

    function generateTermSummary(){
      const out = document.getElementById("termSummaryOutput");
      if(!out){
        refreshReviewPartsFlow();
        return;
      }
      if(!hasAnyTermReviewContent()){
        lastTermSummarySections = [];
        out.classList.remove("summary-rich");
        out.innerHTML = "<p class=\"summary-placeholder\">Complete the review to generate a visual term summary.</p>";
        refreshReviewPartsFlow();
        return;
      }
      lastTermSummarySections = buildTermReviewSummarySections();
      const executive = buildExecutiveTermReviewSummary();
      const swimmer = ensureParticipantNameInField() || fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
      const term = fieldValTerm("termSelect").trim();
      const reviewIso = fieldValTerm("reviewDate");
      const stageLabel = selectedStage ? (STAGE_DISPLAY[selectedStage] || selectedStage) : "—";
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const levelText = selectedLevel
        ? ("Level " + selectedLevel + (levelMascot ? " · " + levelMascot.animal : ""))
        : "—";
      const decision = getLevelProgressionDecisionValue() || "Not set";
      const levelOutcome = getLevelOutcomeForSummary();
      const outcomeText = (levelOutcome.info && levelOutcome.info.answered > 0)
        ? (levelOutcome.info.label + " (" + levelOutcome.info.pct + "%)")
        : "Not rated yet";
      const domains = [
        { key: "regulation", title: "Regulation", img: "portal/assets/core-areas/core-regulation-brain.png" },
        { key: "independence", title: "Independence", img: "portal/assets/core-areas/core-independence-rocket.png" },
        { key: "engagement", title: "Engagement", img: "portal/assets/core-areas/core-engagement-wave.png" },
      ];
      const mascotHtml = levelMascot
        ? "<div class=\"term-summary-mascot\"><img src=\"" + escapeHtmlTerm(resolveSwimmingMascotSrc(levelMascot.file)) + "\" alt=\"" + escapeHtmlTerm(levelMascot.animal) + "\" width=\"72\" height=\"64\" loading=\"lazy\" decoding=\"async\" /></div>"
        : "<div class=\"term-summary-mascot\" aria-hidden=\"true\"></div>";
      const domainHtml = domains.map(d => {
        const res = computeDomainResult(d.key);
        const status = res.answered > 0 ? (res.label + " · " + res.pct + "%") : "Not set";
        return "<div class=\"term-summary-domain\">" +
          "<img src=\"" + escapeHtmlTerm(d.img) + "\" alt=\"\" width=\"48\" height=\"42\" loading=\"lazy\" decoding=\"async\" />" +
          "<p class=\"term-summary-domain-title\">" + escapeHtmlTerm(d.title) + "</p>" +
          "<p class=\"term-summary-domain-status\">" + escapeHtmlTerm(status) + "</p>" +
          "</div>";
      }).join("");
      const metaBits = [term, reviewIso ? formatReviewDateLongEn(reviewIso) : ""].filter(Boolean).join(" · ");
      out.classList.add("summary-rich");
      out.innerHTML =
        "<div class=\"term-summary-hero\">" + mascotHtml +
          "<div class=\"term-summary-hero-copy\">" +
            "<p class=\"term-summary-kicker\">Term journey</p>" +
            "<h3 class=\"term-summary-name\">" + escapeHtmlTerm(swimmer || "Participant") + "</h3>" +
            "<p class=\"term-summary-meta\">" + escapeHtmlTerm(metaBits || "Complete details above") + "</p>" +
          "</div>" +
        "</div>" +
        "<div class=\"term-summary-grid\">" +
          "<div class=\"term-summary-tile\"><p class=\"term-summary-tile-label\">Stage</p><p class=\"term-summary-tile-value\">" + escapeHtmlTerm(stageLabel) + "</p></div>" +
          "<div class=\"term-summary-tile\"><p class=\"term-summary-tile-label\">Level</p><p class=\"term-summary-tile-value\">" + escapeHtmlTerm(levelText) + "</p></div>" +
          "<div class=\"term-summary-tile\"><p class=\"term-summary-tile-label\">Decision</p><p class=\"term-summary-tile-value\">" + escapeHtmlTerm(decision) + "</p></div>" +
          "<div class=\"term-summary-tile\"><p class=\"term-summary-tile-label\">Level outcomes</p><p class=\"term-summary-tile-value\">" + escapeHtmlTerm(outcomeText) + "</p></div>" +
        "</div>" +
        "<div class=\"term-summary-domains\">" + domainHtml + "</div>" +
        "<div class=\"term-summary-exec\">" +
          executive.split(/\n\n+/).map(p => "<p>" + escapeHtmlTerm(p) + "</p>").join("") +
        "</div>";
      refreshReviewPartsFlow();
    }

    const PDF_HEADER_LOGO_URL = "portal/Logo-CS-azul.png";
    const PDF_CELEBRATION_LOGO_URL = "portal/Logo-CS-brand-tight.png";
    const PDF_CELEBRATION_LOGO_FALLBACK = "portal/Logo-CS-azul.png";
    /** Landscape “Three stages · six levels” graphic for PDF under section 2 (no rotation). */
    const PDF_PROGRAMME_SW_URL_WWW = "portal/SWProgramme.png";
    const PDF_PROGRAMME_SW_URL_APEX = "portal/SWProgramme.png";
    const PDF_PROGRAMME_LEGACY_URL = "portal/Programme.png";

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

    /** Same pipeline as timesheet PDF: smaller JPEG in storage; F-02-1 / portal_crest / logoPDF fallbacks. */
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
        if(typeof location !== "undefined" && location.href){
          list.push(new URL("portal/F-02-1.png", location.href).href);
        }
      }catch(_){}
      try{
        if(typeof location !== "undefined" && location.href){
          list.push(new URL("portal/portal_crest.svg", location.href).href);
        }
      }catch(_){}
      list.push("portal/F-02-1.png");
      list.push("portal/portal_crest.svg");
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

    function loadPdfCelebrationLogo(){
      // Always prefer transparent PNG logos — never JPEG (JPEG has no alpha).
      return fetchLogoAsDataUrl(PDF_CELEBRATION_LOGO_URL)
        .catch(() => fetchLogoAsDataUrl(PDF_CELEBRATION_LOGO_FALLBACK))
        .catch(() => fetchLogoAsDataUrl("portal/Logo-CS-brand.png"))
        .catch(() => null);
    }

    function fetchImageAsDataUrl(url){
      if(!url) return Promise.resolve(null);
      return fetchLogoAsDataUrl(url).catch(() => null);
    }

    async function loadCelebrationVisualAssets(){
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const mascotUrl = levelMascot ? resolveSwimmingMascotSrc(levelMascot.file) : "";
      const stageBgUrl = selectedStage && SWIMMING_STAGE_BG[selectedStage]
        ? SWIMMING_STAGE_BG[selectedStage]
        : SWIMMING_STAGE_BG["Swim Confidence"];
      const [
        logo,
        mascot,
        stageBg,
        regulation,
        independence,
        engagement,
      ] = await Promise.all([
        loadPdfCelebrationLogo().catch(() => null),
        fetchImageAsDataUrl(mascotUrl),
        fetchImageAsDataUrl(stageBgUrl),
        fetchImageAsDataUrl("portal/assets/core-areas/core-regulation-brain.png"),
        fetchImageAsDataUrl("portal/assets/core-areas/core-independence-rocket.png"),
        fetchImageAsDataUrl("portal/assets/core-areas/core-engagement-wave.png"),
      ]);
      return {
        logo,
        mascot,
        stageBg,
        regulation,
        independence,
        engagement,
      };
    }

    function buildCelebrationHighlights(){
      const highlights = [];
      const levelInfo = computeLevelProgressLabel(getAllLevelRatings());
      const domains = {
        engagement: computeDomainResult("engagement"),
        independence: computeDomainResult("independence"),
        regulation: computeDomainResult("regulation"),
      };

      if(selectedLevel){
        highlights.push("Continuing to develop skills at Swimming Level " + selectedLevel);
      }
      if(selectedStage){
        highlights.push("Building confidence within " + (STAGE_DISPLAY[selectedStage] || selectedStage));
      }
      if(domains.regulation.answered > 0){
        highlights.push(
          domains.regulation.label === "Secure"
            ? "Growing comfort and regulation in the pool environment"
            : "Building comfort and calm during swimming sessions",
        );
      }
      if(domains.engagement.answered > 0){
        highlights.push(
          domains.engagement.label === "Secure"
            ? "Strong engagement and participation during activities"
            : "Positive engagement and responsiveness in lessons",
        );
      }
      if(domains.independence.answered > 0){
        highlights.push(
          domains.independence.label === "Secure"
            ? "Growing independence with routines and equipment"
            : "Building independence with supportive guidance",
        );
      }
      if(levelInfo.label === "Secure" || levelInfo.label === "Progressing"){
        highlights.push("Making progress across level confirmation skills in the water");
      }

      const uniq = [];
      highlights.forEach(h => {
        if(h && !uniq.includes(h)) uniq.push(h);
      });
      const fallbacks = [
        "Showing effort, courage, and participation in the water",
        "Building trust and routine in swimming sessions",
        "Celebrating every step forward with pride",
      ];
      fallbacks.forEach(f => {
        if(uniq.length < 3 && !uniq.includes(f)) uniq.push(f);
      });
      return uniq.slice(0, 5);
    }

    function buildCelebrationParagraph(termLabel){
      const levelInfo = computeLevelProgressLabel(getAllLevelRatings());
      const term = termLabel || "this term";
      let progressLine =
        "You have continued to build confidence, participation, and familiarity in your swimming sessions.";
      if(levelInfo.label === "Secure"){
        progressLine =
          "You have shown wonderful progress in the water and are building secure foundations in your swimming skills.";
      }else if(levelInfo.label === "Progressing"){
        progressLine =
          "You are making steady progress in the water and growing in confidence with each session.";
      }
      return (
        "You have worked really hard during the " + term + " and we are very proud of the effort you have shown. " +
        progressLine +
        " Every session matters, and your commitment is truly celebrated."
      );
    }

    function buildCelebrationNextSteps(){
      const decision = getLevelProgressionDecisionValue();
      if(isProgressToNextLevel(decision)){
        return "Next term we will celebrate your progress and gently introduce new challenges as you continue your swimming journey.";
      }
      return "Next term we will continue building confidence, strengthening key aquatic skills, and celebrating every step forward.";
    }

    function buildCelebrationCertificateContent(){
      const swimmer = ensureParticipantNameInField() || fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
      const term = fieldValTerm("termSelect").trim();
      const reviewIso = fieldValTerm("reviewDate");
      const instructor = fieldValTerm("instructorName").replace(/\s+/g, " ").trim();
      const stageLabel = selectedStage ? (STAGE_DISPLAY[selectedStage] || selectedStage) : "";
      const levelMascot = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const levelLabel = selectedLevel
        ? ("Level " + selectedLevel + (levelMascot ? " · " + levelMascot.animal : ""))
        : "";
      const firstName = swimmer.split(/\s+/)[0] || swimmer || "Swimmer";
      return {
        swimmer,
        firstName,
        term,
        dateDisplay: formatReviewDateLongEn(reviewIso),
        instructor,
        stageLabel,
        levelLabel,
        headline: swimmer ? ("Congratulations, " + firstName + "!") : "Congratulations!",
        paragraph: buildCelebrationParagraph(term),
        highlights: buildCelebrationHighlights(),
        nextSteps: buildCelebrationNextSteps(),
      };
    }

    function buildCelebrationCertificatePdf(assets){
      const { jsPDF } = window.jspdf;
      if(!jsPDF) return null;
      const content = buildCelebrationCertificateContent();
      const visuals = assets || {};
      const logoDataUrl = visuals.logo || null;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 12;
      const maxW = pageW - margin * 2;
      const swimBlue = [45, 132, 179];
      const swimBlueDeep = [18, 69, 107];
      const swimBlueSoft = [233, 243, 247];
      const swimGold = [244, 183, 64];
      const ink = [15, 23, 42];
      const muted = [91, 100, 115];
      const companyLine = "clubSENsational Ltd · 71-75 Shelton Street, Covent Garden, WC2H 9JQ, London";
      const levelMascotMeta = selectedLevel ? getSwimmingLevelMascot(selectedLevel) : null;
      const decision = getLevelProgressionDecisionValue();
      const animalName = levelMascotMeta ? levelMascotMeta.animal : "";
      const badgeName = levelMascotMeta ? levelMascotMeta.badge : "";

      function pngFmt(dataUrl){
        if(!dataUrl) return "PNG";
        return (dataUrl.includes("jpeg") || dataUrl.includes("JPEG") || dataUrl.includes("jpg")) ? "JPEG" : "PNG";
      }
      function addImageAt(dataUrl, x, y, maxWImg, maxHImg){
        if(!dataUrl) return { w: 0, h: 0 };
        try{
          const fmt = pngFmt(dataUrl);
          const props = doc.getImageProperties(dataUrl);
          const iw = props.width || 1;
          const ih = props.height || 1;
          let wImg = maxWImg;
          let hImg = (ih / iw) * wImg;
          if(hImg > maxHImg){
            hImg = maxHImg;
            wImg = (iw / ih) * hImg;
          }
          doc.addImage(dataUrl, fmt, x, y, wImg, hImg);
          return { w: wImg, h: hImg };
        }catch(_e){
          return { w: 0, h: 0 };
        }
      }
      function addCoverBackground(dataUrl){
        if(!dataUrl){
          doc.setFillColor(swimBlueSoft[0], swimBlueSoft[1], swimBlueSoft[2]);
          doc.rect(0, 0, pageW, pageH, "F");
          return;
        }
        try{
          const fmt = pngFmt(dataUrl);
          const props = doc.getImageProperties(dataUrl);
          const iw = props.width || 1;
          const ih = props.height || 1;
          const scale = Math.max(pageW / iw, pageH / ih);
          const wImg = iw * scale;
          const hImg = ih * scale;
          doc.addImage(dataUrl, fmt, (pageW - wImg) / 2, (pageH - hImg) / 2, wImg, hImg);
        }catch(_e){
          doc.setFillColor(swimBlueSoft[0], swimBlueSoft[1], swimBlueSoft[2]);
          doc.rect(0, 0, pageW, pageH, "F");
        }
      }
      function trySetOpacity(opacity){
        try{
          if(typeof doc.GState === "function"){
            doc.setGState(new doc.GState({ opacity: opacity }));
            return true;
          }
        }catch(_e){ /* ignore */ }
        return false;
      }
      function resetOpacity(){
        trySetOpacity(1);
      }

      /* ===== PAGE 1 — Glass diploma over stage world ===== */
      addCoverBackground(visuals.stageBg);

      if(trySetOpacity(0.16)){
        doc.setFillColor(6, 28, 52);
        doc.rect(0, 0, pageW, pageH, "F");
        resetOpacity();
      }

      doc.setDrawColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.setLineWidth(2.2);
      doc.roundedRect(5, 5, pageW - 10, pageH - 10, 7, 7, "S");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.9);
      doc.roundedRect(8, 8, pageW - 16, pageH - 16, 5, 5, "S");

      const cx = pageW / 2;
      const displayName = content.swimmer || content.firstName || "Swimmer";
      const metaParts = [];
      if(content.stageLabel) metaParts.push(content.stageLabel);
      if(content.term) metaParts.push(content.term);
      else if(content.dateDisplay) metaParts.push(content.dateDisplay);
      const metaLine = metaParts.join("  ·  ") || "Swimming journey";

      const cardW = 168;
      const cardH = 168;
      const cardX = cx - cardW / 2;
      const cardY = 14;
      if(trySetOpacity(0.72)){
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(cardX, cardY, cardW, cardH, 12, 12, "F");
        resetOpacity();
      }else{
        doc.setFillColor(248, 252, 255);
        doc.roundedRect(cardX, cardY, cardW, cardH, 12, 12, "F");
      }
      doc.setDrawColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.setLineWidth(1.8);
      doc.roundedRect(cardX + 3, cardY + 3, cardW - 6, cardH - 6, 10, 10, "S");
      doc.setDrawColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.setLineWidth(0.55);
      doc.roundedRect(cardX + 6.5, cardY + 6.5, cardW - 13, cardH - 13, 8, 8, "S");

      let y = cardY + 10;

      if(logoDataUrl){
        const logoBox = addImageAt(logoDataUrl, cx - 42, y, 84, 32);
        y += Math.max(logoBox.h, 28) + 4;
      }else{
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
        doc.text("clubSENsational", cx, y + 10, { align: "center" });
        y += 18;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(swimBlueDeep[0], swimBlueDeep[1], swimBlueDeep[2]);
      doc.text("Congratulations!", cx, y + 2, { align: "center" });
      y += 9;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("for your effort and progress this term", cx, y, { align: "center" });
      y += 6;

      doc.setDrawColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.setLineWidth(1.1);
      doc.line(cx - 34, y, cx + 34, y);
      y += 9;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(displayName.length > 20 ? 14 : 18);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      const nameLines = doc.splitTextToSize(displayName, cardW - 24);
      nameLines.slice(0, 2).forEach(function(line){
        doc.text(line, cx, y, { align: "center" });
        y += displayName.length > 20 ? 6.5 : 8;
      });
      y += 2;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      const stageLines = doc.splitTextToSize(metaLine, cardW - 22);
      stageLines.slice(0, 2).forEach(function(line){
        doc.text(line, cx, y, { align: "center" });
        y += 5;
      });
      y += 4;

      const heroMax = 52;
      const framePad = 5;
      const frameW = heroMax + framePad * 2;
      const frameH = heroMax + framePad * 2;
      const frameX = cx - frameW / 2;
      const frameY = y;
      doc.setFillColor(248, 251, 253);
      doc.roundedRect(frameX, frameY, frameW, frameH, 8, 8, "F");
      doc.setDrawColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.setLineWidth(2.2);
      doc.roundedRect(frameX, frameY, frameW, frameH, 8, 8, "S");
      doc.setDrawColor(244, 170, 40);
      doc.setLineWidth(0.6);
      doc.roundedRect(frameX + 2.5, frameY + 2.5, frameW - 5, frameH - 5, 6, 6, "S");
      if(visuals.mascot){
        addImageAt(visuals.mascot, cx - heroMax / 2, frameY + framePad, heroMax, heroMax);
      }
      y = frameY + frameH + 7;

      doc.setDrawColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.setLineWidth(0.7);
      doc.line(cx - 26, y, cx + 26, y);
      y += 5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text("Signed with pride", cx, y, { align: "center" });
      y += 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("clubSENsational Team", cx, y, { align: "center" });

      /* ===== PAGE 2 — Full term story ===== */
      doc.addPage();
      doc.setFillColor(248, 251, 253);
      doc.rect(0, 0, pageW, pageH, "F");

      // Header band
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, 32, "F");
      doc.setFillColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.rect(0, 30, pageW, 3.5, "F");
      doc.setFillColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.rect(0, 33.5, pageW, 1.2, "F");

      if(logoDataUrl) addImageAt(logoDataUrl, margin, 6, 38, 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(swimBlueDeep[0], swimBlueDeep[1], swimBlueDeep[2]);
      doc.text("Your swimming journey this term", pageW / 2, 15, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text([content.swimmer, content.term, content.dateDisplay].filter(Boolean).join("  ·  "), pageW / 2, 23, { align: "center" });

      y = 42;
      const colGap = 10;
      const leftW = (maxW - colGap) * 0.54;
      const rightW = (maxW - colGap) * 0.46;
      const leftX = margin;
      const rightX = margin + leftW + colGap;

      // Pathway card
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 225, 235);
      doc.setLineWidth(0.5);
      doc.roundedRect(leftX, y, leftW, 46, 7, 7, "FD");
      if(visuals.mascot) addImageAt(visuals.mascot, leftX + 8, y + 6, 34, 34);
      const pathTextX = leftX + (visuals.mascot ? 48 : 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("PATHWAY", pathTextX, y + 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      doc.text(content.stageLabel || "Stage to be confirmed", pathTextX, y + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(
        ("Level " + (selectedLevel || "—") + (animalName ? " · " + animalName : "") + (badgeName ? " · " + badgeName : "")),
        pathTextX,
        y + 31,
      );
      if(decision){
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
        doc.text("Decision: " + decision, pathTextX, y + 40);
      }

      let ly = y + 54;
      const paraLines = doc.splitTextToSize(content.paragraph, leftW - 18);
      const paraH = paraLines.length * 5.2 + 16;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(leftX, ly, leftW, paraH, 7, 7, "FD");
      doc.setFillColor(swimGold[0], swimGold[1], swimGold[2]);
      doc.roundedRect(leftX, ly, 4, paraH, 1.5, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      let py = ly + 10;
      paraLines.forEach(function(line){
        doc.text(line, leftX + 10, py);
        py += 5.2;
      });
      ly += paraH + 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("This term we celebrated", leftX + 1, ly);
      ly += 6;
      content.highlights.slice(0, 5).forEach(function(item){
        const lines = doc.splitTextToSize(item, leftW - 16);
        const rowH = Math.max(11, lines.length * 4.6 + 6);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(210, 230, 238);
        doc.roundedRect(leftX, ly, leftW, rowH, 5, 5, "FD");
        doc.setFillColor(swimGold[0], swimGold[1], swimGold[2]);
        doc.circle(leftX + 7, ly + rowH / 2, 1.6, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(ink[0], ink[1], ink[2]);
        lines.forEach(function(line, idx){
          doc.text(line, leftX + 12, ly + 5.5 + idx * 4.6);
        });
        ly += rowH + 3.5;
      });

      // Right column
      let ry = y;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("Development this term", rightX + 1, ry);
      ry += 6;
      const domainCards = [
        { title: "Regulation", res: computeDomainResult("regulation"), img: visuals.regulation },
        { title: "Independence", res: computeDomainResult("independence"), img: visuals.independence },
        { title: "Engagement", res: computeDomainResult("engagement"), img: visuals.engagement },
      ];
      const dW = (rightW - 8) / 3;
      domainCards.forEach(function(d, i){
        const x = rightX + i * (dW + 4);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 214, 240);
        doc.roundedRect(x, ry, dW, 48, 6, 6, "FD");
        if(d.img) addImageAt(d.img, x + (dW - 18) / 2, ry + 4, 18, 16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(91, 45, 122);
        doc.text(d.title, x + dW / 2, ry + 28, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(d.res.answered > 0 ? d.res.label : "Growing", x + dW / 2, ry + 38, { align: "center" });
      });
      ry += 56;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 225, 235);
      const edu = "Our swimming programme grows through three stages and six adaptive levels. Progress is individual — celebrating regulation, independence and engagement alongside aquatic skills.";
      const eduLines = doc.splitTextToSize(edu, rightW - 16);
      const eduH = eduLines.length * 5 + 20;
      doc.roundedRect(rightX, ry, rightW, eduH, 7, 7, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(swimBlue[0], swimBlue[1], swimBlue[2]);
      doc.text("About the clubSENsational Swimming Journey", rightX + 8, ry + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      let ey = ry + 18;
      eduLines.forEach(function(line){
        doc.text(line, rightX + 8, ey);
        ey += 5;
      });
      ry += eduH + 8;

      doc.setFillColor(255, 248, 230);
      doc.setDrawColor(244, 183, 64);
      const nextLines = doc.splitTextToSize(content.nextSteps, rightW - 16);
      const nextH = nextLines.length * 5 + 22;
      doc.roundedRect(rightX, ry, rightW, nextH, 7, 7, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(154, 107, 18);
      doc.text("Looking ahead / Next term", rightX + 8, ry + 10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(ink[0], ink[1], ink[2]);
      let ny = ry + 18;
      nextLines.forEach(function(line){
        doc.text(line, rightX + 8, ny);
        ny += 5;
      });
      ry += nextH + 10;

      if(content.instructor){
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text("Reviewed by: " + content.instructor, rightX + 1, Math.min(ry + 2, pageH - 16));
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(muted[0], muted[1], muted[2]);
      doc.text(companyLine + " · www.clubsensational.org", pageW / 2, pageH - 7, { align: "center" });

      const saveStem = content.swimmer
        ? pdfSafeFilenameStem(content.swimmer + " Term Celebration Certificate")
        : pdfSafeFilenameStem("Term Celebration Certificate");
      return { doc, filename: (saveStem || "Term Celebration Certificate") + ".pdf" };
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
          s.title === "Participant details" ||
          s.title === "Stage & level" ||
          s.title === "Level progression decision";
        paras.forEach((p, idx) => {
          const lines = p.split("\n");
          if(s.title === "Learning outcomes summary"){
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
          if(s.title === "Executive term review summary"){
            lines.forEach(raw => {
              const line = raw.trim();
              if(!line) return;
              doc.setFont("helvetica", "normal");
              doc.setFontSize(bodyPt + 0.5);
              doc.setTextColor(ink[0], ink[1], ink[2]);
              const wrapped = doc.splitTextToSize(line, maxW - 11);
              ensureSpace(wrapped.length * (lineBody + 0.4) + 4);
              wrapped.forEach(w => {
                doc.text(w, textIndent, y);
                y += lineBody + 0.4;
              });
              y += 2;
            });
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

        if(s.title === "Stage & level"){
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
        wireLevelProgressionUI();
        wireReviewPartsAccordion();

        selectedStage = "";
        applyStageRules();
        renderFocusAreasForLevel(0);

        ["regulation","independence","engagement"].forEach(d => updateDomainUI(d));
        updateLevelProgressionUI();
        updateDevelopmentProfileUI();

        $$('#levelProgressDecisionRadios input[type="radio"]').forEach(r => {
          r.addEventListener("change", () => {
            showToast("Level progression decision updated");
            generateTermSummary();
          });
        });

        bindTermSummaryRefresh();
        wireSwtermBackDashboard();
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
                .then(([logoDataUrl, programmeDataUrl]) => ({
                  review: buildTermReviewPdf(logoDataUrl, programmeDataUrl),
                }))
                .catch(async () => ({
                  review: buildTermReviewPdf(null, null),
                }));
              const [docsMod, built] = await Promise.all([
                importPortalDocumentsModuleSwterm(),
                pdfPromise,
              ]);
              if(!built || !built.review || !built.review.doc){
                alert("PDF library not loaded. Please refresh the page and try again.");
                return;
              }
              const reviewBytes = built.review.doc.output("arraybuffer");
              const reviewBlob = new Blob([reviewBytes], { type: "application/pdf" });
              const auth = await docsMod.portalRequireUser();
              const reviewIso = fieldValTerm("reviewDate") || new Date().toISOString().slice(0, 10);
              const swimmer = ensureParticipantNameInField() || fieldValTerm("swimmerName").replace(/\s+/g, " ").trim();
              const poss = englishPossessive(swimmer);
              const reviewTitle = poss ? poss + " Swimming Term Review" : "Swimming Term Review";
              await docsMod.portalUploadPdfAndCreateDocument({
                blob: reviewBlob,
                document_type: "swim_term_review",
                category: "reports",
                title: reviewTitle,
                related_date: String(reviewIso).trim().slice(0, 10),
                related_client: swimmer || null,
                source_page: "swtermreview",
                reuseAuth: auth,
              });

              alert("Term review submitted successfully. Open My Documents to download or print the Term Review PDF. You can also generate the family Celebration Certificate from the button below.");
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

        const certBtn = $("#btnGenerateCertificate");
        if(certBtn){
          certBtn.addEventListener("click", async function(){
            const btn = this;
            const swimmer = ensureParticipantNameInField();
            if(!swimmer){
              setOpenReviewPart("details", { scroll: true });
              refreshReviewPartsFlow({ skipAutoAdvance: true });
              const swimEl = document.getElementById("swimmerName");
              const card = document.getElementById("cardDetails");
              if(card && typeof card.scrollIntoView === "function"){
                card.scrollIntoView({ behavior: "smooth", block: "start" });
              }
              if(swimEl){
                try{ swimEl.focus(); }catch(_){}
              }
              alert("Select the participant at the top first — type a letter to search the portal list, then generate the certificate.");
              return;
            }
            btn.disabled = true;
            generateTermSummary();
            try{
              const visuals = await loadCelebrationVisualAssets();
              const built = buildCelebrationCertificatePdf(visuals);
              if(!built || !built.doc){
                alert("PDF library not loaded. Please refresh the page and try again.");
                return;
              }
              const certBytes = built.doc.output("arraybuffer");
              const certBlob = new Blob([certBytes], { type: "application/pdf" });
              const docsMod = await importPortalDocumentsModuleSwterm();
              const auth = await docsMod.portalRequireUser();
              const reviewIso = fieldValTerm("reviewDate") || new Date().toISOString().slice(0, 10);
              const poss = englishPossessive(swimmer);
              const certTitle = poss
                ? poss + " Term Celebration Certificate"
                : "Term Celebration Certificate";
              await docsMod.portalUploadPdfAndCreateDocument({
                blob: certBlob,
                document_type: "swim_celebration_certificate",
                category: "reports",
                title: certTitle,
                related_date: String(reviewIso).trim().slice(0, 10),
                related_client: swimmer || null,
                source_page: "swtermreview",
                reuseAuth: auth,
              });
              try{
                built.doc.save(built.filename || "Term Celebration Certificate.pdf");
              }catch(_e){}
              showToast("Celebration certificate saved to My Documents");
              alert("Celebration certificate ready (2 pages: certificate + term journey). Saved to My Documents and downloaded.");
            }catch(err){
              const msg = err && err.message ? String(err.message) : "Unknown error";
              console.error("[swtermreview] certificate failed:", err);
              alert("Could not generate certificate. " + msg);
            }finally{
              btn.disabled = false;
            }
          });
        }
        generateTermSummary();
        void hydrateLoggedInStaffDisplayName().then(function(){
          if(typeof window.PortalFeedbackVoiceInput === "undefined") return;
          const inst = document.getElementById("instructorName");
          window.PortalFeedbackVoiceInput.init({
            fields: ["eviRegulation", "eviIndependence", "eviEngagement", "decisionNotes"],
            staffName: inst ? String(inst.value || "").trim() : "",
          });
        });
      }catch(err){
        console.error("swtermreview init failed:", err);
      }
    }

    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", init);
    }else{
      init();
    }
