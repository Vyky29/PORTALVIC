    (function(){
      const form = document.getElementById('termReviewForm');
      const progressFill = document.getElementById('progressFill');
      const progressStatus = document.getElementById('progressStatus');
      const progressSteps = document.querySelectorAll('.pstep');
      const summaryOutput = document.getElementById('summaryOutput');
      const LOGO_URL = 'https://www.clubsensational.org/wp-content/uploads/2025/07/F-01.png';
      const termLabels = { autumn: 'Autumn Term', spring: 'Spring Term', summer: 'Summer Term' };
      function isValidDDMMYYYY(str){
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
        if(!m) return false;
        const dd = +m[1];
        const mm = +m[2];
        const yyyy = +m[3];
        const dt = new Date(yyyy, mm - 1, dd);
        return dt.getFullYear() === yyyy && dt.getMonth() === mm - 1 && dt.getDate() === dd;
      }
      const reportDateViewportMq = window.matchMedia('(max-width: 760px)');
      function isMobileReportDateViewport(){
        return reportDateViewportMq.matches;
      }
      function isoDateToDDMMYYYY(iso){
        const s = String(iso || '').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
        const [y, mo, d] = s.split('-');
        return d + '/' + mo + '/' + y;
      }
      function ddmmyyyyToISO(str){
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
        if(!m || !isValidDDMMYYYY(str)) return '';
        return m[3] + '-' + m[2] + '-' + m[1];
      }
      function getReportDateDisplay(){
        if(isMobileReportDateViewport()){
          return (document.getElementById('reportDate').value || '').trim();
        }
        const iso = (document.getElementById('reportDatePicker').value || '').trim();
        return isoDateToDDMMYYYY(iso) || '';
      }
      function syncReportDateAcrossPickers(){
        const picker = document.getElementById('reportDatePicker');
        const text = document.getElementById('reportDate');
        if(!picker || !text) return;
        if(isMobileReportDateViewport()){
          if(picker.value) text.value = isoDateToDDMMYYYY(picker.value);
        }else{
          const t = (text.value || '').trim();
          if(isValidDDMMYYYY(t)) picker.value = ddmmyyyyToISO(t);
        }
      }
      const overallRatingGuide = {
        1: { title: 'Emerging', description: 'Practice over the term was very limited and needs major improvement.' },
        2: { title: 'Developing', description: 'Some elements were in place but were not consistently sustained across the term.' },
        3: { title: 'Secure', description: 'Practice met expectations in most parts of the term, with some gaps or minor inconsistency.' },
        4: { title: 'Strong practice', description: 'Practice was strong across the majority of sessions, with only small inconsistencies or areas for refinement.' },
        5: { title: 'Outstanding', description: 'Practice was consistently strong and purposeful throughout the term, demonstrating excellence and strong impact.' }
      };
      function overallBandFromRawTotal(rawTotal, allComplete){
        if(!allComplete) return null;
        const avg = rawTotal / 12;
        const level = Math.min(5, Math.max(1, Math.round(avg)));
        const row = overallRatingGuide[level];
        return { level, title: row.title, description: row.description };
      }
      let lastScreenSections = [];
      let lastPdfSections = [];
      const sectionQuestions = { a:['a1','a2','a3','a4'], b:['b1','b2','b3','b4'], c:['c1','c2','c3','c4'] };
      const sectionNames = {
        a: 'Professionalism & Safety',
        b: 'Engagement & Session Delivery',
        c: 'Regulation & Support'
      };
      const weights = { a:0.30, b:0.40, c:0.30 };
      const questionType = { a1:'scale', a2:'scale', a3:'scale', a4:'scale', b1:'scale', b2:'scale', b3:'scale', b4:'scale', c1:'scale', c2:'scale', c3:'scale', c4:'scale' };
      const scaleNarratives = {
        a1: {
          3: 'was consistently punctual and ready to start, with sessions prepared and no unnecessary delays',
          secure: 'was generally punctual and prepared across the term, with a little room to tighten consistency at session starts',
          2: 'was mostly punctual and prepared, though some delays or start-readiness gaps were seen across the term',
          1: 'was not consistently punctual or fully prepared; arrival and session readiness need improvement'
        },
        a2: {
          3: 'maintained appropriate dress and presentation for the service and environment across sessions',
          secure: 'generally met presentation expectations across the term, with minor inconsistency to polish',
          2: 'met dress and presentation expectations in most sessions, with occasional inconsistencies',
          1: 'did not consistently meet dress and presentation expectations for the role and environment'
        },
        a3: {
          3: 'demonstrated consistently professional communication and conduct across sessions',
          secure: 'communicated in a broadly professional manner, with fine-tuning possible for full consistency',
          2: 'showed generally appropriate communication and conduct, with some inconsistency over the term',
          1: 'showed communication and conduct that needed clear improvement'
        },
        a4: {
          3: 'maintained strong safety, safeguarding and procedural practice',
          secure: 'maintained a secure baseline for safety and procedures, with scope to embed habits even more evenly',
          2: 'showed acceptable safety and procedural awareness, but not consistently',
          1: 'showed gaps in safety, safeguarding and procedural practice'
        },
        b1: {
          3: 'built a strong positive connection and rapport',
          secure: 'built a generally positive connection, with small refinements possible in warmth and responsiveness',
          2: 'built rapport at times, though not consistently',
          1: 'struggled to build consistent rapport and connection'
        },
        b2: {
          3: 'sustained engagement effectively across sessions',
          secure: 'usually sustained engagement, with room to respond a little faster when participation dipped',
          2: 'promoted engagement in parts of sessions',
          1: 'struggled to maintain consistent engagement'
        },
        b3: {
          3: 'used visuals, resources and space effectively to support participation',
          secure: 'used resources and space well in most sessions, with slightly more consistency possible',
          2: 'used resources with some impact, but not consistently',
          1: 'needed to use visuals and resources more effectively'
        },
        b4: {
          3: 'delivered clear and purposeful session structure and flow',
          secure: 'delivered generally clear structure, with pacing and transitions open to refinement',
          2: 'showed partially clear structure and pacing',
          1: 'needed clearer structure, pacing and transitions'
        },
        c1: {
          3: 'recognised regulation needs accurately and in good time',
          secure: 'usually recognised regulation needs, with earlier or more uniform spotting possible',
          2: 'recognised regulation needs in several moments',
          1: 'needed to identify regulation needs more reliably'
        },
        c2: {
          3: 'adapted support appropriately to individual needs',
          secure: 'adapted support broadly well, with finer calibration possible on harder days',
          2: 'adapted support in parts, with room for greater consistency',
          1: 'needed to adapt support more effectively to needs'
        },
        c3: {
          3: 'used regulation strategies effectively to maintain calm and participation',
          secure: 'used regulation strategies across the term, with a little more predictability still available',
          2: 'used some regulation strategies, but not consistently',
          1: 'needed to apply regulation strategies more consistently'
        },
        c4: {
          3: 'maintained a consistent, calm and regulated presence across sessions',
          secure: 'mostly held a calm, supportive presence, with steadiness in busier moments still open to growth',
          2: 'maintained a generally regulated presence, with occasional inconsistency',
          1: 'needed to maintain a more consistent and regulated presence'
        }
      };

      const autoFeedback = {
        a1: {
          3: 'Punctuality and readiness: {{name}} was consistently on time, fully prepared, and ready to start without unnecessary delays across the term.',
          dev3: 'Punctuality and readiness: {{name}} was generally on time and prepared across the term; a little more consistency at session starts would strengthen overall reliability.',
          2: 'Punctuality and readiness: punctuality and start-readiness were mixed; please reduce delays and strengthen preparation so every session starts smoothly.',
          1: 'Punctuality and readiness: repeated delays or lack of readiness were observed; please prioritise arriving on time and being prepared to start promptly.'
        },
        a2: {
          dev3: 'Dress and presentation: overall presentation was acceptable across much of the term; a touch more consistency would fully align day-to-day appearance with expectations.',
          2: 'Dress and presentation: presentation met expectations in most sessions but was inconsistent; please align uniform/clothing with policy and environment more reliably.',
          1: 'Dress and presentation: dress and presentation expectations were not met reliably; please adjust clothing and grooming to match the role, activity and venue.'
        },
        a3: {
          3: 'Professional communication and conduct: {{name}} used a respectful tone, appropriate language, and clear, positive interaction with participants, families and staff.',
          dev3: 'Professional communication and conduct: {{name}} was broadly professional; fine-tuning tone and consistency in every exchange would raise this from secure practice to a stronger standard.',
          2: 'Professional communication and conduct: inconsistencies in tone, language and professional interaction were observed across sessions; please strengthen consistency.',
          1: 'Professional communication and conduct: significant gaps in respectful and appropriate communication were observed; please develop clearer professional communication.'
        },
        a4: {
          3: 'Safety, safeguarding and procedures: {{name}} demonstrated strong awareness of safety and safeguarding and adherence to venue and internal procedures.',
          dev3: 'Safety, safeguarding and procedures: practice sat at a secure baseline across the term; embedding routines even more evenly session to session would strengthen assurance.',
          2: 'Safety, safeguarding and procedures: inconsistent risk management and procedural adherence were observed; please apply procedures more consistently.',
          1: 'Safety, safeguarding and procedures: clear gaps in safety, safeguarding and procedure awareness were observed; please prioritise improvement in risk management and adherence.'
        },
        b1: {
          3: 'Connection and rapport: {{name}} brought a warm, attuned and reliably responsive approach across sessions. Trust appeared to build over time, and participants generally presented as comfortable, safe and willing to engage with support.',
          dev3: 'Connection and rapport: {{name}} built a generally positive connection across the term. With slightly quicker emotional attunement and more consistent relational check-ins, support would feel steadier and more predictable for participants in higher-demand moments.',
          2: 'Connection and rapport: rapport was evident in some moments but was not yet sustained across whole sessions. Please strengthen consistency in warmth, trust-building and responsive interaction so participants experience a more secure relational base throughout.',
          1: 'Connection and rapport: limited warmth, trust and responsiveness were observed across sessions. Please develop a clearer and more consistent relational approach, including proactive check-ins and calmer reassurance at key transition points.'
        },
        b2: {
          3: 'Engagement: {{name}} promoted and sustained meaningful involvement, choices and active participation across sessions.',
          dev3: 'Engagement: involvement was generally sustained; tightening response when participation dips would help keep momentum strong across the term.',
          2: 'Engagement: passive periods and delayed response to drops in engagement were observed; please reduce passive time and respond more quickly when engagement drops.',
          1: 'Engagement: limited opportunities for involvement were observed; please increase choices and active participation across sessions.'
        },
        b3: {
          3: 'Resources and space: {{name}} used equipment, visuals and space effectively to maintain interest, structure and clarity.',
          dev3: 'Resources and space: equipment and space usually supported the session well; slightly more consistent use would sharpen structure and clarity.',
          2: 'Resources and space: use of equipment, visuals and spatial organisation was inconsistent; please apply resources more consistently.',
          1: 'Resources and space: limited use of equipment, visuals and space was observed; please improve resource use to support engagement and clarity.'
        },
        b4: {
          3: 'Session structure and flow: {{name}} delivered a clear beginning, progression and ending; sessions felt organised and purposeful.',
          dev3: 'Session structure and flow: structure was generally clear; refining pacing and transitions would make the flow feel even more purposeful week to week.',
          2: 'Session structure and flow: uneven pacing and unclear transitions were observed; please tighten planning, pacing and transitions.',
          1: 'Session structure and flow: unclear opening, progression and closing were observed; please clarify structure so delivery is more organised.'
        },
        c1: {
          3: 'Regulation needs: {{name}} reliably identified signs of dysregulation, sensory needs, and emotional or behavioural changes.',
          dev3: 'Regulation needs: cues were usually picked up; spotting early signs a little sooner and more uniformly would strengthen proactive support.',
          2: 'Regulation needs: some cues were recognised, but speed and accuracy were inconsistent; please improve identification of regulation needs.',
          1: 'Regulation needs: key signs of dysregulation were frequently missed; please strengthen observation of emotional and behavioural changes.'
        },
        c2: {
          3: 'Adaptive support: {{name}} adjusted approach, pacing, communication and expectations appropriately to participants’ needs.',
          dev3: 'Adaptive support: adjustments broadly matched needs; calibrating pacing and expectations a little more finely would close small gaps on trickier days.',
          2: 'Adaptive support: adjustments were made in parts but were not sustained; please match approach, pacing and expectations more consistently.',
          1: 'Adaptive support: limited adaptation to individual needs was observed; please improve how support is matched to needs.'
        },
        c3: {
          3: 'Regulation strategies: {{name}} used breaks, visuals, reassurance, structure and co-regulation effectively to support calm and focus.',
          dev3: 'Regulation strategies: strategies were in use across the term; using them with a touch more predictability would reinforce calm and focus.',
          2: 'Regulation strategies: strategies were used at times but inconsistently; please apply breaks, visuals, reassurance and structure more consistently.',
          1: 'Regulation strategies: limited strategy use was observed; please use regulation supports more consistently.'
        },
        c4: {
          3: 'Regulated presence: {{name}} remained calm, predictable and supportive; this helped participants feel safe and regulated.',
          dev3: 'Regulated presence: {{name}} was mostly steady and supportive; holding that calm predictability in busier moments would anchor participants even more.',
          2: 'Regulated presence: moments of reduced predictability were observed; please maintain a calmer and more consistently supportive presence.',
          1: 'Regulated presence: frequent inconsistency in calm and support was observed; please work toward a steadier presence across sessions.'
        }
      };

      function getRaw(name){
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        return checked ? checked.value : null;
      }
      function fieldVal(id){
        const el = document.getElementById(id);
        return el ? (el.value || '').trim() : '';
      }
      function resolveStaffDisplayName(raw){
        return 'The staff member';
      }
      function capitalizeFirstLetterAfterColon(str){
        if(!str || typeof str !== 'string') return str;
        const idx = str.indexOf(':');
        if(idx === -1) return str;
        const before = str.slice(0, idx + 1);
        const after = str.slice(idx + 1);
        const m = after.match(/^\s*/);
        const ws = m ? m[0] : '';
        const body = after.slice(ws.length);
        if(!body.length) return str;
        const c0 = body.charAt(0);
        if(/[a-z]/.test(c0)) return before + ws + c0.toUpperCase() + body.slice(1);
        return str;
      }
      function getTermDisplay(){
        const v = fieldVal('term');
        return v ? (termLabels[v] || v) : '';
      }
      function integratedAdditionalNotes(fieldId){
        const t = fieldVal(fieldId).trim();
        if(!t) return null;
        let body = t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        if(!body) return null;
        if(/^other\s*:/i.test(body)) body = body.replace(/^other\s*:\s*/i, '').trim();
        if(!body) return null;
        const c0 = body.charAt(0);
        if(/[a-z]/.test(c0)) body = c0.toUpperCase() + body.slice(1);
        return 'Other: ' + body;
      }
      function formatFeedbackBulletHtml(line){
        const raw = (line || '').trim();
        if(!raw) return '';
        const idx = raw.indexOf(':');
        if(idx === -1) return escapeHtml(raw).replace(/\n/g, '<br>');
        const label = raw.slice(0, idx + 1);
        const body = raw.slice(idx + 1).trim();
        const labelEsc = escapeHtml(label);
        if(!body) return '<strong>' + labelEsc + '</strong>';
        const bodyEsc = escapeHtml(body).replace(/\n/g, '<br>');
        return '<strong>' + labelEsc + '</strong><br><span class="report-bullet-body">' + bodyEsc + '</span>';
      }
      function bulletLineHtml(line, blockTitle){
        if(blockTitle === 'Professional level') return formatMultilineBulletLineHtml(line);
        if(blockTitle === 'Strengths identified' || blockTitle === 'Areas for development') return formatFeedbackBulletHtml(line);
        if(line && line.indexOf('\n') !== -1) return formatMultilineBulletLineHtml(line);
        return formatBulletLineHtml(line);
      }
      function personalizeFeedback(template, staffRaw){
        return capitalizeFirstLetterAfterColon(template.replace(/\{\{name\}\}/g, resolveStaffDisplayName(staffRaw)));
      }
      function getDressPositiveFeedbackByService(service){
        if(service === 'Aquatic Activity'){
          return capitalizeFirstLetterAfterColon('Dress and presentation: appearance was appropriate, attire appeared clean, and swimwear was suitable for the activity and environment across sessions.');
        }
        return capitalizeFirstLetterAfterColon('Dress and presentation: appearance was appropriate, attire appeared clean, and trousers and trainers (or equivalent) were suitable for the activity and environment across sessions.');
      }
      function scoreToBand(score){
        if(score >= 4.2) return 'strong';
        if(score >= 3.6) return 'secure';
        if(score >= 2.8) return 'developing';
        return 'emerging';
      }
      function bulletsToParagraph(text){
        const raw = (text || '').trim();
        if(!raw) return '';
        const lines = raw
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean)
          .map(l => l.replace(/^[-*•✓✔☑]\s+/, '').replace(/^\d+[\).\s-]+/, '').trim())
          .filter(Boolean);
        const parts = lines.length ? lines : [raw];
        const sentenceReady = parts.map(p => clean(p));
        if(!sentenceReady.length) return '';
        if(sentenceReady.length === 1) return sentenceReady[0];
        if(sentenceReady.length === 2) return sentenceReady[0] + ' ' + sentenceReady[1];
        return sentenceReady.slice(0, -1).join(' ') + ' ' + sentenceReady[sentenceReady.length - 1];
      }
      function listToParagraph(items){
        if(!items || !items.length) return '';
        return bulletsToParagraph(items.map(i => '• ' + i).join('\n'));
      }
      function escapeHtml(t){
        const d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
      }
      function formatBulletLineHtml(line){
        const safe = escapeHtml(line || '');
        const idx = safe.indexOf(':');
        if(idx === -1) return safe;
        return '<strong>' + safe.slice(0, idx + 1) + '</strong>' + safe.slice(idx + 1);
      }
      function formatMultilineBulletLineHtml(line){
        const raw = line || '';
        const br = raw.indexOf('\n');
        if(br === -1) return formatBulletLineHtml(raw);
        const head = raw.slice(0, br).trim();
        const tail = raw.slice(br + 1).trim();
        return formatBulletLineHtml(head) + (tail ? '<br>' + escapeHtml(tail).replace(/\n/g, '<br>') : '');
      }
      function buildNarrativeBody(narrative){
        return [
          narrative.overallPara,
          narrative.secA,
          narrative.secB,
          narrative.secC,
          narrative.strengths ? ('Strengths identified over the term: ' + narrative.strengths) : 'Strengths identified over the term: no strengths indicators were recorded (ratings 4–5).',
          narrative.development ? ('Areas for development identified: ' + narrative.development) : 'Areas for development identified: no development priorities were recorded (ratings 1–3).',
          'This narrative connects scores, section feedback, strengths and development into readable prose. Copy it into your AI tool to polish tone and produce a final term review if needed.'
        ].join('\n\n');
      }
      function buildScreenReportSections(staff, scores, autoLists){
        const sections = [];
        sections.push({
          type: 'paragraph',
          title: 'Term review details',
          body: [
            'Reviewer: ' + (fieldVal('reviewerName') || '—'),
            'Staff member reviewed: ' + (fieldVal('staffReviewed') || '—'),
            'Term: ' + (getTermDisplay() || '—'),
            'Report date: ' + (getReportDateDisplay() || '—'),
            'Service: ' + (fieldVal('service') || '—')
          ].join('\n')
        });
        sections.push({
          type: 'bullets',
          title: 'Strengths identified',
          lines: (() => {
            const extra = integratedAdditionalNotes('strengthsOther');
            const auto = autoLists.strengths.length ? autoLists.strengths.slice() : [];
            if(auto.length && extra) return auto.concat([extra]);
            if(auto.length) return auto;
            if(extra) return [extra];
            return ['No top-band indicators were recorded (ratings 4–5).'];
          })()
        });
        sections.push({
          type: 'bullets',
          title: 'Areas for development',
          lines: (() => {
            const extra = integratedAdditionalNotes('developmentOther');
            const auto = autoLists.development.length ? autoLists.development.slice() : [];
            if(auto.length && extra) return auto.concat([extra]);
            if(auto.length) return auto;
            if(extra) return [extra];
            return ['No development priorities were recorded (ratings 1–3).'];
          })()
        });
        sections.push({
          type: 'bullets',
          title: 'Professional level',
          lines: scores.allComplete && scores.overallBandTitle ? [
            'Professional level over the term was assessed as:\n' + scores.overallBandTitle + '\n' + scores.overallBandDescription
          ] : [
            'Professional level was not finalised (some ratings were still incomplete).\nThe descriptor will appear once all 12 ratings are completed.'
          ]
        });
        return sections;
      }
      function buildNarrativePdfSection(narrative){
        return [{
          type: 'paragraph',
          title: 'Narrative summary (draft for AI)',
          body: buildNarrativeBody(narrative)
        }];
      }
      function renderReportHtml(sections){
        return sections.map(s => {
          let inner = '';
          if(s.type === 'criteria'){
            inner = '<div class="report-block-body">' + s.items.map(it =>
              '<div class="report-item"><span class="criterion-title">' + escapeHtml(it.title) + '</span><p class="criterion-desc">' + escapeHtml(it.desc) + '</p><p class="criterion-rating"><strong>Selected rating:</strong> ' + escapeHtml(it.rating) + '</p></div>'
            ).join('') + '</div>';
          }else if(s.type === 'bullets'){
            inner = '<div class="report-block-body"><ul>' + s.lines.map(l => '<li>' + bulletLineHtml(l, s.title) + '</li>').join('') + '</ul></div>';
          }else{
            const paras = (s.body || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean);
            inner = '<div class="report-block-body">' + paras.map(p => {
              if(s.title === 'Term review details'){
                return '<p>' + p.split('\n').map(line => formatBulletLineHtml(line)).join('<br>') + '</p>';
              }
              return '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>';
            }).join('') + '</div>';
          }
          return '<div class="report-block"><div class="report-block-title">' + escapeHtml(s.title) + '</div>' + inner + '</div>';
        }).join('');
      }
      function getAutoStrengthsAndDevelopmentLists(staffRaw){
        const strengths = [];
        const development = [];
        const ids = [].concat(sectionQuestions.a, sectionQuestions.b, sectionQuestions.c);
        ids.forEach(id => {
          const raw = getRaw(id);
          if(raw === null) return;
          const fb = autoFeedback[id];
          if(!fb) return;
          const n = Number(raw);
          // Strengths: ratings 4–5. Development: 1–2 (clear priorities) and 3 (subtle “secure but refining” via dev3).
          if(n >= 4){
            if(id === 'a2') strengths.push(getDressPositiveFeedbackByService(fieldVal('service')));
            else if(fb[3]) strengths.push(personalizeFeedback(fb[3], staffRaw));
          }else{
            if(n === 3 && fb.dev3) development.push(personalizeFeedback(fb.dev3, staffRaw));
            if(n === 2 && fb[2]) development.push(personalizeFeedback(fb[2], staffRaw));
            if(n === 1 && fb[1]) development.push(personalizeFeedback(fb[1], staffRaw));
          }
        });
        return { strengths, development };
      }
      function renderAutoFeedbackPanels(){
        const { strengths, development } = getAutoStrengthsAndDevelopmentLists(fieldVal('staffReviewed'));
        const stList = document.getElementById('strengthsList');
        const stEmpty = document.getElementById('strengthsEmpty');
        const devList = document.getElementById('developmentList');
        const devEmpty = document.getElementById('developmentEmpty');
        const strengthLines = strengths.slice();
        const devLines = development.slice();
        const sO = integratedAdditionalNotes('strengthsOther');
        const dO = integratedAdditionalNotes('developmentOther');
        if(sO) strengthLines.push(sO);
        if(dO) devLines.push(dO);
        stList.innerHTML = strengthLines.map(l => '<li>' + bulletLineHtml(l, 'Strengths identified') + '</li>').join('');
        devList.innerHTML = devLines.map(l => '<li>' + bulletLineHtml(l, 'Areas for development') + '</li>').join('');
        const stShow = strengthLines.length > 0;
        const devShow = devLines.length > 0;
        stList.hidden = !stShow;
        stEmpty.hidden = stShow;
        devList.hidden = !devShow;
        devEmpty.hidden = devShow;
      }
      function buildItemNarrative(name, personName){
        const raw = getRaw(name);
        if(raw === null) return null;
        const n = Number(raw);
        const sn = scaleNarratives[name];
        if(!sn) return null;
        let text = null;
        if(n === 5 || n === 4){
          text = sn[3];
          if(n === 4 && text) text = String(text).replace(/\bconsistently\b/gi, 'mostly');
        }else if(n === 3){
          text = sn.secure || sn[2];
        }else if(n === 2){
          text = sn[2];
        }else{
          text = sn[1];
        }
        if(!text) return null;
        return `${personName} ${text} (${n}/5)`;
      }
      function buildSectionNarrative(key, sectionScore, personName){
        const items = sectionQuestions[key].map(q => buildItemNarrative(q, personName)).filter(Boolean);
        const ratedCount = sectionQuestions[key].filter(q => getRaw(q) !== null).length;
        const coverage = ratedCount === sectionQuestions[key].length ? 'complete' : 'partial';
        const band = scoreToBand(sectionScore);
        return `${sectionNames[key]} was ${coverage} with a ${band} profile at ${sectionScore.toFixed(1)}/5. ${items.join('. ')}.`;
      }
      function getScore(name){
        const raw = getRaw(name);
        if(raw === null) return null;
        return Number(raw);
      }
      function averageSection(key){
        const vals = sectionQuestions[key].map(getScore).filter(v => v !== null);
        if(!vals.length) return 0;
        return vals.reduce((a,b)=>a+b,0) / vals.length;
      }
      function isSectionComplete(key){
        return sectionQuestions[key].every(q => getScore(q) !== null);
      }
      function isReportDateComplete(){
        if(isMobileReportDateViewport()){
          const el = document.getElementById('reportDate');
          return !!(el && isValidDDMMYYYY((el.value || '').trim()));
        }
        const p = document.getElementById('reportDatePicker');
        return !!(p && (p.value || '').trim() !== '');
      }
      function isDetailsComplete(){
        return ['reviewerName','staffReviewed','term','service']
          .every(id => (document.getElementById(id).value || '').trim() !== '') && isReportDateComplete();
      }
      function isFinalComplete(){
        return isSectionComplete('a') && isSectionComplete('b') && isSectionComplete('c');
      }
      function calculateScores(){
        const a = averageSection('a');
        const b = averageSection('b');
        const c = averageSection('c');
        const allComplete = isSectionComplete('a') && isSectionComplete('b') && isSectionComplete('c');
        const allIds = [].concat(sectionQuestions.a, sectionQuestions.b, sectionQuestions.c);
        const rawTotal = allIds.map(getScore).filter(v => v !== null).reduce((sum, v) => sum + v, 0);
        const band = overallBandFromRawTotal(rawTotal, allComplete);
        return {
          a, b, c, rawTotal, allComplete,
          overallBandLevel: band ? band.level : null,
          overallBandTitle: band ? band.title : '',
          overallBandDescription: band ? band.description : ''
        };
      }
      function updateProgress(){
        const steps = [isSectionComplete('a'), isSectionComplete('b'), isSectionComplete('c'), isDetailsComplete() && isFinalComplete()];
        const done = steps.filter(Boolean).length;
        const pct = Math.round((done / steps.length) * 100);
        progressFill.style.width = pct + '%';
        progressStatus.textContent = 'Step ' + done + ' of ' + steps.length + ' completed';
        progressSteps.forEach((el, i) => {
          el.classList.remove('active','done');
          if(steps[i]) el.classList.add('done');
          else if(i === done) el.classList.add('active');
        });
      }
      function clean(text){
        const t = (text || '').replace(/\s+/g,' ').trim();
        if(!t) return '';
        return /[.!?]$/.test(t) ? t : t + '.';
      }
      function generateSummary(){
        const scores = calculateScores();
        const staffRaw = document.getElementById('staffReviewed').value.trim();
        const staff = staffRaw || 'Staff member name not provided';
        const autoLists = getAutoStrengthsAndDevelopmentLists(staffRaw);
        const strengthLinesNarr = autoLists.strengths.slice();
        const devLinesNarr = autoLists.development.slice();
        const sOn = integratedAdditionalNotes('strengthsOther');
        const dOn = integratedAdditionalNotes('developmentOther');
        if(sOn) strengthLinesNarr.push(sOn);
        if(dOn) devLinesNarr.push(dOn);
        const strengths = listToParagraph(strengthLinesNarr);
        const development = listToParagraph(devLinesNarr);
        const hasOtherOnly = fieldVal('strengthsOther').trim() !== '' || fieldVal('developmentOther').trim() !== '';
        if(!isDetailsComplete() && !scores.allComplete && !autoLists.strengths.length && !autoLists.development.length && !hasOtherOnly){
          summaryOutput.classList.remove('summary-rich');
          summaryOutput.innerHTML = '<p class="summary-placeholder">Complete the form to preview term details, strengths and development, scores and professional level. The PDF will mirror this summary with corporate branding.</p>';
          lastScreenSections = [];
          lastPdfSections = [];
          return;
        }
        const secA = buildSectionNarrative('a', scores.a, staff);
        const secB = buildSectionNarrative('b', scores.b, staff);
        const secC = buildSectionNarrative('c', scores.c, staff);
        const termPhrase = getTermDisplay() ? ' (' + getTermDisplay() + ')' : '';
        const overallPara = scores.allComplete
          ? `${staff} was reviewed across sessions${termPhrase}. Professional level was assessed as ${scores.overallBandTitle}. ${scores.overallBandDescription}`
          : `${staff} was reviewed across sessions${termPhrase}. Professional level was not finalised because some section ratings were still incomplete.`;
        const narrativePayload = { overallPara, secA, secB, secC, strengths, development };
        lastScreenSections = buildScreenReportSections(staff, scores, autoLists);
        lastPdfSections = buildNarrativePdfSection(narrativePayload);
        summaryOutput.classList.add('summary-rich');
        summaryOutput.innerHTML = renderReportHtml(lastScreenSections);
      }
      function buildPdf(logoDataUrl){
        const { jsPDF } = window.jspdf;
        if(!jsPDF) return null;
        const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        const maxW = pageW - margin * 2;
        const headerBand = [255, 244, 196];
        const footerH = 10;
        const bottomSafe = 12 + footerH;
        let y = 14;
        const sections = lastScreenSections.length ? lastScreenSections : [];
        // Corporate dark yellow for outlines + titles
        const brandBlue = [244, 183, 64];
        const brandBlueSoft = [255, 246, 214];
        const brandText = [11, 18, 32];
        const bulletAfterItemGap = 2.6;
        const pdfParagraphGap = 3.6;

        function ensureSpace(heightNeeded){
          if(y + heightNeeded <= pageH - bottomSafe) return;
          doc.addPage();
          y = 14;
        }

        const sectionTitleTotalHeight = 16.8;

        function drawSectionTitle(title){
          doc.setFillColor(brandBlueSoft[0], brandBlueSoft[1], brandBlueSoft[2]);
          doc.setDrawColor(brandBlue[0], brandBlue[1], brandBlue[2]);
          doc.roundedRect(margin, y, maxW, 10, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
          doc.text(title, margin + 4, y + 6.2);
          y += sectionTitleTotalHeight;
        }

        /** Keep section title with at least the first block of content (avoid title alone at page bottom). */
        function ensureSectionTitleWithHeadContent(headContentHeight){
          const minHeadBlock = 28; // hard minimum to prevent orphan headers
          const need = sectionTitleTotalHeight + Math.max(headContentHeight, minHeadBlock) + 2;
          ensureSpace(need);
        }

        function estimateFirstDetailLineHeight(line){
          doc.setFontSize(9.5);
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          doc.setFont('helvetica', 'normal');
          // conservative estimate to avoid title/content split
          const wholeWrapped = doc.splitTextToSize(String(line || '').replace(/\n+/g, ' '), maxW - 10);
          return (wholeWrapped.length + 1) * 4.5 + 4;
        }

        function estimateFirstBulletBlockHeight(line){
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          // conservative estimate: treat as one continuous paragraph in narrower width + safety lines
          const normalized = String(line || '').replace(/\n+/g, ' ').trim();
          const wrapped = doc.splitTextToSize(normalized, maxW - 16);
          return (wrapped.length + 2) * 4.5 + bulletAfterItemGap + 4;
        }

        function estimateFirstContentHeight(s){
          if(s.type === 'bullets'){
            const L = s.lines || [];
            if(!L.length) return 4.5 + bulletAfterItemGap;
            return estimateFirstBulletBlockHeight(L[0]) + 6;
          }
          const lines = (s.body || '').split('\n').map(t => t.trim()).filter(Boolean);
          if(!lines.length) return 4.5;
          if(s.title === 'Term review details'){
            return estimateFirstDetailLineHeight(lines[0]) + 4;
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          const wrapped = doc.splitTextToSize(lines[0].replace(/\n+/g, ' '), maxW - 10);
          return wrapped.length * 4.5 + 6;
        }

        function drawDetailLine(line){
          doc.setFontSize(9.5);
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          const idx = line.indexOf(':');
          if(idx === -1){
            doc.setFont('helvetica', 'normal');
            const wrapped = doc.splitTextToSize(line, maxW - 10);
            ensureSpace((wrapped.length * 4.5) + 1.6);
            wrapped.forEach(w => {
              doc.text(w, margin + 5, y);
              y += 4.5;
            });
            return;
          }
          const prefix = line.slice(0, idx + 1);
          const rest = line.slice(idx + 1).trim();
          doc.setFont('helvetica', 'bold');
          const prefixW = doc.getTextWidth(prefix + ' ');
          const firstLineRestW = Math.max(24, maxW - 10 - prefixW);
          const restWrapped = rest ? doc.splitTextToSize(rest, firstLineRestW) : [];
          ensureSpace((1 + restWrapped.length) * 4.5 + 1.6);
          doc.setFont('helvetica', 'bold');
          doc.text(prefix, margin + 5, y);
          doc.setFont('helvetica', 'normal');
          if(restWrapped.length){
            doc.text(restWrapped[0], margin + 5 + prefixW, y);
          }
          y += 4.5;
          const contX = margin + 5 + prefixW;
          for(let i = 1; i < restWrapped.length; i++){
            doc.text(restWrapped[i], contX, y);
            y += 4.5;
          }
        }

        function drawIndentedParagraphs(raw, indentX){
          if(!raw) return;
          doc.setFont('helvetica', 'normal');
          const w = maxW - (indentX - margin);
          const parts = String(raw)
            .replace(/\r/g, '')
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(Boolean);
          parts.forEach((para, pi) => {
            const logicalLines = para.split('\n').map(l => l.trim()).filter(Boolean);
            logicalLines.forEach((line, li) => {
              const tw = doc.splitTextToSize(line, w);
              ensureSpace(tw.length * 4.5 + 1.2);
              tw.forEach(tline => {
                doc.text(tline, indentX, y);
                y += 4.5;
              });
              if(li < logicalLines.length - 1) y += 0.8;
            });
            if(pi < parts.length - 1) y += pdfParagraphGap;
          });
        }

        function drawTailIndented(tail, indentX){
          drawIndentedParagraphs(tail, indentX);
        }

        function drawBulletWithBoldPrefix(line){
          doc.setFontSize(9.5);
          const br = line.indexOf('\n');
          if(br !== -1){
            const head = line.slice(0, br).trim();
            const tail = line.slice(br + 1).trim();
            const idx = head.indexOf(':');
            if(idx === -1){
              const wrapped = doc.splitTextToSize('• ' + head, maxW - 10);
              ensureSpace((wrapped.length * 4.5) + 1.6 + (tail ? 4.5 : 0));
              doc.setFont('helvetica', 'normal');
              wrapped.forEach(w => {
                doc.text(w, margin + 5, y);
                y += 4.5;
              });
              drawTailIndented(tail, margin + 9);
              return;
            }
            const prefix = head.slice(0, idx + 1);
            const inlineRest = head.slice(idx + 1).trim();
            const inlineOneLine = inlineRest ? inlineRest.replace(/\n+/g, ' ').trim() : '';
            const firstBlockLines = 1 + (inlineOneLine ? doc.splitTextToSize(inlineOneLine, maxW - 16).length : 0);
            ensureSpace((firstBlockLines + 8) * 4.5 + 1.6);
            doc.setFont('helvetica', 'bold');
            doc.text('• ' + prefix, margin + 5, y);
            doc.setFont('helvetica', 'normal');
            y += 4.5;
            if(inlineOneLine){
              const iw = doc.splitTextToSize(inlineOneLine, maxW - 16);
              iw.forEach(w => {
                doc.text(w, margin + 9, y);
                y += 4.5;
              });
            }
            drawTailIndented(tail, margin + 9);
            return;
          }

          const idx = line.indexOf(':');
          if(idx === -1){
            const wrapped = doc.splitTextToSize('• ' + line, maxW - 10);
            ensureSpace((wrapped.length * 4.5) + 1.6);
            doc.setFont('helvetica', 'normal');
            wrapped.forEach(w => {
              doc.text(w, margin + 5, y);
              y += 4.5;
            });
            return;
          }
          const prefix = line.slice(0, idx + 1);
          const rest = line.slice(idx + 1).trim();
          ensureSpace((1 + 12) * 4.5 + 1.6);

          doc.setFont('helvetica', 'bold');
          doc.text('• ' + prefix, margin + 5, y);
          doc.setFont('helvetica', 'normal');
          y += 4.5;
          drawIndentedParagraphs(rest, margin + 9);
        }

        function drawBodyLines(lines, useBullets){
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          lines.forEach(line => {
            if(useBullets){
              drawBulletWithBoldPrefix(line);
              ensureSpace(bulletAfterItemGap + 0.5);
              y += bulletAfterItemGap;
            }else{
              const wrapped = doc.splitTextToSize(line, maxW - 10);
              ensureSpace((wrapped.length * 4.5) + 1.6);
              wrapped.forEach(w => {
                doc.text(w, margin + 5, y);
                y += 4.5;
              });
            }
          });
          y += 1.2;
        }

        const headerPad = 3;
        const logoMaxInnerH = 50;
        const headerVPad = 0;
        let headerH = 20;
        let headerDrawn = false;
        if(logoDataUrl){
          try{
            const fmt = logoDataUrl.includes('jpeg') ? 'JPEG' : 'PNG';
            const props = doc.getImageProperties(logoDataUrl);
            const iw = props.width || 1;
            const ih = props.height || 1;
            const logoBoxW = pageW - headerPad * 2;
            const scale = Math.min(logoBoxW / iw, logoMaxInnerH / ih);
            const logoW = iw * scale;
            const logoH = ih * scale;
            headerH = logoH + headerVPad * 2;
            doc.setFillColor(headerBand[0], headerBand[1], headerBand[2]);
            doc.rect(0, 0, pageW, headerH, 'F');
            doc.addImage(logoDataUrl, fmt, (pageW - logoW) / 2, (headerH - logoH) / 2, logoW, logoH);
            headerDrawn = true;
          }catch(e){}
        }
        if(!headerDrawn){
          doc.setFillColor(headerBand[0], headerBand[1], headerBand[2]);
          doc.rect(0, 0, pageW, headerH, 'F');
        }
        y = headerH + 8;

        if(!sections.length){
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.text('Complete the form to generate the summary PDF.', margin, y);
        }
        sections.forEach(s => {
          ensureSectionTitleWithHeadContent(estimateFirstContentHeight(s));
          drawSectionTitle(s.title);
          if(s.type === 'bullets'){
            drawBodyLines(s.lines || [], true);
          }else{
            const lines = (s.body || '').split('\n').map(t => t.trim()).filter(Boolean);
            if(s.title === 'Term review details'){
              lines.forEach(drawDetailLine);
              y += 1.2;
            }else{
              drawBodyLines(lines, false);
            }
          }
        });
        const totalPages = doc.internal.getNumberOfPages();
        doc.setPage(totalPages);
        doc.setFillColor(headerBand[0], headerBand[1], headerBand[2]);
        doc.rect(0, pageH - footerH, pageW, footerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
        doc.text('clubSENsational Services', pageW / 2, pageH - footerH / 2 + 1.15, { align: 'center' });
        const staffRaw = (document.getElementById('staffReviewed').value || '').trim();
        const staff = (staffRaw || '')
          .replace(/[<>:"/\\|?*\u0000]/g, '')
          .replace(/[^a-zA-Z0-9\s]/g,'')
          .replace(/\s+/g,' ')
          .trim()
          .slice(0,72) || 'Staff member reviewed';

        const termKey = fieldVal('term') || '';
        const termLabel = termLabels[termKey] || termKey || 'term';
        const termShortRaw = String(termLabel).split(' ')[0] || termLabel;
        const termShort = termShortRaw.replace(/[^a-zA-Z0-9]/g,'');

        return { doc, filename: staff + ' - Term Review (' + termShort + ').pdf' };
      }
      function loadLogoAsDataUrl(){
        return fetch(LOGO_URL,{ mode:'cors' }).then(r => r.ok ? r.blob() : Promise.reject()).then(blob => new Promise(resolve => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(blob);
        })).catch(() => null);
      }
      const PORTAL_AUTH_MODULE = 'https://www.clubsensational.org/wp-content/uploads/2026/05/auth-handler.js?v=20260419-99';
      function snapshotResponsesFromForm(root){
        const out = {};
        root.querySelectorAll('input, select, textarea').forEach(function(el){
          const tag = el.tagName && el.tagName.toLowerCase();
          if(tag === 'button') return;
          const key = (el.name && String(el.name).trim()) || (el.id && String(el.id).trim());
          if(!key) return;
          if(tag === 'input'){
            const t = String(el.type || '').toLowerCase();
            if(t === 'radio' || t === 'checkbox'){
              if(!el.checked) return;
            }
          }
          out[key] = String(el.value != null ? el.value : '').trim();
        });
        return out;
      }
      async function persistLeaderTermReviewIfAuthed(pdfFilename){
        try{
          const mod = await import(PORTAL_AUTH_MODULE);
          if(typeof mod.getSupabaseClient !== 'function') return;
          const supabase = mod.getSupabaseClient();
          const authRes = await supabase.auth.getUser();
          const u = authRes && authRes.data && authRes.data.user;
          if(!u || !u.id) return;
          const uid = String(u.id).trim();
          const profRes = await supabase.from('staff_profiles').select('app_role, full_name, username').eq('id', uid).maybeSingle();
          const profileRow = profRes && profRes.data;
          if(!profileRow) return;
          const role = String(profileRow.app_role || '').toLowerCase();
          if(role !== 'lead' && role !== 'admin' && role !== 'ceo') return;
          const displayName = String(profileRow.full_name || profileRow.username || '').replace(/\s+/g,' ').trim();
          if(!displayName) return;
          const responses = snapshotResponsesFromForm(form);
          const summaryText = summaryOutput ? String(summaryOutput.innerText || '').trim().slice(0, 12000) : '';
          const payload = {
            submitted_by_user_id: uid,
            submitted_by_name: displayName,
            reviewer_name: (document.getElementById('reviewerName') && document.getElementById('reviewerName').value || '').replace(/\s+/g,' ').trim(),
            staff_reviewed: (document.getElementById('staffReviewed') && document.getElementById('staffReviewed').value || '').replace(/\s+/g,' ').trim(),
            term: (document.getElementById('term') && document.getElementById('term').value || '').trim(),
            report_date: getReportDateDisplay(),
            service: (document.getElementById('service') && document.getElementById('service').value || '').trim(),
            pdf_filename: pdfFilename ? String(pdfFilename).slice(0, 240) : null,
            responses: Object.assign({}, responses, { summary_text: summaryText })
          };
          const ins = await supabase.from('leader_term_reviews').insert([payload]);
          if(ins.error) console.warn('leader_term_reviews insert', ins.error);
        }catch(_e){}
      }
      form.addEventListener('input', () => { calculateScores(); updateProgress(); renderAutoFeedbackPanels(); generateSummary(); });
      form.addEventListener('change', () => { calculateScores(); updateProgress(); renderAutoFeedbackPanels(); generateSummary(); });
      reportDateViewportMq.addEventListener('change', () => {
        syncReportDateAcrossPickers();
        calculateScores();
        updateProgress();
        renderAutoFeedbackPanels();
        generateSummary();
      });
      document.getElementById('btnSummaryPdf').addEventListener('click', function(){
        const btn = this; btn.disabled = true; generateSummary();
        loadLogoAsDataUrl().then(logoDataUrl => {
          const built = buildPdf(logoDataUrl);
          if(!built) alert('PDF library not loaded. Please refresh the page and try again.');
          else {
            built.doc.save(built.filename);
            void persistLeaderTermReviewIfAuthed(built.filename);
            try{
              if(typeof portalRedirectToPortalReturn === 'function') portalRedirectToPortalReturn();
            }catch(_e){}
          }
          btn.disabled = false;
        });
      });
      syncReportDateAcrossPickers();
      renderAutoFeedbackPanels();
      calculateScores(); updateProgress(); generateSummary();
    })();
