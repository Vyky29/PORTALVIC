    (function(){
      const form = document.getElementById('observationForm');
      const progressFill = document.getElementById('progressFill');
      const progressStatus = document.getElementById('progressStatus');
      const progressSteps = document.querySelectorAll('.pstep');
      const summaryOutput = document.getElementById('summaryOutput');
      const LOGO_URL = 'https://www.clubsensational.org/wp-content/uploads/2025/07/F-01.png';
      let lastScreenSections = [];
      let lastPdfSections = [];
      const sectionQuestions = { a:['a1','a2','a3','a4'], b:['b1','b2','b3','b4'], c:['c1','c2','c3','c4'] };
      const sectionNames = {
        a: 'Professionalism & Safety',
        b: 'Engagement & Session Delivery',
        c: 'Regulation & Support'
      };
      const weights = { a:0.30, b:0.40, c:0.30 };
      const questionType = { a1:'yesno', a2:'yesno', a3:'scale', a4:'scale', b1:'scale', b2:'scale', b3:'scale', b4:'scale', c1:'scale', c2:'scale', c3:'scale', c4:'scale' };
      const scaleNarratives = {
        a3: {
          3: 'demonstrated consistently professional communication and conduct',
          2: 'showed generally appropriate communication and conduct, with some inconsistency',
          1: 'showed communication and conduct that needed clear improvement'
        },
        a4: {
          3: 'maintained strong safety, safeguarding and procedural practice',
          2: 'showed acceptable safety and procedural awareness, but not consistently',
          1: 'showed gaps in safety, safeguarding and procedural practice'
        },
        b1: {
          3: 'built a strong positive connection and rapport',
          2: 'built rapport at times, though not consistently',
          1: 'struggled to build consistent rapport and connection'
        },
        b2: {
          3: 'sustained engagement effectively throughout the session',
          2: 'promoted engagement in parts of the session',
          1: 'struggled to maintain consistent engagement'
        },
        b3: {
          3: 'used visuals, resources and space effectively to support participation',
          2: 'used resources with some impact, but not consistently',
          1: 'needed to use visuals and resources more effectively'
        },
        b4: {
          3: 'delivered a clear and purposeful session structure and flow',
          2: 'showed a partially clear structure and pacing',
          1: 'needed clearer structure, pacing and transitions'
        },
        c1: {
          3: 'recognised regulation needs accurately and in good time',
          2: 'recognised regulation needs in several moments',
          1: 'needed to identify regulation needs more reliably'
        },
        c2: {
          3: 'adapted support appropriately to individual needs',
          2: 'adapted support in parts, with room for greater consistency',
          1: 'needed to adapt support more effectively to needs'
        },
        c3: {
          3: 'used regulation strategies effectively to maintain calm and participation',
          2: 'used some regulation strategies, but not consistently',
          1: 'needed to apply regulation strategies more consistently'
        },
        c4: {
          3: 'maintained a consistent, calm and regulated presence throughout the session',
          2: 'maintained a generally regulated presence, with occasional inconsistency',
          1: 'needed to maintain a more consistent and regulated presence'
        }
      };

      const autoFeedback = {
        a1: {
          yes: 'Punctuality and readiness: arrives on time, is fully prepared, and is ready to start without unnecessary delays.',
          no: 'Punctuality and readiness: delays in arrival and start-readiness were observed during the session; please improve consistency in arriving on time and being ready to start promptly.'
        },
        a2: {
          yes: 'Dress and presentation: appearance is appropriate, attire appears clean, and trousers and trainers are suitable, or swimming costume where applicable, for the activity and environment.',
          no: 'Dress and presentation: uniform was not seen during the session, please adjust clothing and presentation to meet uniform and environmental expectations more consistently.'
        },
        a3: {
          3: 'Professional communication and conduct: {{name}} used a respectful tone, appropriate language, and clear, positive interaction with participants, families and staff.',
          2: 'Professional communication and conduct: inconsistencies in tone, language and professional interaction were observed; please strengthen consistency across interactions with participants, families and staff.',
          1: 'Professional communication and conduct: significant gaps in respectful and appropriate communication were observed; please develop clearer professional communication with participants, families and staff.'
        },
        a4: {
          3: 'Safety, safeguarding and procedures: {{name}} demonstrated strong awareness of safety and safeguarding and adherence to venue and internal procedures.',
          2: 'Safety, safeguarding and procedures: inconsistent risk management and procedural adherence were observed; please apply safety and safeguarding procedures more consistently.',
          1: 'Safety, safeguarding and procedures: clear gaps in safety, safeguarding and procedure awareness were observed; please prioritise improvement in risk management and procedural adherence.'
        },
        b1: {
          3: 'Connection and rapport: {{name}} brought a warm approach, trust and responsiveness; the participant appeared comfortable and supported.',
          2: 'Connection and rapport: rapport was evident in some moments but not sustained throughout; please strengthen warmth, trust and responsiveness more consistently.',
          1: 'Connection and rapport: limited warmth, trust and responsiveness were observed; please develop a more consistent relational approach so the participant feels comfortable and supported.'
        },
        b2: {
          3: 'Engagement: {{name}} promoted and sustained meaningful involvement, choices and active participation throughout the session.',
          2: 'Engagement: passive periods and delayed response to drops in engagement were observed; please reduce passive time and respond more quickly when engagement drops.',
          1: 'Engagement: limited opportunities for involvement and sustained participation were observed; please increase choices and active participation across the session.'
        },
        b3: {
          3: 'Resources and space: {{name}} used equipment, visuals and space effectively to maintain interest, structure and clarity.',
          2: 'Resources and space: use of equipment, visuals and spatial organisation was inconsistent; please apply resources more consistently to support engagement and clarity.',
          1: 'Resources and space: limited use of equipment, visuals and space was observed; please improve resource use to support engagement, structure and clarity.'
        },
        b4: {
          3: 'Session structure and flow: {{name}} delivered a clear beginning, progression and ending; the session felt organised and purposeful.',
          2: 'Session structure and flow: uneven pacing and unclear transitions were observed; please tighten planning, pacing and transitions between activities.',
          1: 'Session structure and flow: unclear opening, progression and closing were observed; please clarify session structure so delivery is more organised and purposeful.'
        },
        c1: {
          3: 'Regulation needs: {{name}} reliably identified signs of dysregulation, sensory needs, and emotional or behavioural changes.',
          2: 'Regulation needs: some cues were recognised, but speed and accuracy were inconsistent; please improve identification of regulation and sensory needs.',
          1: 'Regulation needs: key signs of dysregulation and sensory need were frequently missed; please strengthen observation of emotional and behavioural changes.'
        },
        c2: {
          3: 'Adaptive support: {{name}} adjusted approach, pacing, communication and expectations appropriately to the participant’s needs.',
          2: 'Adaptive support: adjustments were made in parts but were not sustained; please match approach, pacing, communication and expectations more consistently to individual needs.',
          1: 'Adaptive support: limited adaptation to individual needs was observed; please improve how approach, pacing, communication and expectations are matched.'
        },
        c3: {
          3: 'Regulation strategies: {{name}} used breaks, visuals, reassurance, structure and co-regulation effectively to support calm and focus.',
          2: 'Regulation strategies: strategies were used at times but inconsistently; please apply breaks, visuals, reassurance and structure more consistently.',
          1: 'Regulation strategies: limited strategy use was observed; please use regulation supports more consistently to improve participation and focus.'
        },
        c4: {
          3: 'Regulated presence: {{name}} remained calm, predictable and supportive; this helped the participant feel safe and regulated throughout.',
          2: 'Regulated presence: moments of reduced predictability and support were observed; please maintain a calmer and more consistently supportive presence.',
          1: 'Regulated presence: frequent inconsistency in calm, predictability and support was observed; please work toward a steadier regulated presence across the full session.'
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
      function otherCommentBullet(fieldId){
        const t = fieldVal(fieldId).trim();
        if(!t) return null;
        return capitalizeFirstLetterAfterColon('Other:\n' + t);
      }
      function bulletLineHtml(line, blockTitle){
        if(blockTitle === 'Professional level' || (line && line.indexOf('\n') !== -1)) return formatMultilineBulletLineHtml(line);
        return formatBulletLineHtml(line);
      }
      function personalizeFeedback(template, staffRaw){
        return capitalizeFirstLetterAfterColon(template.replace(/\{\{name\}\}/g, resolveStaffDisplayName(staffRaw)));
      }
      function getDressPositiveFeedbackByService(service){
        if(service === 'Aquatic Activity'){
          return capitalizeFirstLetterAfterColon('Dress and presentation: appearance is appropriate, attire appears clean, and swimwear is suitable for the activity and environment.');
        }
        return capitalizeFirstLetterAfterColon('Dress and presentation: appearance is appropriate, attire appears clean, and trousers and trainers are suitable for the activity and environment.');
      }
      function scoreToBand(score){
        if(score >= 2.8) return 'strong';
        if(score >= 2.4) return 'secure';
        if(score >= 1.8) return 'developing';
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
      function sectionToPlain(s){
        if(s.type === 'criteria'){
          return s.items.map(it => it.title + '\nCriterion: ' + it.desc + '\nSelected rating: ' + it.rating).join('\n\n');
        }
        if(s.type === 'bullets') return s.lines.map(l => '• ' + l).join('\n');
        return s.body || '';
      }
      function buildNarrativeBody(narrative){
        return [
          narrative.overallPara,
          narrative.secA,
          narrative.secB,
          narrative.secC,
          narrative.strengths ? ('Strengths observed during the session: ' + narrative.strengths) : 'Strengths observed during the session: no strong-practice indicators were recorded (Yes / 3).',
          narrative.development ? ('Areas for development identified: ' + narrative.development) : 'Areas for development identified: no development priorities were recorded (No / 1 / 2).',
          'This narrative connected the scores, section feedback, strengths and development into readable prose. Copy it into your AI tool to polish tone, add transitions, and produce a final observation report that reads naturally.'
        ].join('\n\n');
      }
      function buildScreenReportSections(staff, scores, autoLists){
        const sections = [];
        sections.push({
          type: 'paragraph',
          title: 'Observation details',
          body: [
            'Session date: ' + (fieldVal('sessionDate') || '—'),
            'Session time: ' + (fieldVal('sessionTime') || '—'),
            'Observer: ' + (fieldVal('observer') || '—'),
            'Location: ' + (fieldVal('location') || '—'),
            'Staff observed: ' + (fieldVal('staffObserved') || '—'),
            'Client / group: ' + (fieldVal('clientName') || '—'),
            'Service: ' + (fieldVal('service') || '—')
          ].join('\n')
        });
        sections.push({
          type: 'bullets',
          title: 'Strengths observed',
          lines: (() => {
            const lines = autoLists.strengths.length ? autoLists.strengths.slice() : ['No strong-practice indicators were recorded (Yes / 3).'];
            const o = otherCommentBullet('strengthsOther');
            if(o) lines.push(o);
            return lines;
          })()
        });
        sections.push({
          type: 'bullets',
          title: 'Areas for development',
          lines: (() => {
            const lines = autoLists.development.length ? autoLists.development.slice() : ['No development priorities were recorded (No / 1 / 2).'];
            const o = otherCommentBullet('developmentOther');
            if(o) lines.push(o);
            return lines;
          })()
        });
        sections.push({
          type: 'bullets',
          title: 'Professional level',
          lines: scores.allComplete ? [
            'Professional level was assessed as:\n' + scores.outcome + ' (' + scores.outcomeDescription + ')'
          ] : [
            'Professional level was not finalised (some ratings were still incomplete).\nDescriptor will appear once all 12 ratings are completed.'
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
              if(s.title === 'Observation details'){
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
          if(questionType[id] === 'yesno'){
            if(raw === 'yes' && fb.yes){
              if(id === 'a2'){
                strengths.push(getDressPositiveFeedbackByService(fieldVal('service')));
              }else{
                strengths.push(personalizeFeedback(fb.yes, staffRaw));
              }
            }
            if(raw === 'no' && fb.no) development.push(personalizeFeedback(fb.no, staffRaw));
          }else{
            const n = Number(raw);
            if(n === 3 && fb[3]) strengths.push(personalizeFeedback(fb[3], staffRaw));
            if(n === 2 && fb[2]) development.push(personalizeFeedback(fb[2], staffRaw));
            if(n === 1 && fb[1]) development.push(personalizeFeedback(fb[1], staffRaw));
          }
        });
        return { strengths, development };
      }
      function renderAutoFeedbackPanels(){
        const { strengths, development } = getAutoStrengthsAndDevelopmentLists(fieldVal('staffObserved'));
        const stList = document.getElementById('strengthsList');
        const stEmpty = document.getElementById('strengthsEmpty');
        const devList = document.getElementById('developmentList');
        const devEmpty = document.getElementById('developmentEmpty');
        const strengthLines = strengths.slice();
        const devLines = development.slice();
        const sO = otherCommentBullet('strengthsOther');
        const dO = otherCommentBullet('developmentOther');
        if(sO) strengthLines.push(sO);
        if(dO) devLines.push(dO);
        stList.innerHTML = strengthLines.map(l => '<li>' + bulletLineHtml(l, '') + '</li>').join('');
        devList.innerHTML = devLines.map(l => '<li>' + bulletLineHtml(l, '') + '</li>').join('');
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
        if(questionType[name] === 'yesno'){
          if(name === 'a1') return raw === 'yes'
            ? `${personName} arrived on time and was ready to start without delays`
            : `${personName} did not consistently arrive on time or start fully prepared`;
          if(name === 'a2') return raw === 'yes'
            ? `${personName} presented appropriately for the activity and setting`
            : `${personName} did not yet present consistently in line with activity expectations`;
        }
        const n = Number(raw);
        const text = scaleNarratives[name] && scaleNarratives[name][n];
        if(!text) return null;
        return `${personName} ${text} (${n}/3)`;
      }
      function buildSectionNarrative(key, sectionScore, personName){
        const items = sectionQuestions[key].map(q => buildItemNarrative(q, personName)).filter(Boolean);
        const ratedCount = sectionQuestions[key].filter(q => getRaw(q) !== null).length;
        const coverage = ratedCount === sectionQuestions[key].length ? 'complete' : 'partial';
        const band = scoreToBand(sectionScore);
        return `${sectionNames[key]} was ${coverage} with a ${band} profile at ${sectionScore.toFixed(1)}/3. ${items.join('. ')}.`;
      }
      function getScore(name){
        const raw = getRaw(name);
        if(raw === null) return null;
        return questionType[name] === 'yesno' ? (raw === 'yes' ? 3 : 0) : Number(raw);
      }
      function averageSection(key){
        const vals = sectionQuestions[key].map(getScore).filter(v => v !== null);
        if(!vals.length) return 0;
        return vals.reduce((a,b)=>a+b,0) / vals.length;
      }
      function isSectionComplete(key){
        return sectionQuestions[key].every(q => getScore(q) !== null);
      }
      function isDetailsComplete(){
        return ['sessionDate','sessionTime','observer','staffObserved','service']
          .every(id => (document.getElementById(id).value || '').trim() !== '');
      }
      function isFinalComplete(){
        return isSectionComplete('a') && isSectionComplete('b') && isSectionComplete('c');
      }
      function getOutcome(scoreOutOf12){
        if(scoreOutOf12 >= 9) return { label:'Strong', description:'Practice is consistently strong and purposeful.' };
        if(scoreOutOf12 >= 4) return { label:'Inconsistent', description:'Some elements are in place but not reliably sustained.' };
        if(scoreOutOf12 >= 1) return { label:'Limited', description:'Practice is limited and needs significant improvement.' };
        return { label:'Awaiting ratings', description:'Complete all 12 ratings to calculate professional level.' };
      }
      function calculateScores(){
        const a = averageSection('a');
        const b = averageSection('b');
        const c = averageSection('c');
        const allComplete = isSectionComplete('a') && isSectionComplete('b') && isSectionComplete('c');
        const allIds = [].concat(sectionQuestions.a, sectionQuestions.b, sectionQuestions.c);
        const rawTotal = allIds.map(getScore).filter(v => v !== null).reduce((sum, v) => sum + v, 0);
        const totalOutOf12 = allComplete ? (rawTotal / 3) : 0;
        const level = getOutcome(totalOutOf12);
        return { a, b, c, totalOutOf12, outcome:level.label, outcomeDescription:level.description, allComplete };
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
        const staffRaw = document.getElementById('staffObserved').value.trim();
        const staff = staffRaw || 'Staff member name not provided';
        const autoLists = getAutoStrengthsAndDevelopmentLists(staffRaw);
        const strengthLinesNarr = autoLists.strengths.slice();
        const devLinesNarr = autoLists.development.slice();
        const sOn = otherCommentBullet('strengthsOther');
        const dOn = otherCommentBullet('developmentOther');
        if(sOn) strengthLinesNarr.push(sOn);
        if(dOn) devLinesNarr.push(dOn);
        const strengths = listToParagraph(strengthLinesNarr);
        const development = listToParagraph(devLinesNarr);
        const hasOtherOnly = fieldVal('strengthsOther').trim() !== '' || fieldVal('developmentOther').trim() !== '';
        if(!isDetailsComplete() && !scores.allComplete && !autoLists.strengths.length && !autoLists.development.length && !hasOtherOnly){
          summaryOutput.classList.remove('summary-rich');
          summaryOutput.innerHTML = '<p class="summary-placeholder">Complete the form to preview session details, personalised strengths and development, scores and professional level. The PDF will mirror this summary with corporate branding.</p>';
          lastScreenSections = [];
          lastPdfSections = [];
          return;
        }
        const secA = buildSectionNarrative('a', scores.a, staff);
        const secB = buildSectionNarrative('b', scores.b, staff);
        const secC = buildSectionNarrative('c', scores.c, staff);
        const overallPara = scores.allComplete
          ? `${staff} was observed during the session. Professional level was assessed as ${scores.outcome}. ${scores.outcomeDescription}`
          : `${staff} was observed during the session. Professional level was not finalised because some section ratings were still incomplete.`;
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
        let y = 14;
        const sections = lastScreenSections.length ? lastScreenSections : [];
        const brandBlue = [45, 132, 179];
        const brandBlueSoft = [234, 244, 247];
        const brandText = [11, 18, 32];

        function ensureSpace(heightNeeded){
          if(y + heightNeeded <= pageH - 12) return;
          doc.addPage();
          y = 14;
        }

        function drawSectionTitle(title){
          ensureSpace(14);
          doc.setFillColor(brandBlueSoft[0], brandBlueSoft[1], brandBlueSoft[2]);
          doc.setDrawColor(brandBlue[0], brandBlue[1], brandBlue[2]);
          doc.roundedRect(margin, y, maxW, 10, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(brandBlue[0], brandBlue[1], brandBlue[2]);
          doc.text(title, margin + 4, y + 6.2);
          y += 14.5;
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

        function drawTailIndented(tail, indentX){
          if(!tail) return;
          doc.setFont('helvetica', 'normal');
          const tw = doc.splitTextToSize(tail, maxW - (indentX - margin));
          ensureSpace(tw.length * 4.5 + 1.2);
          tw.forEach(line => {
            doc.text(line, indentX, y);
            y += 4.5;
          });
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
            const firstBlockLines = 1 + (inlineRest ? doc.splitTextToSize(inlineRest, maxW - 16).length : 0);
            const tailLines = tail ? doc.splitTextToSize(tail, maxW - 16).length : 0;
            ensureSpace((firstBlockLines + tailLines) * 4.5 + 1.6);
            doc.setFont('helvetica', 'bold');
            doc.text('• ' + prefix, margin + 5, y);
            doc.setFont('helvetica', 'normal');
            y += 4.5;
            if(inlineRest){
              const iw = doc.splitTextToSize(inlineRest, maxW - 16);
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
          const restWrapped = rest ? doc.splitTextToSize(rest, maxW - 16) : [];
          ensureSpace((1 + restWrapped.length) * 4.5 + 1.6);

          doc.setFont('helvetica', 'bold');
          doc.text('• ' + prefix, margin + 5, y);
          doc.setFont('helvetica', 'normal');
          y += 4.5;
          for(let i = 0; i < restWrapped.length; i++){
            doc.text(restWrapped[i], margin + 9, y);
            y += 4.5;
          }
        }

        function drawBodyLines(lines, useBullets){
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          lines.forEach(line => {
            if(useBullets){
              drawBulletWithBoldPrefix(line);
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

        // Corporate header: blue band + logo only (scaled to fill band, aspect preserved)
        const headerH = 42;
        const headerPad = 5;
        doc.setFillColor(brandBlue[0], brandBlue[1], brandBlue[2]);
        doc.rect(0, 0, pageW, headerH, 'F');
        if(logoDataUrl){
          try{
            const fmt = logoDataUrl.includes('jpeg') ? 'JPEG' : 'PNG';
            const props = doc.getImageProperties(logoDataUrl);
            const iw = props.width || 1;
            const ih = props.height || 1;
            const logoBoxW = pageW - headerPad * 2;
            const logoBoxH = headerH - headerPad * 2;
            const scale = Math.min(logoBoxW / iw, logoBoxH / ih);
            const logoW = iw * scale;
            const logoH = ih * scale;
            const logoX = (pageW - logoW) / 2;
            const logoY = (headerH - logoH) / 2;
            doc.addImage(logoDataUrl, fmt, logoX, logoY, logoW, logoH);
          }catch(e){}
        }
        y = headerH + 8;

        if(!sections.length){
          doc.setTextColor(brandText[0], brandText[1], brandText[2]);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(10);
          doc.text('Complete the form to generate the summary PDF.', margin, y);
        }
        sections.forEach(s => {
          drawSectionTitle(s.title);
          if(s.type === 'bullets'){
            drawBodyLines(s.lines || [], true);
          }else{
            const lines = (s.body || '').split('\n').map(t => t.trim()).filter(Boolean);
            if(s.title === 'Observation details'){
              lines.forEach(drawDetailLine);
              y += 1.2;
            }else{
              drawBodyLines(lines, false);
            }
          }
        });
        const staff = (document.getElementById('staffObserved').value || 'Observation').replace(/[^a-zA-Z0-9\s\-]/g,'').replace(/\s+/g,'-').slice(0,40);
        const date = document.getElementById('sessionDate').value || '';
        return { doc, filename:'Observation-Summary-' + staff + (date ? '-' + date : '') + '.pdf' };
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
      async function persistStaffObservationIfAuthed(pdfFilename){
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
          if(role !== 'staff' && role !== 'lead' && role !== 'admin' && role !== 'ceo') return;
          const displayName = String(profileRow.full_name || profileRow.username || '').replace(/\s+/g,' ').trim();
          if(!displayName) return;
          const sessionDate = (document.getElementById('sessionDate') && document.getElementById('sessionDate').value || '').trim();
          if(!sessionDate) return;
          const responses = snapshotResponsesFromForm(form);
          const summaryText = summaryOutput ? String(summaryOutput.innerText || '').trim().slice(0, 12000) : '';
          const payload = {
            submitted_by_user_id: uid,
            submitted_by_name: displayName,
            session_date: sessionDate,
            session_time: (document.getElementById('sessionTime') && document.getElementById('sessionTime').value || '').trim(),
            observer_label: (document.getElementById('observer') && document.getElementById('observer').value || '').trim(),
            location: (document.getElementById('location') && document.getElementById('location').value || '').trim(),
            staff_observed: (document.getElementById('staffObserved') && document.getElementById('staffObserved').value || '').replace(/\s+/g,' ').trim(),
            client_name: (document.getElementById('clientName') && document.getElementById('clientName').value || '').replace(/\s+/g,' ').trim(),
            service: (document.getElementById('service') && document.getElementById('service').value || '').trim(),
            pdf_filename: pdfFilename ? String(pdfFilename).slice(0, 240) : null,
            responses: Object.assign({}, responses, { summary_text: summaryText })
          };
          const ins = await supabase.from('staff_observation_reports').insert([payload]);
          if(ins.error) console.warn('staff_observation_reports insert', ins.error);
        }catch(_e){}
      }
      form.addEventListener('input', () => { calculateScores(); updateProgress(); renderAutoFeedbackPanels(); generateSummary(); });
      form.addEventListener('change', () => { calculateScores(); updateProgress(); renderAutoFeedbackPanels(); generateSummary(); });
      document.getElementById('btnSummaryPdf').addEventListener('click', function(){
        const btn = this; btn.disabled = true; generateSummary();
        loadLogoAsDataUrl().then(logoDataUrl => {
          const built = buildPdf(logoDataUrl);
          if(!built) alert('PDF library not loaded. Please refresh the page and try again.');
          else {
            built.doc.save(built.filename);
            void persistStaffObservationIfAuthed(built.filename);
            try{
              if(typeof portalRedirectToPortalReturn === 'function') portalRedirectToPortalReturn();
            }catch(_e){}
          }
          btn.disabled = false;
        });
      });
      renderAutoFeedbackPanels();
      calculateScores(); updateProgress(); generateSummary();
    })();
