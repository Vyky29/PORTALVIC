  (function(){
    'use strict';

    var NAV = [
      { id:'dashboard', label:'Dashboard', ico:'▣' },
      { id:'operations', label:'Operations', ico:'▤' },
      { id:'clients', label:'Client activity', ico:'◎' },
      { id:'staffhr', label:'Staff & HR', ico:'◉' },
      { id:'onboarding', label:'Onboarding', ico:'▸' },
      { id:'reports', label:'Reports & incidents', ico:'≡' },
      { id:'communications', label:'Communications', ico:'✉' },
      { id:'operator', label:'Operator', ico:'◆' },
      { id:'ceo', label:'CEO view', ico:'◈' },
      { id:'settings', label:'Settings', ico:'⚙' }
    ];

    var MOCK = {
      profile:{ name:'Alex Morgan', initial:'A', role:'Operations & HR' },
      kpi:{
        sessionsToday:52, activeStaff:24, incidentsOpen:2, cancellationsOpen:4,
        reportsPending:11, onboardingPending:5, referralsActive:7
      },
      alerts:[
        { id:'a1', t:'urgent', title:'Safeguarding review', sub:'INC-2404-02 · Mariam A. · due today' },
        { id:'a2', t:'shift', title:'Shift gap Thursday PM', sub:'Climb Hub · qualified lead needed' },
        { id:'a3', t:'report', title:'Term reviews in draft', sub:'4 families waiting on send' }
      ],
      venuesSessions:[
        { venue:'Acton Pool', n:21 }, { venue:'Ealing Pool', n:14 }, { venue:'Climb Hub', n:12 }, { venue:'Outreach / schools', n:8 }
      ],
      staffDist:[
        { role:'SEN support', n:11 }, { role:'Pool lead', n:6 }, { role:'Assistant', n:7 }, { role:'Lead practitioner', n:3 }
      ],
      urgentIssues:[
        { t:'EHCP addendum filed · Mariam A. — LA response due Fri', pri:'high' },
        { t:'Medication plan v3 · signed by GP pending upload', pri:'high' },
        { t:'Climb auto-belay annual service · certificate on wall', pri:'med' }
      ],
      shiftGaps:[
        { when:'Thu 17 Apr · 16:00–18:30', site:'Climb Hub', note:'L3 qualified lead + safeguarding current' },
        { when:'Sat 19 Apr · 09:00–12:00', site:'Acton Pool', note:'Cover: Samira K. requested swap' }
      ],
      sessionChanges:[
        { t:'Joel R. · Tue slot moved +30m', by:'Bookings', st:'pending notify' },
        { t:'Group swim L2 · cap 8→9', by:'Lead', st:'confirmed' },
        { t:'Eddie L. · 1:1 swim → paired intro', by:'Admin', st:'draft' },
        { t:'Outreach St Mary\'s · bus arrives 10:15 (was 10:00)', by:'Schools liaison', st:'confirmed' }
      ],
      sessionEconomics:{ billableSessionCount:312, unitSessionPrice:44 },
      venue:{ periodVenueCost:5150 },
      timesheets:[
        { name:'Pool / climb leads', hours:42, roleKey:'lead' },
        { name:'SEN support (all sites)', hours:58, roleKey:'support' },
        { name:'Assistants & casuals', hours:48, roleKey:'assistant' }
      ],
      roleRates:{ lead:23.5, support:19.25, assistant:14.5 },
      staff:[
        { id:'s1', name:'Yusef M.', role:'Pool lead', site:'Acton', st:'active', availability:'Mon–Thu PM · Acton priority', notes:'DSL deputy · first aid 2027', training:'Safeguarding L3 ✓' },
        { id:'s2', name:'Laura K.', role:'Lead practitioner', site:'All', st:'active', availability:'Tue–Fri · cross-site', notes:'Supervises Jordan + Aisha onboarding', training:'PECs workshop Apr 22' },
        { id:'s3', name:'Chris P.', role:'SEN support', site:'Ealing', st:'leave', availability:'Back 22 Apr · phased return', notes:'RTW OH clearance booked 21 Apr', training:'—' },
        { id:'s4', name:'Samira K.', role:'SEN support', site:'Acton', st:'active', availability:'Mon / Wed / Sat', notes:'Requested Sat swap (see shift gap)', training:'Makaton refresher due Jun' },
        { id:'s5', name:'Priya D.', role:'Pool lead', site:'Ealing', st:'active', availability:'Wed–Sat', notes:'New parent intro slots', training:'All current' },
        { id:'s6', name:'Tom W.', role:'Climb lead', site:'Climb Hub', st:'active', availability:'Tue–Fri PM', notes:'Rope rescue drill log up to date', training:'Technical rescue ✓' },
        { id:'s7', name:'Nina O.', role:'Assistant', site:'Acton', st:'active', availability:'Mon–Wed AM', notes:'Duke of Edinburgh volunteer hours', training:'Level 2 swim teaching (in progress)' },
        { id:'s8', name:'Ellis R.', role:'Outreach coach', site:'Schools', st:'active', availability:'Tue–Thu school hours', notes:'St Mary\'s + Oakwood contracts', training:'Team Teach refresh booked' }
      ],
      hrNotesInternal:'Chris P. — phased return 22 Apr; keep pool depth restriction first week.\nLaura K. — sign off Jordan P. starter checklist before 5 May.\nSafeguarding: one open admin action on INC-2404-02 (changing room note).',
      clientsById:{
        c1:{
          id:'c1', name:'Mariam A.', sub:'Swim · Acton · EHCP · Guardian: Mrs A.',
          sessionsAttended:31, attendancePct:88, cancellations:2, incidents:0,
          emotional:[3,4,4,5,4,5,5,5], engagement:[4,4,5,5,4,5,5,5],
          positives:['Joined group warm-up without prompting','Named two coping strategies','Led partner activity ~5 min'],
          notes:['Prefers morning slots','Headphones help in hall','LA requested term report by 25 Apr'],
          pattern:'Steady participation; strong rapport with Yusef M.',
          attendanceTerm:{ booked:32, attended:28, late:2, cancelled:2 },
          recentSessions:[
            { when:'12 Apr', programme:'1:1 swim', attended:'Yes', note:'Full participation · deep end with float' },
            { when:'9 Apr', programme:'1:1 swim', attended:'Late', note:'Traffic — 8m late, full session' },
            { when:'5 Apr', programme:'1:1 swim', attended:'Yes', note:'Group warm-up joined' },
            { when:'2 Apr', programme:'1:1 swim', attended:'Yes', note:'Breathing ladder completed' },
            { when:'29 Mar', programme:'1:1 swim', attended:'Cancelled', note:'Family holiday — 5d notice' }
          ],
          activitiesWorked:['Breathing ladder','Wall kicks','Floating progression','Exit routine','Pool rules recap'],
          lastEngagementLabel:'Full participation — tried back float unassisted (2 attempts)',
          lastEmotionalLabel:'Calm / proud of progress',
          incidentHistory:[],
          recommendedNext:'Send term summary draft to family before LA deadline.'
        },
        c2:{
          id:'c2', name:'Joel R.', sub:'Climb · Ealing · Y6 transition plan',
          sessionsAttended:21, attendancePct:74, cancellations:5, incidents:1,
          emotional:[4,3,3,4,3,4,4,3], engagement:[3,3,4,4,3,4,4,4],
          positives:['Returned after one difficult week','Asked for break before overload','Self-advocated for quieter bay'],
          notes:['Short sessions best post-school','Secondary taster day 24 Apr — may miss session'],
          pattern:'Variable energy post-school; Tom W. as lead works well.',
          attendanceTerm:{ booked:28, attended:21, late:3, cancelled:4 },
          recentSessions:[
            { when:'11 Apr', programme:'1:1 climb', attended:'Yes', note:'Footwork drills · good focus' },
            { when:'8 Apr', programme:'1:1 climb', attended:'Late', note:'Arrived 12m late' },
            { when:'4 Apr', programme:'1:1 climb', attended:'Yes', note:'Used break card twice — completed' },
            { when:'1 Apr', programme:'1:1 climb', attended:'Cancelled', note:'Illness — &gt;24h notice' }
          ],
          activitiesWorked:['Auto-belay intro','Footwork drills','Down-climb practice','Top-rope tie-in'],
          lastEngagementLabel:'Strong session — completed full circuit',
          lastEmotionalLabel:'Tired but regulated (used break card)',
          incidentHistory:[{ when:'12 Mar', summary:'Minor graze · pool edge (pre-climb warm-up) · first aid · closed same day' }],
          recommendedNext:'Confirm Tue 22 Apr slot after taster day; notify Tom if no-show risk.'
        },
        c3:{
          id:'c3', name:'Eddie L.', sub:'Swim · Acton · paired intro pathway',
          sessionsAttended:8, attendancePct:71, cancellations:3, incidents:0,
          emotional:[3,3,4,4,3,4], engagement:[2,3,3,4,4,4],
          positives:['First time using locker independently','Tolerated group whistle'],
          notes:['Parent prefers WhatsApp for changes'],
          pattern:'Building tolerance for busier pool; paired slot trial from May.',
          attendanceTerm:{ booked:11, attended:8, late:0, cancelled:3 },
          recentSessions:[
            { when:'10 Apr', programme:'1:1 swim', attended:'Yes', note:'Shallow end only · great exit routine' },
            { when:'3 Apr', programme:'1:1 swim', attended:'No-show', note:'No message — follow up sent' },
            { when:'27 Mar', programme:'1:1 swim', attended:'Yes', note:'Joined sibling for last 10m' }
          ],
          activitiesWorked:['Blowing bubbles','Supported float','Walking width'],
          lastEngagementLabel:'Cautious start — finished last 15m strongly',
          lastEmotionalLabel:'Anxious first 20m → settled',
          incidentHistory:[],
          recommendedNext:'Book paired intro with Mariam cohort (same slot family agreed).'
        },
        c4:{
          id:'c4', name:'Ava T.', sub:'Climb · mixed · parent-funded',
          sessionsAttended:16, attendancePct:94, cancellations:0, incidents:0,
          emotional:[4,5,4,5,5,4,5], engagement:[5,5,4,5,5,5,5],
          positives:['Volunteered to demo knot check','Peer encouragement in group warm-up'],
          notes:['Interested in holiday climbing camp July'],
          pattern:'High attendance; ready for L3 skills block.',
          attendanceTerm:{ booked:17, attended:16, late:1, cancelled:0 },
          recentSessions:[
            { when:'12 Apr', programme:'Group L2', attended:'Yes', note:'Lead belay observation' },
            { when:'5 Apr', programme:'Group L2', attended:'Yes', note:'—' },
            { when:'29 Mar', programme:'1:1 climb', attended:'Yes', note:'Overhang intro — chose to stop (good judgement)' }
          ],
          activitiesWorked:['Figure-8 knot','Belay partner checks','Traverse endurance'],
          lastEngagementLabel:'High — supporting newer climber in pair drill',
          lastEmotionalLabel:'Confident / social',
          incidentHistory:[],
          recommendedNext:'Offer July camp place; add to term re-enrolment list.'
        },
        c5:{
          id:'c5', name:'Sam K.', sub:'Swim · Outreach · transport from school',
          sessionsAttended:14, attendancePct:85, cancellations:1, incidents:0,
          emotional:[4,4,4,4,5,4,4,4], engagement:[4,5,4,4,4,5,5,5],
          positives:['Consistent pool confidence','Helps newer swimmer with floats'],
          notes:['Parent requested call re next term fees / sibling discount'],
          pattern:'Stable; strong relationship with Ellis on outreach days.',
          attendanceTerm:{ booked:16, attended:14, late:1, cancelled:1 },
          recentSessions:[
            { when:'11 Apr', programme:'1:1 swim', attended:'Yes', note:'Confident in deep end · 25m width' },
            { when:'4 Apr', programme:'1:1 swim', attended:'Yes', note:'—' },
            { when:'28 Mar', programme:'Outreach block', attended:'Late', note:'Bus late 18m — shortened session' }
          ],
          activitiesWorked:['Kicking with board','Treading water intro','Pool rules recap','Rescue position demo (theory)'],
          lastEngagementLabel:'High participation',
          lastEmotionalLabel:'Steady',
          incidentHistory:[{ when:'Feb', summary:'Equipment near-miss · climbing taster · logged · no injury' }],
          recommendedNext:'Return parent call — sibling discount + summer block options.'
        },
        c6:{
          id:'c6', name:'Riley B.', sub:'Multi-site trial · OT referral',
          sessionsAttended:5, attendancePct:60, cancellations:2, incidents:0,
          emotional:[3,3,2,4,3], engagement:[2,3,3,3,4],
          positives:['Chose swimming over climb this week (self-advocacy)'],
          notes:['Trial ends 30 Apr — decision meeting 28 Apr'],
          pattern:'Early trial; attendance sensitive to transport; good notes from both leads.',
          attendanceTerm:{ booked:8, attended:5, late:1, cancelled:2 },
          recentSessions:[
            { when:'9 Apr', programme:'1:1 swim', attended:'Yes', note:'Sensory break every 12m — worked well' },
            { when:'2 Apr', programme:'1:1 climb', attended:'Cancelled', note:'Family transport' },
            { when:'26 Mar', programme:'1:1 climb', attended:'Yes', note:'Low height preference respected' }
          ],
          activitiesWorked:['Pool acclimatisation','Low wall traverses','Visual schedule on poolside'],
          lastEngagementLabel:'Good regulation with timed breaks',
          lastEmotionalLabel:'Variable — ended positive',
          incidentHistory:[],
          recommendedNext:'Prep trial summary for 28 Apr MDT — include both venues.'
        }
      },
      reportQueue:[
        { type:'Session feedback', pending:7 }, { type:'Service leader feedback', pending:2 },
        { type:'Observations', pending:2 }, { type:'Term reviews', pending:5 }
      ],
      reportItems:[
        { id:'rp1', type:'Term review', clientName:'Mariam A.', clientId:'c1', due:'18 Apr', status:'draft', owner:'Laura K.', lastEdit:'12 Apr' },
        { id:'rp2', type:'Parent summary', clientName:'Joel R.', clientId:'c2', due:'20 Apr', status:'in_review', owner:'Tom W.', lastEdit:'11 Apr' },
        { id:'rp3', type:'Session feedback', clientName:'Eddie L.', clientId:'c3', due:'15 Apr', status:'pending_staff', owner:'Yusef M.', lastEdit:'—' },
        { id:'rp4', type:'Observation', clientName:'Ava T.', clientId:'c4', due:'22 Apr', status:'draft', owner:'Tom W.', lastEdit:'10 Apr' },
        { id:'rp5', type:'Term review', clientName:'Sam K.', clientId:'c5', due:'25 Apr', status:'draft', owner:'Ellis R.', lastEdit:'9 Apr' },
        { id:'rp6', type:'Trial summary', clientName:'Riley B.', clientId:'c6', due:'28 Apr', status:'draft', owner:'Laura K.', lastEdit:'—' },
        { id:'rp7', type:'EHCP contribution', clientName:'Mariam A.', clientId:'c1', due:'24 Apr', status:'blocked', owner:'Laura K.', lastEdit:'Waiting LA template' }
      ],
      interviews:[
        { id:'i1', name:'Mo H.', role:'SEN support', status:'1st interview', ob:'N/A', rec:'Application sift' },
        { id:'i2', name:'Jordan P.', role:'Assistant', status:'Offer accepted', ob:'5 May start', rec:'DBS + refs chasing' },
        { id:'i3', name:'Lee T.', role:'Climb lead', status:'2nd interview', ob:'N/A', rec:'Practical assessment Thu' }
      ],
      onboardingSteps:[
        { label:'Org average · starter checklist', pct:88 }, { label:'Health questionnaire', pct:76 },
        { label:'References', pct:62 }, { label:'DBS', pct:45 }, { label:'Right to work', pct:90 },
        { label:'Certificates', pct:58 }, { label:'Ready to start', pct:38 }
      ],
      onboardingPeople:[
        { id:'ob1', name:'Jordan P.', role:'Assistant · Acton', startDate:'5 May 2026', buddy:'Nina O.', steps:[
          { label:'Offer & contract', pct:100 }, { label:'RTW + ID', pct:100 }, { label:'DBS', pct:70 },
          { label:'References (2)', pct:50 }, { label:'Safeguarding L2', pct:0 }, { label:'Pool induction', pct:0 }
        ]},
        { id:'ob2', name:'Aisha N.', role:'SEN support · Ealing', startDate:'TBC Jun', buddy:'Priya D.', steps:[
          { label:'Offer pending', pct:60 }, { label:'RTW + ID', pct:0 }, { label:'DBS', pct:0 },
          { label:'References', pct:0 }, { label:'Makaton intro', pct:0 }, { label:'Site shadow shifts', pct:0 }
        ]},
        { id:'ob3', name:'Lee T.', role:'Climb lead', startDate:'If offer', buddy:'Tom W.', steps:[
          { label:'Interview loop', pct:85 }, { label:'Practical', pct:0 }, { label:'DBS update', pct:40 },
          { label:'Technical rescue cert', pct:100 }, { label:'Induction', pct:0 }
        ]}
      ],
      announcements:[
        { id:'n1', title:'Half-term venue freeze', body:'No permanent slot moves after Thu 18:00 until 28 Apr. Emergency swaps via ops only.', when:'12 Apr' },
        { id:'n2', title:'Safeguarding refresher', body:'All leads + pool leads complete online module by 30 Apr. Certificate upload to HR drive.', when:'10 Apr' },
        { id:'n3', title:'Summer block bookings', body:'Priority window for current families: 21–25 Apr. Public opens 28 Apr.', when:'8 Apr' }
      ],
      internalFeed:[
        { type:'reminder', audience:'leads', pri:'normal', body:'Weekly roster check: confirm Thu PM Climb Hub cover before Wed 12:00.', exp:'', at:new Date(Date.now()-90000000).toISOString(), source:'Ops playbook' },
        { type:'session change', audience:'specific roles', pri:'high', body:'St Mary\'s outreach bus 10:15 arrival — Ellis to brief pool team.', exp:'', at:new Date(Date.now()-180000000).toISOString(), source:'Schools liaison' },
        { type:'admin note', audience:'all staff', pri:'normal', body:'Photo consent renewal on wall by reception — please read before sessions.', exp:'', at:new Date(Date.now()-260000000).toISOString(), source:'HR' }
      ],
      shiftsDemo:[
        { id:'sh1', staffId:'s1', staff:'Yusef M.', when:'Mon 14 Apr · 16:00–20:00', venue:'Acton Pool', st:'confirmed' },
        { id:'sh2', staffId:'s3', staff:'Chris P.', when:'Tue 15 Apr · 09:00–13:00', venue:'Ealing Pool', st:'draft' },
        { id:'sh3', staffId:'s6', staff:'Tom W.', when:'Tue 15 Apr · 16:00–20:00', venue:'Climb Hub', st:'confirmed' },
        { id:'sh4', staffId:'s4', staff:'Samira K.', when:'Wed 16 Apr · 09:00–14:00', venue:'Acton Pool', st:'confirmed' },
        { id:'sh5', staffId:'s2', staff:'Laura K.', when:'Wed 16 Apr · 10:00–12:00', venue:'Climb Hub', st:'confirmed' },
        { id:'sh6', staffId:'s8', staff:'Ellis R.', when:'Wed 16 Apr · 09:30–15:00', venue:'Outreach', st:'confirmed' },
        { id:'sh7', staffId:'s5', staff:'Priya D.', when:'Thu 17 Apr · 12:00–18:00', venue:'Ealing Pool', st:'confirmed' },
        { id:'sh8', staffId:'s1', staff:'Yusef M.', when:'Thu 17 Apr · 16:00–20:00', venue:'Acton Pool', st:'draft' }
      ],
      operationalSessions:[
        { id:'ss1', when:'Mon 14 Apr · 16:30–17:00', venue:'Acton Pool', staffId:'s1', staff:'Yusef M.', clientId:'c1', client:'Mariam A.', programme:'1:1 swim', status:'Scheduled' },
        { id:'ss2', when:'Tue 15 Apr · 17:00–18:00', venue:'Climb Hub', staffId:'s6', staff:'Tom W.', clientId:'c2', client:'Joel R.', programme:'1:1 climb', status:'Scheduled' },
        { id:'ss3', when:'Wed 16 Apr · 10:00–11:30', venue:'Climb Hub', staffId:'s2', staff:'Laura K.', clientId:null, client:'Group L2 (8)', programme:'Group climb', status:'Scheduled' },
        { id:'ss4', when:'Wed 16 Apr · 15:00–15:45', venue:'Ealing Pool', staffId:'s4', staff:'Samira K.', clientId:'c5', client:'Sam K.', programme:'1:1 swim', status:'Scheduled' },
        { id:'ss5', when:'Thu 17 Apr · 16:00–20:00', venue:'Acton Pool', staffId:'s1', staff:'Yusef M.', clientId:null, client:'Blocks / drop-in', programme:'Mixed', status:'Draft' },
        { id:'ss6', when:'Thu 17 Apr · 16:00–18:30', venue:'Climb Hub', staffId:'s6', staff:'Tom W.', clientId:'c4', client:'Ava T.', programme:'Group L2', status:'Scheduled' },
        { id:'ss7', when:'Fri 18 Apr · 11:00–11:45', venue:'Acton Pool', staffId:'s5', staff:'Priya D.', clientId:'c3', client:'Eddie L.', programme:'1:1 swim', status:'Scheduled' }
      ],
      operatorSuggestions:[],
      cancellationsQueue:[
        { id:'can1', clientName:'Joel R.', clientId:'c2', slot:'Tue 15 Apr 17:00 climb', reason:'Gastro — family messaged 08:00', notice:'9h', creditPolicy:'Standard late cancel fee unless GP note' },
        { id:'can2', clientName:'Eddie L.', clientId:'c3', slot:'Wed 16 Apr 10:00 swim', reason:'Sibling hospital appt', notice:'48h', creditPolicy:'Credit session — documented' },
        { id:'can3', clientName:'Riley B.', clientId:'c6', slot:'Thu 17 Apr 14:00 swim trial', reason:'MDT moved', notice:'72h', creditPolicy:'Reschedule priority' },
        { id:'can4', clientName:'Sam K.', clientId:'c5', slot:'Sat 19 Apr outreach', reason:'Family event', notice:'5d', creditPolicy:'Term make-up slot offered' }
      ],
      commsHistory:[
        { at:'2026-04-12 09:00', type:'Announcement', summary:'Half-term venue freeze published' },
        { at:'2026-04-11 14:20', type:'Shift change', summary:'Joel R. Tue climb slot +30m (family request)' },
        { at:'2026-04-11 09:05', type:'Staff notification', summary:'Safeguarding refresher — leads reminder' },
        { at:'2026-04-10 16:40', type:'Session change', summary:'Group swim L2 cap 8→9' },
        { at:'2026-04-10 11:00', type:'Admin note', summary:'Photo consent renewal posted' },
        { at:'2026-04-09 15:22', type:'Referral', summary:'Riley B. OT report received — filed to client record' }
      ],
      openIncidents:[
        { id:'inc1', ref:'INC-2404-01', title:'Minor injury · pool edge (warm-up)', clientId:'c2', clientName:'Joel R.', status:'Awaiting admin sign-off', opened:'10 Apr', lead:'Tom W.' },
        { id:'inc2', ref:'INC-2404-02', title:'Safeguarding note · changing room', clientId:'c1', clientName:'Mariam A.', status:'Lead reviewed · admin action', opened:'11 Apr', lead:'Yusef M.' },
        { id:'inc3', ref:'INC-2403-18', title:'Equipment near-miss · climbing', clientId:'c5', clientName:'Sam K.', status:'Closed · follow-up task', opened:'3 Mar', lead:'Tom W.' }
      ],
      ceo:{
        headline:'Spring term on track · outreach up 12% YoY',
        businessOverview:[
          { label:'Active clients (term)', value:'86', sub:'74 swim · 38 climb · 14 overlap' },
          { label:'Billable sessions (MTD)', value:'312', sub:'vs target 298' },
          { label:'Staff utilisation', value:'78%', sub:'leaves + gaps within tolerance' },
          { label:'Outstanding invoices', value:'£4.2k', sub:'3 families · &lt;30 days' }
        ],
        financialSummary:{ income:137280, payroll:52340, venue:5150, other:8900, marginPct:54, ytdSessions:312, ar:4200 },
        clientIntel:[
          { title:'Attendance concentration', detail:'6 clients below 75% this term — 4 have transport notes; 2 on trial pathway.' },
          { title:'Engagement highlights', detail:'Group L2 climb retention 96%; paired swim pilot (Eddie + cohort) starts May.' },
          { title:'Risk / welfare', detail:'2 open incidents; one awaiting admin sign-off. No open safeguarding escalations beyond standard workflow.' }
        ],
        operationalInsights:[
          { title:'Capacity', detail:'Thu PM Climb Hub is binding constraint — 3 waitlist names; consider float lead or split group.' },
          { title:'Compliance', detail:'Safeguarding module 87% complete across leads; chase 4 names before 30 Apr.' },
          { title:'Contracts', detail:'St Mary\'s outreach renewal draft with council — decision expected pre May half-term.' }
        ],
        referrals:[
          { id:'ref1', source:'Acton pediatric OT', client:'Riley B.', stage:'Active trial', value:'£1.8k term est.', since:'Mar 2026' },
          { id:'ref2', source:'Ealing SENDIAS', client:'Eddie L.', stage:'Enrolled', value:'Ongoing', since:'Jan 2026' },
          { id:'ref3', source:'School nurse cluster', client:'Sam K.', stage:'Sibling enquiry', value:'£640 / block', since:'Apr 2026' },
          { id:'ref4', source:'Self / web', client:'Ava T.', stage:'Camp upsell', value:'£220 camp', since:'Apr 2026' },
          { id:'ref5', source:'Climb centre partner', client:'Joel R.', stage:'Maintenance', value:'—', since:'2025' }
        ],
        forecasts:[
          { label:'Summer block (Jul–Aug)', scenario:'Base', value:'+£38k', note:'Assumes 85% rebook + 12 new trial conversions' },
          { label:'September term', scenario:'Stretch', value:'+14 clients', note:'Pipeline: 7 active referrals + 4 school meetings booked' },
          { label:'Cost pressure', scenario:'Watch', value:'+4% venue', note:'Pool hire indexation letters received — model in finance pack' }
        ]
      },
      actionLog:[
        { at:new Date(Date.now()-1800000).toISOString(), kind:'manual', summary:'Shift draft saved — Thu Acton PM block (Yusef)', source:'Alex Morgan' },
        { at:new Date(Date.now()-7200000).toISOString(), kind:'manual', summary:'Queued staff notification: safeguarding reminder', source:'Alex Morgan' },
        { at:new Date(Date.now()-86400000).toISOString(), kind:'system', summary:'LA EHCP template received — attached to Mariam A.', source:'Integrations (demo)' },
        { at:new Date(Date.now()-172800000).toISOString(), kind:'manual', summary:'Report rp2 moved to in_review (Tom W.)', source:'Tom W.' }
      ]
    };

    var state = { view:'dashboard', drawerClient:null, drawerStaff:null, reportTargetClient:null, search:'', shiftModalCtx:null };
    var KEY_MOBILE = 'adminDashDevMobilePreview';

    function $(id){ return document.getElementById(id); }
    function esc(s){
      if(s==null) return '';
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    }
    function money(n){
      try{ return new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:n%1?2:0}).format(n); }
      catch(e){ return '£'+n; }
    }
    function finance(){
      var s = MOCK.sessionEconomics.billableSessionCount * MOCK.sessionEconomics.unitSessionPrice;
      var w = 0;
      MOCK.timesheets.forEach(function(r){ w += r.hours * (MOCK.roleRates[r.roleKey]||0); });
      var v = MOCK.venue.periodVenueCost;
      return { sessions:MOCK.sessionEconomics.billableSessionCount, income:s, staffing:w, venue:v, balance:s-w-v };
    }

    function formatStamp(d){
      var x = d instanceof Date ? d : new Date(d);
      var p = function(n){ return n<10?'0'+n:n; };
      return x.getFullYear()+'-'+p(x.getMonth()+1)+'-'+p(x.getDate())+' '+p(x.getHours())+':'+p(x.getMinutes());
    }

    function refreshKpisFromDemo(){
      MOCK.kpi.cancellationsOpen = MOCK.cancellationsQueue.length;
      MOCK.kpi.reportsPending = MOCK.reportItems.filter(function(r){ return r.status!=='complete'; }).length;
      MOCK.kpi.incidentsOpen = MOCK.openIncidents.filter(function(i){
        return i.status.indexOf('Closed')<0 && i.status.indexOf('closed')<0;
      }).length;
      MOCK.kpi.onboardingPending = MOCK.onboardingPeople.reduce(function(n,p){
        return n + p.steps.filter(function(s){ return s.pct<100; }).length;
      }, 0);
      MOCK.kpi.referralsActive = MOCK.ceo.referrals.filter(function(r){
        return r.stage.indexOf('Closed')<0 && r.stage.indexOf('Maintenance')<0;
      }).length || MOCK.ceo.referrals.length;
    }

    function recomputeOperatorSuggestions(){
      var out = [];
      if(MOCK.cancellationsQueue.length){
        out.push({ id:'os_can', label:'Process cancellations — '+MOCK.cancellationsQueue.length+' open (credits + comms)', action:'jump', target:'operations' });
      }
      if(MOCK.shiftGaps.length){
        out.push({ id:'os_gap', label:'Fill roster gap — '+MOCK.shiftGaps[0].site+' '+MOCK.shiftGaps[0].when.slice(0,22)+'…', action:'session' });
      }
      var inc = MOCK.openIncidents.find(function(i){ return i.status.indexOf('sign-off')>=0 || i.status.indexOf('admin action')>=0; });
      if(inc){
        out.push({ id:'os_inc', label:'Review incident — '+inc.ref+' · '+inc.clientName, action:'jump', target:'reports' });
      }
      var blk = MOCK.reportItems.find(function(r){ return r.status==='blocked'; });
      if(blk){
        out.push({ id:'os_rep', label:'Unblock report — '+blk.type+' · '+blk.clientName, action:'report', reportId:blk.id });
      }
      var lowAtt = Object.keys(MOCK.clientsById).find(function(k){
        return MOCK.clientsById[k].attendancePct < 72;
      });
      if(lowAtt){
        var c = MOCK.clientsById[lowAtt];
        out.push({ id:'os_cli', label:'Check in — '+c.name+' (attendance '+c.attendancePct+'%)', action:'client', clientId:c.id });
      }
      if(out.length<4){
        out.push({ id:'os_pool', label:'Notify leads — weekly pool cover check (Thu PM)', action:'notify' });
      }
      MOCK.operatorSuggestions = out.slice(0,6);
    }

    function pushCommsHistory(type, summary){
      MOCK.commsHistory.unshift({ at:formatStamp(new Date()), type:type, summary:summary });
      if(MOCK.commsHistory.length>40) MOCK.commsHistory.length=40;
    }

    function setView(id){
      state.view = id;
      document.querySelectorAll('#adminNav button').forEach(function(b){
        b.classList.toggle('is-active', b.getAttribute('data-view')===id);
      });
      $('workspace').innerHTML = renderView(id);
      bindView(id);
      try{ history.replaceState(null,'','#'+id); }catch(e){}
    }

    function renderView(id){
      if(id==='dashboard') return viewDashboard();
      if(id==='operations') return viewOperations();
      if(id==='clients') return viewClientActivity();
      if(id==='staffhr') return viewStaffHR();
      if(id==='onboarding') return viewOnboarding();
      if(id==='reports') return viewReports();
      if(id==='communications') return viewCommunications();
      if(id==='operator') return viewOperatorLight();
      if(id==='ceo') return viewCEO();
      if(id==='settings') return viewSettings();
      return viewDashboard();
    }

    function viewDashboard(){
      refreshKpisFromDemo();
      var k = MOCK.kpi;
      var kpi = '<div class="grid-kpi" style="grid-template-columns:repeat(4,minmax(0,1fr))">' +
        kpiCard('Sessions today', k.sessionsToday, 'Scheduled & blocks') +
        kpiCard('Staff on duty', k.activeStaff, 'Across venues') +
        kpiCard('Open incidents', k.incidentsOpen, 'Reports & incidents', k.incidentsOpen>0) +
        kpiCard('Cancellations queue', k.cancellationsOpen, 'Credits & comms', k.cancellationsOpen>0) +
        '</div>';
      var kpi2 = '<div class="grid-kpi" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px">' +
        kpiCard('Reports in flight', k.reportsPending, 'Drafts & reviews', k.reportsPending>8) +
        kpiCard('Onboarding tasks', k.onboardingPending, 'Steps not 100%') +
        kpiCard('Active referrals', k.referralsActive, 'Pipeline (demo)') +
        kpiCard('Net contribution', money(MOCK.ceo.financialSummary.income-MOCK.ceo.financialSummary.payroll-MOCK.ceo.financialSummary.venue-MOCK.ceo.financialSummary.other), 'Demo period · CEO detail') +
        '</div>';
      var navCards = '<div class="grid-2" style="margin-top:8px">'+
        '<button type="button" class="card card-pad dash-link-card" data-act="operations"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">⚙</span><div class="dash-link-meta"><strong>Operations</strong><p class="muted">Sessions, cancellations, allocations</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="clients"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">👤</span><div class="dash-link-meta"><strong>Client activity</strong><p class="muted">Histories, attendance, notes</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="staffhr"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">🧑‍💼</span><div class="dash-link-meta"><strong>Staff & HR</strong><p class="muted">Roster, profiles, internal notes</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="onboarding"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">📈</span><div class="dash-link-meta"><strong>Onboarding</strong><p class="muted">Per-person progress & start dates</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="reports"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">📋</span><div class="dash-link-meta"><strong>Reports & incidents</strong><p class="muted">Queue, sign-offs, activity log</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="communications"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">✉</span><div class="dash-link-meta"><strong>Communications</strong><p class="muted">Announcements & outbox</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="operator"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">🧭</span><div class="dash-link-meta"><strong>Operator</strong><p class="muted">Contextual shortcuts</p></div></div></button>'+
        '<button type="button" class="card card-pad dash-link-card" data-act="ceo"><div class="dash-link-row"><span class="dash-link-ico" aria-hidden="true">📊</span><div class="dash-link-meta"><strong>CEO view</strong><p class="muted">Finance, pipeline, forecast</p></div></div></button>'+
        '</div>';
      var gaps = MOCK.shiftGaps.slice(0,2).map(function(g){
        return '<div class="line-item"><div><strong>'+esc(g.when)+'</strong><div class="muted">'+esc(g.site)+' · '+esc(g.note)+'</div></div><button type="button" class="btn btn--sec btn--sm" data-shift-session="">Fill gap</button></div>';
      }).join('');
      var urgent = MOCK.urgentIssues.slice(0,4).map(function(u){
        var cl = u.pri==='high'?'chip--urg':'chip--pend';
        return '<div class="line-item"><div><strong>'+esc(u.t)+'</strong></div><span class="chip '+cl+'">'+esc(u.pri)+'</span></div>';
      }).join('');
      var logLines = MOCK.actionLog.slice(0,5).map(function(l){
        var t = new Date(l.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        return '<tr><td class="muted" style="white-space:nowrap">'+esc(t)+'</td><td><span class="chip chip--info">'+esc(l.kind)+'</span></td><td>'+esc(l.summary)+'</td><td class="muted">'+esc(l.source)+'</td></tr>';
      }).join('');
      return '<div class="demo-strip">Demo mode — actions update mock data in this browser session</div>'+
        '<h1 class="page-title">Dashboard</h1><p class="page-desc">Run the day from here: sessions, people, comms, reports, and CEO snapshot — all wired to realistic clubSENsational mock data.</p>'+
        '<div class="toolbar" style="margin-bottom:16px"><button type="button" class="btn btn--pri btn--sm" data-act="operations">Start with operations</button> <button type="button" class="btn btn--sec btn--sm" data-act="operator">Operator suggestions</button></div>'+
        kpi+kpi2+navCards+
        '<div class="grid-2" style="margin-top:18px;align-items:start">'+
        '<div class="card"><div class="card-h"><h3>Shift & capacity gaps</h3></div><div class="card-pad row-lines">'+gaps+'</div></div>'+
        '<div class="card"><div class="card-h"><h3>Ops priorities</h3></div><div class="card-pad row-lines">'+urgent+'</div></div></div>'+
        '<div class="card" style="margin-top:14px"><div class="card-h"><h3>Recent activity log</h3><button type="button" class="btn btn--ghost btn--sm" data-act="reports">Full log</button></div><div class="card-pad" style="overflow:auto"><table class="tbl op-log"><thead><tr><th>When</th><th>Kind</th><th>Summary</th><th>By</th></tr></thead><tbody>'+logLines+'</tbody></table></div></div>';
    }

    function viewOperations(){
      var sess = MOCK.operationalSessions.map(function(s){
        var clientBtn = s.clientId
          ? '<button type="button" class="btn btn--ghost btn--sm" data-client="'+esc(s.clientId)+'">'+esc(s.client)+'</button>'
          : esc(s.client);
        return '<tr data-sess-row="'+esc(s.id)+'"><td>'+esc(s.when)+'</td><td>'+esc(s.venue)+'</td><td><button type="button" class="btn btn--ghost btn--sm" data-staff="'+esc(s.staffId)+'">'+esc(s.staff)+'</button></td><td>'+clientBtn+'</td><td class="muted">'+esc(s.programme)+'</td><td><span class="chip chip--info">'+esc(s.status)+'</span></td><td class="toolbar">'+
          '<button type="button" class="btn btn--sec btn--sm" data-shift-session="'+esc(s.id)+'">Edit</button> <button type="button" class="btn btn--ghost btn--sm" data-shift-session="'+esc(s.id)+'">Move</button> <button type="button" class="btn btn--ghost btn--sm" data-shift-session="'+esc(s.id)+'">Assign</button></td></tr>';
      }).join('');
      var staffAl = MOCK.staff.map(function(s){
        var ch = s.st==='active'?'chip--ok':(s.st==='leave'?'chip--pend':'chip--info');
        return '<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+esc(s.role)+'</td><td>'+esc(s.site)+'</td><td><span class="chip '+ch+'">'+esc(s.st)+'</span></td><td class="toolbar"><button type="button" class="btn btn--sec btn--sm" data-staff="'+esc(s.id)+'">Profile</button></td></tr>';
      }).join('');
      var clientAl = MOCK.operationalSessions.map(function(s){
        var ccell = s.clientId
          ? '<button type="button" class="btn btn--ghost btn--sm" data-client="'+esc(s.clientId)+'">'+esc(s.client)+'</button>'
          : esc(s.client);
        return '<tr><td>'+ccell+'</td><td>'+esc(s.venue)+'</td><td class="muted">'+esc(s.programme)+'</td><td>'+esc(s.when)+'</td></tr>';
      }).join('');
      var cans = MOCK.cancellationsQueue.map(function(c){
        return '<tr><td><strong>'+esc(c.clientName)+'</strong></td><td class="muted">'+esc(c.slot)+'</td><td>'+esc(c.reason)+'</td><td><span class="chip chip--info">'+esc(c.notice)+'</span></td><td class="muted" style="max-width:200px">'+esc(c.creditPolicy)+'</td><td><button type="button" class="btn btn--pri btn--sm" data-resolve-cancel="'+esc(c.id)+'">Resolve</button></td></tr>';
      }).join('');
      return '<h1 class="page-title">Operations</h1><p class="page-desc">Live-style demo: edit a session to see affected people, queue notifications, and history entries. Resolve cancellations to clear the queue.</p>'+
        '<div class="toolbar" style="margin-bottom:14px"><button type="button" class="btn btn--pri" data-shift-session="">New session / shift change</button> <button type="button" class="btn btn--sec" data-act="communications">Notify team</button> <button type="button" class="btn btn--sec" data-act="reports">Reports & incidents</button></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Cancellations queue</h3><span class="chip chip--pend">'+MOCK.cancellationsQueue.length+' open</span></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>Client</th><th>Slot</th><th>Reason</th><th>Notice</th><th>Policy</th><th></th></tr></thead><tbody>'+cans+'</tbody></table></div></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Session management</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>When</th><th>Venue</th><th>Staff</th><th>Client</th><th>Programme</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+sess+'</tbody></table></div></div>'+
        '<div class="grid-2"><div class="card"><div class="card-h"><h3>Staff allocation</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>Name</th><th>Role</th><th>Site</th><th>Status</th><th></th></tr></thead><tbody>'+staffAl+'</tbody></table></div></div>'+
        '<div class="card"><div class="card-h"><h3>Client allocation</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>Client</th><th>Venue</th><th>Programme</th><th>When</th></tr></thead><tbody>'+clientAl+'</tbody></table></div></div></div>';
    }

    function kpiCard(l,v,s,alert){
      return '<div class="kpi'+(alert?' kpi--alert':'')+'"><div class="kpi-l">'+esc(l)+'</div><div class="kpi-v">'+esc(String(v))+'</div><div class="kpi-s">'+esc(s)+'</div></div>';
    }

    function viewClientActivity(){
      var rows = Object.keys(MOCK.clientsById).map(function(k){
        var c = MOCK.clientsById[k];
        return '<tr><td><strong>'+esc(c.name)+'</strong></td><td class="muted">'+esc(c.sub)+'</td><td>'+c.sessionsAttended+'</td><td>'+c.attendancePct+'%</td><td><button type="button" class="btn btn--pri btn--sm" data-client="'+esc(c.id)+'">View activity</button></td></tr>';
      }).join('');
      return '<h1 class="page-title">Client activity</h1><p class="page-desc">Structured visibility per client — recent sessions, attendance, engagement, emotional check-ins, activities, incidents, and notes. Open a row for the full picture (no analytics dashboards).</p>'+
        '<div class="filter-row"><input class="inp" id="filClient" placeholder="Search clients…" style="max-width:320px"/></div>'+
        '<div class="card"><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center" id="tblClients"><thead><tr><th>Client</th><th>Programme</th><th>Sessions (YTD)</th><th>Attendance %</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }

    function viewStaffHR(){
      var rows = MOCK.staff.map(function(s){
        var ch = s.st==='active'?'chip--ok':(s.st==='leave'?'chip--pend':'chip--info');
        var av = s.availability ? esc(s.availability) : '—';
        return '<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+esc(s.role)+'</td><td>'+esc(s.site)+'</td><td class="muted" style="max-width:200px">'+av+'</td><td><span class="chip '+ch+'">'+esc(s.st)+'</span></td><td class="toolbar"><button type="button" class="btn btn--sec btn--sm" data-staff="'+esc(s.id)+'">Profile</button> <button type="button" class="btn btn--ghost btn--sm" data-shift-session="">Shift</button></td></tr>';
      }).join('');
      var shifts = MOCK.shiftsDemo.map(function(s){
        return '<tr><td><button type="button" class="btn btn--ghost btn--sm" data-staff="'+esc(s.staffId||'')+'">'+esc(s.staff)+'</button></td><td>'+esc(s.when)+'</td><td>'+esc(s.venue)+'</td><td><span class="chip chip--info">'+esc(s.st)+'</span></td><td><button type="button" class="btn btn--ghost btn--sm" data-shift-session="">Edit</button></td></tr>';
      }).join('');
      var intRows = MOCK.interviews.map(function(i){
        return '<tr><td>'+esc(i.name)+'</td><td class="muted">'+esc(i.role)+'</td><td><span class="chip chip--pend">'+esc(i.status)+'</span></td></tr>';
      }).join('');
      var obSummary = MOCK.onboardingSteps.map(function(o){ return o.label+' '+o.pct+'%'; }).join(' · ');
      return '<h1 class="page-title">Staff &amp; HR</h1><p class="page-desc">Staff list, roles, availability, shifts, and internal notes. Hiring and onboarding summaries stay compact here.</p>'+
        '<div class="filter-row"><input class="inp" id="filStaff" placeholder="Filter staff…" /><select class="sel" id="filStaffSite"><option value="">All sites</option><option>Acton</option><option>Ealing</option><option>All</option></select></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Staff</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center" id="tblStaff"><thead><tr><th>Name</th><th>Role</th><th>Site</th><th>Availability</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Shifts (roster)</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>Staff</th><th>When</th><th>Venue</th><th>Status</th><th></th></tr></thead><tbody>'+shifts+'</tbody></table></div></div>'+
        '<div class="grid-2"><div class="card"><div class="card-h"><h3>Interviews (summary)</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl tbl--center"><thead><tr><th>Candidate</th><th>Role</th><th>Status</th></tr></thead><tbody>'+intRows+'</tbody></table></div></div>'+
        '<div class="card"><div class="card-h"><h3>Onboarding (summary)</h3></div><div class="card-pad"><p class="muted" style="margin:0;font-size:13px;line-height:1.5">'+esc(obSummary)+'</p><div class="toolbar" style="margin-top:12px"><button type="button" class="btn btn--sec btn--sm" data-open-compose data-preset="reminder">Send reminder</button></div></div></div></div>'+
        '<div class="card" style="margin-top:14px"><div class="card-h"><h3>Internal HR notes</h3></div><div class="card-pad"><p class="muted" style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.5">'+esc(MOCK.hrNotesInternal)+'</p></div></div>';
    }

    function viewOnboarding(){
      var people = MOCK.onboardingPeople.map(function(p){
        var steps = p.steps.map(function(st){
          return '<div style="margin-bottom:8px"><div class="trend-row"><span>'+esc(st.label)+'</span><span>'+st.pct+'%</span></div><div class="progress-h"><i style="width:'+st.pct+'%"></i></div></div>';
        }).join('');
        return '<div class="card"><div class="card-h"><h3>'+esc(p.name)+'</h3><span class="chip chip--info">'+esc(p.role)+'</span></div><div class="card-pad">'+
          '<p class="muted" style="margin:0 0 12px">Start: <strong style="color:var(--ink)">'+esc(p.startDate)+'</strong> · Buddy: '+esc(p.buddy)+'</p>'+steps+
          '<div class="toolbar" style="margin-top:14px"><button type="button" class="btn btn--sec btn--sm" data-ob-nudge="'+esc(p.id)+'">Send nudge (demo)</button> <button type="button" class="btn btn--ghost btn--sm" data-open-compose data-preset="reminder">Comms</button></div></div></div>';
      }).join('');
      return '<h1 class="page-title">Onboarding</h1><p class="page-desc">Each hire has distinct step progress — nudge simulates a reminder and bumps the lowest incomplete step in demo.</p>'+
        '<div class="op-banner" style="margin-bottom:16px"><strong>Jordan P. blocks May start</strong><p>DBS and references are the critical path. Lee T. depends on Thursday practical.</p></div>'+
        '<div class="stack">'+people+'</div>';
    }

    function viewReports(){
      var repRows = MOCK.reportItems.map(function(r){
        var st = r.status==='complete'?'chip--ok':r.status==='blocked'?'chip--urg':'chip--pend';
        var act = r.status==='blocked'
          ? '<button type="button" class="btn btn--sec btn--sm" data-report-unblock="'+esc(r.id)+'">Unblock</button>'
          : '<button type="button" class="btn btn--pri btn--sm" data-report-done="'+esc(r.id)+'">Mark sent</button>';
        var openClient = r.clientId ? ' <button type="button" class="btn btn--ghost btn--sm" data-client="'+esc(r.clientId)+'">Client</button>' : '';
        return '<tr><td><span class="chip '+st+'">'+esc(r.status)+'</span></td><td>'+esc(r.type)+'</td><td><strong>'+esc(r.clientName)+'</strong></td><td class="muted">'+esc(r.due)+'</td><td>'+esc(r.owner)+'</td><td class="muted">'+esc(r.lastEdit)+'</td><td class="toolbar">'+act+openClient+' <button type="button" class="btn btn--ghost btn--sm" data-open-report data-rep="'+esc(r.id)+'">Open</button></td></tr>';
      }).join('');
      var incRows = MOCK.openIncidents.map(function(i){
        var open = i.status.indexOf('Closed')<0 && i.status.indexOf('closed')<0;
        var btn = open
          ? '<button type="button" class="btn btn--pri btn--sm" data-inc-sign="'+esc(i.id)+'">Sign off</button> <button type="button" class="btn btn--ghost btn--sm" data-client="'+esc(i.clientId)+'">Client</button>'
          : '<span class="muted">—</span> <button type="button" class="btn btn--ghost btn--sm" data-client="'+esc(i.clientId)+'">Client</button>';
        return '<tr><td><strong>'+esc(i.ref)+'</strong></td><td>'+esc(i.title)+'</td><td>'+esc(i.clientName)+'</td><td><span class="chip chip--info">'+esc(i.status)+'</span></td><td class="muted">'+esc(i.opened)+'</td><td>'+esc(i.lead)+'</td><td class="toolbar">'+btn+'</td></tr>';
      }).join('');
      var logRows = MOCK.actionLog.slice(0,35).map(function(l){
        var t = new Date(l.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        return '<tr><td class="muted" style="white-space:nowrap">'+esc(t)+'</td><td><span class="chip chip--info">'+esc(l.kind)+'</span></td><td>'+esc(l.summary)+'</td><td class="muted">'+esc(l.source)+'</td></tr>';
      }).join('');
      return '<h1 class="page-title">Reports &amp; incidents</h1><p class="page-desc">Work the report queue, close incidents, and audit everything in the activity log — all updates refresh KPIs and operator suggestions.</p>'+
        '<div class="toolbar" style="margin-bottom:14px"><button type="button" class="btn btn--pri" data-open-report>New report draft</button> <button type="button" class="btn btn--sec" data-act="clients">Client directory</button></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Report queue</h3><span class="chip chip--pend">'+MOCK.reportItems.filter(function(r){ return r.status!=='complete'; }).length+' active</span></div><div class="card-pad" style="overflow:auto"><table class="tbl"><thead><tr><th>Status</th><th>Type</th><th>Client</th><th>Due</th><th>Owner</th><th>Updated</th><th></th></tr></thead><tbody>'+repRows+'</tbody></table></div></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Incidents</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl"><thead><tr><th>Ref</th><th>Title</th><th>Client</th><th>Status</th><th>Opened</th><th>Lead</th><th></th></tr></thead><tbody>'+incRows+'</tbody></table></div></div>'+
        '<div class="card"><div class="card-h"><h3>Full activity log</h3></div><div class="card-pad" style="overflow:auto;max-height:360px"><table class="tbl op-log"><thead><tr><th>When</th><th>Kind</th><th>Summary</th><th>By</th></tr></thead><tbody>'+logRows+'</tbody></table></div></div>';
    }

    function viewCEO(){
      var c = MOCK.ceo;
      var f = c.financialSummary;
      var ov = c.businessOverview.map(function(x){
        return '<div class="kpi"><div class="kpi-l">'+esc(x.label)+'</div><div class="kpi-v">'+esc(x.value)+'</div><div class="kpi-s">'+esc(x.sub)+'</div></div>';
      }).join('');
      var ci = c.clientIntel.map(function(x){
        return '<div class="insight-card"><h4>'+esc(x.title)+'</h4><p class="muted" style="margin:0;font-size:13px;line-height:1.5">'+esc(x.detail)+'</p></div>';
      }).join('');
      var op = c.operationalInsights.map(function(x){
        return '<div class="line-item"><div><strong>'+esc(x.title)+'</strong><div class="muted" style="margin-top:4px">'+esc(x.detail)+'</div></div></div>';
      }).join('');
      var ref = c.referrals.map(function(r){
        return '<tr><td><strong>'+esc(r.source)+'</strong></td><td>'+esc(r.client)+'</td><td><span class="chip chip--info">'+esc(r.stage)+'</span></td><td>'+esc(r.value)+'</td><td class="muted">'+esc(r.since)+'</td></tr>';
      }).join('');
      var fc = c.forecasts.map(function(x){
        return '<div class="card card-pad"><div class="kpi-l">'+esc(x.label)+' · '+esc(x.scenario)+'</div><div class="kpi-v" style="font-size:20px">'+esc(x.value)+'</div><p class="muted" style="margin:8px 0 0;font-size:12px">'+esc(x.note)+'</p></div>';
      }).join('');
      return '<h1 class="page-title">CEO view</h1><p class="page-desc">Strategic snapshot built from the same operational mock — not a separate dataset. Figures are illustrative for demo.</p>'+
        '<div class="ceo-hero"><div class="kpi-l">Spring term pulse</div><div style="font-size:16px;font-weight:600;margin-top:6px">'+esc(c.headline)+'</div><div class="kpi-s" style="margin-top:10px">Term dates · clubSENsational · continuous SEN swim & climb</div></div>'+
        '<div class="grid-kpi" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:18px">'+ov+'</div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Financial summary (demo period)</h3></div><div class="card-pad">'+
        '<div class="grid-2"><div><p class="muted" style="margin:0 0 6px">Session income (billable)</p><p style="margin:0;font-size:22px;font-weight:700">'+money(f.income)+'</p></div><div><p class="muted" style="margin:0 0 6px">Payroll + venue + other</p><p style="margin:0;font-size:22px;font-weight:700">'+money(f.payroll+f.venue+f.other)+'</p></div></div>'+
        '<p class="muted" style="margin:14px 0 0;font-size:13px">Modelled margin ~<strong style="color:var(--ink)">'+f.marginPct+'%</strong> · AR outstanding '+money(f.ar)+' · Sessions YTD '+f.ytdSessions+'</p></div></div>'+
        '<div class="grid-2" style="align-items:start;margin-bottom:14px"><div class="stack"><div class="section-h" style="margin-bottom:8px"><div><h2>Client intelligence</h2><p>Aggregated from live caseload mock.</p></div></div>'+ci+'</div>'+
        '<div class="card"><div class="card-h"><h3>Operational insights</h3></div><div class="card-pad row-lines">'+op+'</div></div></div>'+
        '<div class="card" style="margin-bottom:14px"><div class="card-h"><h3>Leads &amp; referrals</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl"><thead><tr><th>Source</th><th>Client / deal</th><th>Stage</th><th>Value</th><th>Since</th></tr></thead><tbody>'+ref+'</tbody></table></div></div>'+
        '<div class="section-h" style="margin-bottom:10px"><div><h2>Forecast &amp; growth</h2><p>Scenarios for summer block and September term.</p></div></div><div class="grid-3">'+fc+'</div>';
    }

    function viewCommunications(){
      var ann = MOCK.announcements.map(function(a){
        return '<div class="line-item"><div><strong>'+esc(a.title)+'</strong> <span class="muted">· '+esc(a.when)+'</span><div class="muted" style="margin-top:4px">'+esc(a.body)+'</div></div></div>';
      }).join('');
      var shifts = MOCK.sessionChanges.map(function(c){
        return '<div class="line-item"><div><strong>'+esc(c.t)+'</strong><div class="muted">'+esc(c.by)+' · '+esc(c.st)+'</div></div></div>';
      }).join('');
      var feed = MOCK.internalFeed.length ? MOCK.internalFeed.map(function(m){
        var src = m.source ? ' · '+esc(m.source) : '';
        var t = m.at ? new Date(m.at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
        return '<div class="line-item"><div><span class="muted">'+esc(t)+'</span> <strong>'+esc(m.type)+'</strong> · '+esc(m.audience)+src+'<div class="muted" style="margin-top:4px">'+esc(m.body)+'</div></div><span class="chip chip--pend">'+esc(m.pri)+'</span></div>';
      }).join('') : '<p class="muted" style="margin:0">No queued staff notifications yet.</p>';
      var hist = MOCK.commsHistory.map(function(h){
        return '<tr><td class="muted" style="white-space:nowrap">'+esc(h.at)+'</td><td><span class="chip chip--info">'+esc(h.type)+'</span></td><td>'+esc(h.summary)+'</td></tr>';
      }).join('');
      return '<h1 class="page-title">Communications</h1><p class="page-desc">Announcements, shift/session changes, staff notifications, and a simple history log.</p>'+
        '<div class="toolbar" style="margin-bottom:14px"><button type="button" class="btn btn--pri" data-open-compose>New staff notification</button> <button type="button" class="btn btn--sec" data-open-compose data-preset="announcement">New announcement</button> <button type="button" class="btn btn--sec" data-open-compose data-preset="shift">Shift change notice</button></div>'+
        '<div class="grid-2" style="align-items:start">'+
        '<div class="stack"><div class="card"><div class="card-h"><h3>Announcements</h3></div><div class="card-pad row-lines">'+ann+'</div></div>'+
        '<div class="card"><div class="card-h"><h3>Shift &amp; session changes</h3></div><div class="card-pad row-lines">'+shifts+'</div></div></div>'+
        '<div class="stack"><div class="card"><div class="card-h"><h3>Notification outbox</h3></div><div class="card-pad row-lines">'+feed+'</div></div>'+
        '<div class="card"><div class="card-h"><h3>History log</h3></div><div class="card-pad" style="overflow:auto"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th>Summary</th></tr></thead><tbody>'+hist+'</tbody></table></div></div></div></div>';
    }

    function viewSettings(){
      var f = finance();
      var ceo = MOCK.ceo.financialSummary;
      return '<h1 class="page-title">Settings &amp; demo tools</h1><p class="page-desc">Integration placeholders plus the same financial engine used on the CEO view — all numbers are illustrative.</p>'+
        '<div class="grid-2"><div class="card card-pad"><h3 style="margin:0 0 10px;font-size:14px">Connections</h3><p class="muted" style="margin:0 0 8px">Supabase project <strong style="color:var(--ink)">not linked</strong> — demo runs entirely in-browser.</p><p class="muted" style="margin:0">WordPress / parent portal — off.</p></div>'+
        '<div class="card card-pad"><h3 style="margin:0 0 10px;font-size:14px">Operator finance (ops model)</h3><p class="muted" style="margin:0">Sessions billed: <strong style="color:var(--ink)">'+MOCK.sessionEconomics.billableSessionCount+'</strong> × '+money(MOCK.sessionEconomics.unitSessionPrice)+'</p><p class="muted" style="margin:8px 0 0">Staffing est.: <strong style="color:var(--ink)">'+money(f.staffing)+'</strong> · Venue: <strong style="color:var(--ink)">'+money(f.venue)+'</strong></p><p class="muted" style="margin:8px 0 0">Balance (demo): <strong style="color:var(--ink)">'+money(f.balance)+'</strong></p></div></div>'+
        '<div class="card" style="margin-top:14px"><div class="card-h"><h3>CEO snapshot (read-only here)</h3></div><div class="card-pad"><p class="muted" style="margin:0">Session income '+money(ceo.income)+' · Payroll '+money(ceo.payroll)+' · Modelled margin <strong style="color:var(--ink)">'+ceo.marginPct+'%</strong></p><div class="toolbar" style="margin-top:12px"><button type="button" class="btn btn--sec" data-act="ceo">Open CEO view</button> <button type="button" class="btn btn--sec" data-open-report>Report generator</button></div></div></div>';
    }

    function viewOperatorLight(){
      var sug = MOCK.operatorSuggestions.map(function(s){
        return '<div class="line-item" style="align-items:center"><div><strong>'+esc(s.label)+'</strong><div class="muted" style="margin-top:2px">Opens the relevant flow — you confirm each step.</div></div><button type="button" class="btn btn--pri btn--sm" data-op-suggest="'+esc(s.id)+'">Run</button></div>';
      }).join('');
      return '<h1 class="page-title">Operator</h1><p class="page-desc">Light shortcuts only: notify staff, update a session, or open reports. No predictions or automation.</p>'+
        '<div class="card" style="max-width:560px"><div class="card-h"><h3>Suggested actions</h3></div><div class="card-pad row-lines">'+sug+'</div></div>'+
        '<div class="toolbar" style="margin-top:16px"><button type="button" class="btn btn--sec" data-open-compose>Custom notification</button> <button type="button" class="btn btn--sec" data-shift-session="">Session / shift update</button> <button type="button" class="btn btn--sec" data-open-report>Prepare report</button></div>';
    }

    function bindOperatorLight(){
      document.querySelectorAll('[data-op-suggest]').forEach(function(b){
        b.addEventListener('click', function(){
          var id = b.getAttribute('data-op-suggest');
          var s = MOCK.operatorSuggestions.find(function(x){ return x.id===id; });
          if(!s) return;
          if(s.action==='notify') openComposeModal('reminder');
          else if(s.action==='session') openShiftModal('');
          else if(s.action==='jump' && s.target) setView(s.target);
          else if(s.action==='client' && s.clientId){ setView('clients'); setTimeout(function(){ openClientDrawer(s.clientId); }, 0); }
          else if(s.action==='report') openReportModal(null, s.reportId||null);
          else openReportModal(null);
          logAction('manual', 'Operator: '+s.label, 'Operator');
        });
      });
    }

    function logAction(kind, summary, source){
      MOCK.actionLog.unshift({
        at:new Date().toISOString(),
        kind:kind||'manual',
        summary:summary||'',
        source:source||MOCK.profile.name
      });
      if(MOCK.actionLog.length>80) MOCK.actionLog.length=80;
    }

    function bindView(id){
      var root = $('workspace');
      root.querySelectorAll('[data-client]').forEach(function(b){
        b.addEventListener('click', function(){ openClientDrawer(b.getAttribute('data-client')); });
      });
      root.querySelectorAll('[data-staff]').forEach(function(b){
        var sid = b.getAttribute('data-staff');
        if(!sid) return;
        b.addEventListener('click', function(){ openStaffDrawer(sid); });
      });
      root.querySelectorAll('[data-shift-session]').forEach(function(b){
        b.addEventListener('click', function(){ openShiftModal(b.getAttribute('data-shift-session')||''); });
      });
      root.querySelectorAll('[data-view-target]').forEach(function(b){
        b.addEventListener('click', function(){ setView(b.getAttribute('data-view-target')); closeSidebarMob(); });
      });
      root.querySelectorAll('[data-act]').forEach(function(b){
        b.addEventListener('click', function(){
          var v = b.getAttribute('data-act');
          if(v==='dashboard'||v==='operations'||v==='clients'||v==='staffhr'||v==='onboarding'||v==='reports'||v==='communications'||v==='operator'||v==='ceo'||v==='settings') setView(v);
          closeSidebarMob();
        });
      });
      root.querySelectorAll('[data-open-report]').forEach(function(b){
        b.addEventListener('click', function(){
          var rid = b.getAttribute('data-rep');
          openReportModal(null, rid||null);
        });
      });
      root.querySelectorAll('[data-open-compose]').forEach(function(b){
        b.addEventListener('click', function(){ openComposeModal(b.getAttribute('data-preset')||''); });
      });
      root.querySelectorAll('[data-jump]').forEach(function(b){
        b.addEventListener('click', function(){ setView(b.getAttribute('data-view-target')); closeSidebarMob(); });
      });
      root.querySelectorAll('[data-note]').forEach(function(b){ b.addEventListener('click', openNoteModal); });
      root.querySelectorAll('[data-resolve-cancel]').forEach(function(b){
        b.addEventListener('click', function(){
          var cid = b.getAttribute('data-resolve-cancel');
          MOCK.cancellationsQueue = MOCK.cancellationsQueue.filter(function(x){ return x.id!==cid; });
          logAction('manual', 'Cancellation resolved · credit / comms logged (demo)', MOCK.profile.name);
          pushCommsHistory('Cancellation', 'Resolved queue item '+cid+' — family notified (demo)');
          refreshKpisFromDemo();
          recomputeOperatorSuggestions();
          setView('operations');
        });
      });
      root.querySelectorAll('[data-ob-nudge]').forEach(function(b){
        b.addEventListener('click', function(){
          var pid = b.getAttribute('data-ob-nudge');
          var p = MOCK.onboardingPeople.find(function(x){ return x.id===pid; });
          if(!p) return;
          var low = p.steps.filter(function(s){ return s.pct<100; }).sort(function(a,b){ return a.pct-b.pct; })[0];
          if(low) low.pct = Math.min(100, low.pct+18);
          logAction('manual', 'Onboarding nudge sent · '+p.name+' · '+ (low?low.label:'all steps complete'), MOCK.profile.name);
          refreshKpisFromDemo();
          setView('onboarding');
        });
      });
      root.querySelectorAll('[data-report-unblock]').forEach(function(b){
        b.addEventListener('click', function(){
          var rid = b.getAttribute('data-report-unblock');
          var r = MOCK.reportItems.find(function(x){ return x.id===rid; });
          if(r){ r.status='draft'; r.lastEdit=formatStamp(new Date()); }
          logAction('manual', 'Report unblocked · '+ (r?r.type:rid), MOCK.profile.name);
          setView('reports');
        });
      });
      root.querySelectorAll('[data-report-done]').forEach(function(b){
        b.addEventListener('click', function(){
          var rid = b.getAttribute('data-report-done');
          var r = MOCK.reportItems.find(function(x){ return x.id===rid; });
          if(r){ r.status='complete'; r.lastEdit=formatStamp(new Date()); }
          logAction('manual', 'Report marked sent · '+ (r?r.type:rid), MOCK.profile.name);
          refreshKpisFromDemo();
          recomputeOperatorSuggestions();
          setView('reports');
        });
      });
      root.querySelectorAll('[data-inc-sign]').forEach(function(b){
        b.addEventListener('click', function(){
          var iid = b.getAttribute('data-inc-sign');
          var inc = MOCK.openIncidents.find(function(x){ return x.id===iid; });
          if(inc){ inc.status='Closed · signed off (demo)'; }
          logAction('manual', 'Incident signed off · '+ (inc?inc.ref:iid), MOCK.profile.name);
          pushCommsHistory('Incident', (inc?inc.ref:'')+' closed — file updated (demo)');
          refreshKpisFromDemo();
          recomputeOperatorSuggestions();
          setView('reports');
        });
      });

      if(id==='staffhr'){
        var fs = $('filStaff'), fss = $('filStaffSite');
        if(fs) fs.addEventListener('input', filterStaffTable);
        if(fss) fss.addEventListener('change', filterStaffTable);
      }
      if(id==='clients'){ var fc = $('filClient'); if(fc) fc.addEventListener('input', filterClientTable); }
      if(id==='operator') bindOperatorLight();
    }

    function filterStaffTable(){
      var q = ($('filStaff')&&$('filStaff').value||'').toLowerCase();
      var site = ($('filStaffSite')&&$('filStaffSite').value||'').toLowerCase();
      document.querySelectorAll('#tblStaff tbody tr').forEach(function(tr){
        var t = tr.textContent.toLowerCase();
        var ok = (!q||t.indexOf(q)>=0) && (!site||t.indexOf(site)>=0);
        tr.style.display = ok?'':'none';
      });
    }
    function filterClientTable(){
      var q = ($('filClient')&&$('filClient').value||'').toLowerCase();
      document.querySelectorAll('#tblClients tbody tr').forEach(function(tr){
        tr.style.display = (!q||tr.textContent.toLowerCase().indexOf(q)>=0)?'':'none';
      });
    }
    function openStaffDrawer(sid){
      var s = MOCK.staff.find(function(x){ return x.id===sid; });
      if(!s) return;
      state.drawerStaff = sid;
      state.drawerClient = null;
      $('drawerClientName').textContent = s.name;
      $('drawerClientSub').textContent = s.role+' · '+s.site+' · '+s.st;
      var myShifts = MOCK.shiftsDemo.filter(function(sh){ return sh.staffId===sid || sh.staff===s.name; });
      var shiftRows = myShifts.length
        ? myShifts.map(function(sh){
          return '<tr><td>'+esc(sh.when)+'</td><td>'+esc(sh.venue)+'</td><td><span class="chip chip--info">'+esc(sh.st)+'</span></td></tr>';
        }).join('')
        : '<tr><td colspan="3" class="muted">No shifts in demo window — add via shift control.</td></tr>';
      var body =
        '<div class="grid-2">'+
        '<div class="card card-pad"><div class="kpi-l">Status</div><p style="margin:6px 0 0"><span class="chip '+(s.st==='active'?'chip--ok':'chip--pend')+'">'+esc(s.st)+'</span></p></div>'+
        '<div class="card card-pad"><div class="kpi-l">Training</div><p class="muted" style="margin:6px 0 0;font-size:13px">'+esc(s.training||'—')+'</p></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><div class="kpi-l">Availability</div><p style="margin:6px 0 0;font-size:13px">'+esc(s.availability||'—')+'</p></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><div class="kpi-l">HR / lead notes</div><p class="muted" style="margin:6px 0 0;font-size:13px;white-space:pre-wrap">'+esc(s.notes||'—')+'</p></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-h"><h3>Shifts (demo roster)</h3></div><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl" style="font-size:12px"><thead><tr><th>When</th><th>Venue</th><th>State</th></tr></thead><tbody>'+shiftRows+'</tbody></table></div></div>';
      $('drawerBody').innerHTML = body;
      $('drawerActions').innerHTML =
        '<button type="button" class="btn btn--pri" id="drStShift">Shift / session change</button>'+
        '<button type="button" class="btn btn--sec" id="drStComms">Notify</button>'+
        '<button type="button" class="btn btn--sec" id="drStHr" data-act="staffhr">Back to roster</button>'+
        '<button type="button" class="btn btn--ghost" id="drStClose">Close</button>';
      $('drStShift').onclick = function(){ openShiftModal(''); };
      $('drStComms').onclick = function(){ closeDrawer(); openComposeModal('reminder'); };
      $('drStClose').onclick = closeDrawer;
      var drHr = $('drStHr');
      if(drHr) drHr.onclick = function(){ closeDrawer(); setView('staffhr'); };
      $('drawerBackdrop').classList.add('open');
      $('clientDrawer').classList.add('open');
      $('clientDrawer').setAttribute('aria-hidden','false');
    }

    function openClientDrawer(cid){
      var c = MOCK.clientsById[cid];
      if(!c) return;
      state.drawerClient = cid;
      state.drawerStaff = null;
      $('drawerClientName').textContent = c.name;
      $('drawerClientSub').textContent = c.sub;
      var sessRows = (c.recentSessions&&c.recentSessions.length)
        ? c.recentSessions.map(function(s){
          return '<tr><td>'+esc(s.when)+'</td><td>'+esc(s.programme)+'</td><td><span class="chip chip--info">'+esc(s.attended)+'</span></td><td class="muted">'+esc(s.note)+'</td></tr>';
        }).join('')
        : '<tr><td colspan="4" class="muted">No recent sessions logged.</td></tr>';
      var actList = (c.activitiesWorked&&c.activitiesWorked.length)
        ? '<ul class="muted" style="margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.5">'+c.activitiesWorked.map(function(a){ return '<li>'+esc(a)+'</li>'; }).join('')+'</ul>'
        : '<p class="muted" style="margin:6px 0 0;font-size:12px">—</p>';
      var incHist = (c.incidentHistory&&c.incidentHistory.length)
        ? '<ul class="muted" style="margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.5">'+
          c.incidentHistory.map(function(h){ return '<li><strong>'+esc(h.when)+'</strong> · '+esc(h.summary)+'</li>'; }).join('')+'</ul>'
        : '<p class="muted" style="margin:6px 0 0;font-size:12px">No incidents on file.</p>';
      var eng = c.lastEngagementLabel ? esc(c.lastEngagementLabel) : '—';
      var emo = c.lastEmotionalLabel ? esc(c.lastEmotionalLabel) : '—';
      var opsNote = c.recommendedNext ? esc(c.recommendedNext) : '';
      var attTerm = c.attendanceTerm
        ? '<div class="card card-pad" style="margin-top:12px"><div class="kpi-l">Attendance (term record)</div><p class="muted" style="margin:8px 0 0;font-size:12px;line-height:1.6">Booked <strong style="color:var(--ink)">'+c.attendanceTerm.booked+'</strong> · Attended <strong style="color:var(--ink)">'+c.attendanceTerm.attended+'</strong> · Late <strong style="color:var(--ink)">'+c.attendanceTerm.late+'</strong> · Cancelled <strong style="color:var(--ink)">'+c.attendanceTerm.cancelled+'</strong></p></div>'
        : '';
      var body =
        '<div class="grid-2">'+
        '<div class="card card-pad"><div class="kpi-l">Sessions (YTD)</div><div class="kpi-v" style="font-size:22px">'+c.sessionsAttended+'</div></div>'+
        '<div class="card card-pad"><div class="kpi-l">Attendance</div><div class="kpi-v" style="font-size:22px">'+c.attendancePct+'%</div></div>'+
        '<div class="card card-pad"><div class="kpi-l">Cancellations</div><div class="kpi-v" style="font-size:22px">'+c.cancellations+'</div></div>'+
        '<div class="card card-pad"><div class="kpi-l">Incidents</div><div class="kpi-v" style="font-size:22px">'+c.incidents+'</div></div></div>'+attTerm+
        '<div class="card" style="margin-top:12px"><div class="card-h"><h3>Recent sessions</h3></div><div class="card-pad" style="overflow:auto;padding:0"><table class="tbl" style="font-size:12px"><thead><tr><th>Date</th><th>Programme</th><th>Attendance</th><th>Note</th></tr></thead><tbody>'+sessRows+'</tbody></table></div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad">'+
        '<div class="kpi-l">Engagement (last session)</div><p style="margin:4px 0 0;font-size:13px;color:var(--text)">'+eng+'</p>'+
        '<div class="kpi-l" style="margin-top:12px">Emotional state (last check-in)</div><p style="margin:4px 0 0;font-size:13px;color:var(--text)">'+emo+'</p>'+
        '</div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><div class="kpi-l">Activities worked</div>'+actList+'</div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><div class="kpi-l">Incidents</div>'+incHist+'</div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><div class="kpi-l">Relevant notes</div><ul class="muted" style="margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.5">'+
        (c.notes&&c.notes.length?c.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join(''):'<li>None on file</li>')+'</ul>'+
        (opsNote?'<p class="muted" style="margin:10px 0 0;font-size:12px"><strong style="color:var(--ink)">Ops follow-up:</strong> '+opsNote+'</p>':'')+
        '</div></div>'+
        '<div class="card" style="margin-top:12px"><div class="card-pad"><strong>Positives</strong><ul class="muted" style="margin:8px 0 0;padding-left:18px;font-size:12px">'+
        c.positives.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join('')+'</ul><p class="muted" style="margin:10px 0 0;font-size:12px"><strong style="color:var(--ink)">Context:</strong> '+esc(c.pattern)+'</p></div></div>';
      $('drawerBody').innerHTML = body;
      $('drawerActions').innerHTML =
        '<button type="button" class="btn btn--pri" id="drGenRep">Prepare report</button>'+
        '<button type="button" class="btn btn--pri" id="drParent">Parent summary</button>'+
        '<button type="button" class="btn btn--sec" id="drFb">Review feedback</button>'+
        '<button type="button" class="btn btn--sec" id="drInc">Review incidents</button>'+
        '<button type="button" class="btn btn--sec" id="drComms">Communications</button>'+
        '<button type="button" class="btn btn--ghost" id="drNote">Add admin note</button>';
      $('drGenRep').onclick = function(){ openReportModal(cid); };
      $('drParent').onclick = function(){
        openReportModal(cid);
        setTimeout(function(){
          var rt = $('repType'); if(rt){ rt.value='parent_summary'; }
          var g = $('btnGenRep'); if(g) g.click();
        }, 0);
      };
      $('drFb').onclick = function(){ alert('Demo: opens feedback queue filtered to client (wire to data later).'); };
      $('drInc').onclick = function(){ closeDrawer(); setView('reports'); };
      $('drNote').onclick = openNoteModal;
      var drC = $('drComms');
      if(drC) drC.onclick = function(){ closeDrawer(); setView('communications'); };
      $('drawerBackdrop').classList.add('open');
      $('clientDrawer').classList.add('open');
      $('clientDrawer').setAttribute('aria-hidden','false');
    }

    function closeDrawer(){
      $('drawerBackdrop').classList.remove('open');
      $('clientDrawer').classList.remove('open');
      $('clientDrawer').setAttribute('aria-hidden','true');
      state.drawerClient = null;
      state.drawerStaff = null;
    }

    function openModal(html){
      $('modalRoot').innerHTML = html;
      $('modalBackdrop').classList.add('open');
    }
    function closeModal(){ $('modalBackdrop').classList.remove('open'); }

    function reportDraftForClient(cid){
      var c = cid ? MOCK.clientsById[cid] : null;
      var f = finance();
      var lines = [
        '=== clubSENsational · Report draft (export-ready) ===',
        'Generated: '+new Date().toISOString(),
        c?('Subject: '+c.name):'Subject: Operations summary',
        '',
        c?('Attendance: '+c.attendancePct+'% · Sessions attended: '+c.sessionsAttended):'',
        c?('Pattern: '+c.pattern):('Sessions (period): '+f.sessions+' · Income est.: '+money(f.income)),
        '',
        'Positive points:',
        c?(' - '+c.positives.join('\n - ')):' - Network highlights pending merge',
        '',
        'Next steps: [editable]',
        'Signed off: _________________'
      ];
      return lines.filter(Boolean).join('\n');
    }

    function openReportModal(cid, repItemId){
      state.reportTargetClient = cid||null;
      var opts = '<option value="">General / operations</option>'+Object.keys(MOCK.clientsById).map(function(k){
        var c = MOCK.clientsById[k];
        return '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>';
      }).join('');
      openModal(
        '<div class="modal-h"><h2 id="modalTitle">Report generation</h2></div><div class="modal-b">'+
        '<p class="muted" style="margin-top:0">Structured output for families and files — demo workflow: generate, edit, copy or export.</p>'+
        '<div class="filter-row" style="margin-bottom:12px">'+
        '<select class="sel" id="repClient" style="max-width:100%">'+opts+'</select>'+
        '<select class="sel" id="repType"><option value="progress">Progress report</option><option value="parent_summary">Parent summary</option><option value="term">Term review draft</option><option value="trial">Trial summary</option><option value="ehcp">EHCP contribution</option><option value="observation">Observation</option></select></div>'+
        '<label class="sr-only" for="repBody">Report body</label>'+
        '<textarea class="txa" id="repBody" style="min-height:220px"></textarea></div>'+
        '<div class="modal-f">'+
        '<button type="button" class="btn btn--ghost" id="btnCloseModal">Cancel</button>'+
        '<button type="button" class="btn btn--sec" id="btnCopyRep">Copy</button>'+
        '<button type="button" class="btn btn--sec" id="btnJsonRep">Export JSON</button>'+
        '<button type="button" class="btn btn--pri" id="btnGenRep">Generate draft</button></div>'
      );
      if(cid) $('repClient').value = cid;
      if(repItemId){
        var r = MOCK.reportItems.find(function(x){ return x.id===repItemId; });
        if(r){
          if(r.clientId) $('repClient').value = r.clientId;
          var typeMap = { 'Term review':'term', 'Parent summary':'parent_summary', 'Session feedback':'progress', 'Observation':'observation', 'Trial summary':'trial', 'EHCP contribution':'ehcp' };
          var rt = $('repType');
          var want = typeMap[r.type] || 'progress';
          if(rt) for(var i=0;i<rt.options.length;i++) if(rt.options[i].value===want){ rt.selectedIndex=i; break; }
        }
      }
      $('btnCloseModal').onclick = closeModal;
      $('btnGenRep').onclick = function(){
        var id = $('repClient').value || null;
        $('repBody').value = reportDraftForClient(id);
      };
      $('btnCopyRep').onclick = function(){ navigator.clipboard.writeText($('repBody').value).catch(function(){ alert('Copy manually'); }); };
      $('btnJsonRep').onclick = function(){
        var payload = { type:$('repType').value, client:$('repClient').value||null, body:$('repBody').value, at:new Date().toISOString() };
        var blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'report-draft.json'; a.click();
        URL.revokeObjectURL(a.href);
      };
      $('modalBackdrop').onclick = function(e){ if(e.target=== $('modalBackdrop')) closeModal(); };
    }

    function openComposeModal(preset){
      var types = ['announcement','reminder','urgent','shift change','session change','admin note'];
      var aud = ['all staff','leads','new staff','specific roles','individual users'];
      openModal(
        '<div class="modal-h"><h2 id="modalTitle">Compose notification</h2></div><div class="modal-b">'+
        '<label class="muted">Message</label><textarea class="txa" id="cmpBody" placeholder="Internal message…"></textarea>'+
        '<div class="filter-row" style="margin-top:12px">'+
        '<select class="sel" id="cmpType" style="max-width:180px">'+types.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('')+'</select>'+
        '<select class="sel" id="cmpAud" style="max-width:200px">'+aud.map(function(t){ return '<option value="'+esc(t)+'">'+esc(t)+'</option>'; }).join('')+'</select>'+
        '<select class="sel" id="cmpPri" style="max-width:140px"><option>normal</option><option>high</option><option>urgent</option></select>'+
        '</div><label class="muted" style="display:block;margin-top:10px">Expiry (optional)</label><input type="date" class="inp" id="cmpExp" style="max-width:200px"/></div>'+
        '<div class="modal-f"><button type="button" class="btn btn--ghost" id="btnCmpX">Cancel</button><button type="button" class="btn btn--pri" id="btnCmpSend">Queue message</button></div>'
      );
      if(preset){
        var map = { announcement:'announcement', reminder:'reminder', shift:'shift change', urgent:'urgent' };
        var v = map[preset] || preset;
        var sel = $('cmpType'); if(sel) for(var i=0;i<sel.options.length;i++) if(sel.options[i].value===v){ sel.selectedIndex=i; break; }
      }
      $('btnCmpX').onclick = closeModal;
      $('btnCmpSend').onclick = function(){
        var body = $('cmpBody').value.trim()||'(empty)';
        MOCK.internalFeed.unshift({
          type:$('cmpType').value, audience:$('cmpAud').value, pri:$('cmpPri').value,
          body:body, exp:$('cmpExp').value, at:new Date().toISOString(), source:'Composer'
        });
        pushCommsHistory($('cmpType').value, body.slice(0,100)+(body.length>100?'…':''));
        logAction('manual', 'Notification queued · '+$('cmpType').value, MOCK.profile.name);
        closeModal();
        if(state.view==='communications') setView('communications');
        alert('Demo: message queued in outbox and appended to history.');
      };
      $('modalBackdrop').onclick = function(e){ if(e.target=== $('modalBackdrop')) closeModal(); };
    }

    function openShiftModal(prefSessionId){
      var sess = prefSessionId ? MOCK.operationalSessions.find(function(x){ return x.id===prefSessionId; }) : null;
      var staffOpts = MOCK.staff.map(function(s){
        var sel = sess && sess.staffId===s.id ? ' selected' : '';
        return '<option value="'+esc(s.id)+'"'+sel+'>'+esc(s.name)+'</option>';
      }).join('');
      var aff = sess
        ? '<div class="op-banner" style="margin-bottom:14px"><strong>Affected in this session</strong><p style="margin:0">Staff <strong>'+esc(sess.staff)+'</strong> · '+esc(sess.client)+' · '+esc(sess.programme)+' · '+esc(sess.venue)+'</p></div>'
        : '<p class="muted" style="margin-top:0">No session selected — demo will log a general roster change. Pick a session from Operations for full context.</p>';
      var sumDef = sess ? 'Update · '+sess.when.split('·')[0].trim() : '';
      openModal(
        '<div class="modal-h"><h2 id="modalTitle">Shift & session control</h2></div><div class="modal-b">'+aff+
        '<label class="muted">Staff focus</label><select class="sel" style="max-width:100%;margin-bottom:8px" id="shStaffId">'+staffOpts+'</select>'+
        '<label class="muted">Change summary</label><input class="inp" style="max-width:100%" id="shSum" placeholder="e.g. Swap Thu PM with…" value="'+esc(sumDef)+'" />'+
        '<label class="muted" style="display:block;margin-top:10px">Notes</label><textarea class="txa" id="shNote" style="min-height:72px" placeholder="Handover, parent call, cover name…"></textarea>'+
        '<label class="op-check" style="border:none;padding-top:12px"><input type="checkbox" id="shNotify" checked /> <span>Queue <strong>shift change</strong> to internal outbox (leads)</span></label>'+
        '<input type="hidden" id="shSessId" value="'+esc(sess?sess.id:'')+'" /></div>'+
        '<div class="modal-f"><button type="button" class="btn btn--ghost" id="shX">Close</button>'+
        '<button type="button" class="btn btn--sec" id="shN">Open composer</button><button type="button" class="btn btn--pri" id="shS">Save &amp; log (demo)</button></div>'
      );
      $('shX').onclick = closeModal;
      $('shN').onclick = function(){
        var sn = ($('shSum')&&$('shSum').value)||'';
        closeModal();
        setTimeout(function(){
          openComposeModal('shift');
          var cb = $('cmpBody');
          if(cb && sn) cb.value = '[Shift] '+sn;
        }, 0);
      };
      $('shS').onclick = function(){
        var sid = ($('shSessId')&&$('shSessId').value)||'';
        var summary = (($('shSum')&&$('shSum').value)||'').trim()||'Roster update';
        var note = (($('shNote')&&$('shNote').value)||'').trim();
        var staffId = ($('shStaffId')&&$('shStaffId').value)||'';
        var st = MOCK.staff.find(function(x){ return x.id===staffId; });
        var staffName = st?st.name:'Staff';
        var sObj = sid ? MOCK.operationalSessions.find(function(x){ return x.id===sid; }) : null;
        if(sObj){
          sObj.status = 'Updated';
          if(note) sObj.lastNote = note;
        }
        MOCK.sessionChanges.unshift({ t:staffName+' · '+summary, by:'Admin', st:'logged' });
        pushCommsHistory('Shift change', staffName+' — '+summary);
        if($('shNotify') && $('shNotify').checked){
          MOCK.internalFeed.unshift({
            type:'shift change', audience:'leads', pri:'high',
            body:'[Demo] '+staffName+': '+summary+(note?' — '+note:''),
            at:new Date().toISOString(), source:'Shift control'
          });
        }
        logAction('manual', 'Shift/session saved · '+summary, MOCK.profile.name);
        refreshKpisFromDemo();
        recomputeOperatorSuggestions();
        closeModal();
        setView(state.view==='communications'?'communications':state.view==='staffhr'?'staffhr':'operations');
      };
      $('modalBackdrop').onclick = function(e){ if(e.target=== $('modalBackdrop')) closeModal(); };
    }

    function openNoteModal(){
      var cid = state.drawerClient;
      openModal(
        '<div class="modal-h"><h2 id="modalTitle">Admin note</h2></div><div class="modal-b">'+
        '<textarea class="txa" id="admNote" placeholder="Note attached to client / case…"></textarea></div>'+
        '<div class="modal-f"><button type="button" class="btn btn--ghost" id="nx">Cancel</button><button type="button" class="btn btn--pri" id="ns">Save (demo)</button></div>'
      );
      $('nx').onclick = closeModal;
      $('ns').onclick = function(){
        var t = ($('admNote')&&$('admNote').value||'').trim();
        if(cid && t && MOCK.clientsById[cid]){
          MOCK.clientsById[cid].notes.push(t);
          logAction('manual', 'Admin note added · '+MOCK.clientsById[cid].name, MOCK.profile.name);
        }
        closeModal();
        if(cid) openClientDrawer(cid);
        else if(t) alert('Demo: note saved to general record.');
      };
      $('modalBackdrop').onclick = function(e){ if(e.target=== $('modalBackdrop')) closeModal(); };
    }

    function renderNav(){
      $('adminNav').innerHTML = NAV.map(function(item){
        return '<button type="button" data-view="'+item.id+'"><span class="admin-nav-ico">'+item.ico+'</span> '+esc(item.label)+'</button>';
      }).join('');
      $('adminNav').querySelectorAll('button').forEach(function(b){
        b.addEventListener('click', function(){ setView(b.getAttribute('data-view')); closeSidebarMob(); });
      });
    }

    function closeSidebarMob(){ document.body.classList.remove('sidebar-open'); }

    function renderAlerts(){
      var pop = $('alertsPop');
      pop.innerHTML = '<div class="card-h" style="border-radius:var(--radiusLg) var(--radiusLg) 0 0"><h3 style="margin:0;font-size:14px">Alerts</h3></div>'+
        MOCK.alerts.map(function(a){
          return '<div class="line-item"><div><strong>'+esc(a.title)+'</strong><div class="muted">'+esc(a.sub)+'</div></div><span class="chip chip--urg">'+esc(a.t)+'</span></div>';
        }).join('');
      $('alertBadge').textContent = String(MOCK.alerts.length);
    }

    function toggleAlerts(){ $('alertsPop').classList.toggle('open'); }

    function applyMobilePreview(on, persist){
      var b = document.body, h = document.documentElement;
      h.classList.remove('dev-mobile-preview');
      b.classList.remove('dev-mobile-preview');
      $('viewToggle').setAttribute('aria-checked','false');
      if(persist){ try{ sessionStorage.setItem(KEY_MOBILE,'0'); }catch(e){} }
    }

    function initMobileToggle(){
      applyMobilePreview(false, true);
      $('viewToggle').addEventListener('click', function(){
        applyMobilePreview(false, true);
      });
    }

    function globalSearch(){
      var q = ($('globalSearch').value||'').trim().toLowerCase();
      if(!q) return;
      var hit = Object.keys(MOCK.clientsById).find(function(k){ return MOCK.clientsById[k].name.toLowerCase().indexOf(q)>=0; });
      if(hit){ setView('clients'); setTimeout(function(){ openClientDrawer(hit); }, 0); return; }
      var st = MOCK.staff.find(function(s){ return s.name.toLowerCase().indexOf(q)>=0; });
      if(st){ setView('staffhr'); setTimeout(function(){ openStaffDrawer(st.id); }, 0); return; }
      setView('dashboard');
      alert('Demo: no exact match — try a client or staff name from mock data.');
    }

    function init(){
      $('topDate').textContent = new Date().toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
      $('miniAv').textContent = MOCK.profile.initial;
      $('miniName').textContent = MOCK.profile.name;
      refreshKpisFromDemo();
      recomputeOperatorSuggestions();
      renderNav();
      renderAlerts();
      var hash = (location.hash||'').replace(/^#/,'');
      setView(NAV.some(function(n){ return n.id===hash; }) ? hash : 'dashboard');
      initMobileToggle();
      $('btnMenuMob').addEventListener('click', function(){ document.body.classList.toggle('sidebar-open'); });
      $('sidebarBackdrop').addEventListener('click', closeSidebarMob);
      $('btnAlerts').addEventListener('click', function(e){
        e.stopPropagation();
        toggleAlerts();
      });
      document.addEventListener('click', function(){ $('alertsPop').classList.remove('open'); });
      $('alertsPop').addEventListener('click', function(e){ e.stopPropagation(); });
      $('globalSearch').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); globalSearch(); }});
      $('btnCloseDrawer').addEventListener('click', closeDrawer);
      $('drawerBackdrop').addEventListener('click', closeDrawer);
      $('btnProfileMini').addEventListener('click', function(){ alert('Demo: admin profile / sign-out later.'); });
      document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ closeModal(); closeDrawer(); $('alertsPop').classList.remove('open'); }});
    }

    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  })();
  