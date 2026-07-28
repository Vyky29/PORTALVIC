/* contract-core.js v2.0 — clubSENsational HR Contract Portal
 * Complete UK employment-contract template engine.
 * IIFE exporting global.ContractCore.
 */
(function (global) {
  'use strict';

  /* ================================================================
   *  CONSTANTS
   * ================================================================ */

  var CONTRACT_VERSION = '2.7';
  var ADMIN_RATE = '13';
  var GBP = '\u00A3';
  var EM  = '\u2014';
  var BULLET = '\u2022 ';

  var COMPANY_LEGAL_NAME         = 'clubSENsational LTD';
  var COMPANY_NUMBER             = '13755417';
  var COMPANY_REGISTERED_ADDRESS = '71-75 Shelton Street, Covent Garden, WC2H 9JQ, London, United Kingdom';
  var COMPANY_FOOTER_ADDRESS     = '71-75 Shelton Street, Covent Garden, WC2H 9JQ, London';
  var HR_CONTACT_EMAIL           = 'admin@clubsensational.org';
  var PENSION_SCHEME_NAME        = 'NEST';
  var PENSION_SCHEME_URL         = 'www.nestpensions.org.uk';

  var LOGO_PATH    = 'assets/clubsensational-logo-hq.png?v=3';
  var LOGO_DISPLAY = 'assets/clubsensational-logo-hq.png?v=3';

  var RATE_TABLE = {
    'Specialist Support Worker — Hub & Community': { 'Scale 1': 18, 'Scale 2': 20, 'Scale 3': 23 },
    'Specialist Support Worker — Climbing':       { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 30 },
    'Specialist Support Worker — Fitness':        { 'Scale 1': 24, 'Scale 2': 28, 'Scale 3': 32 },
    'Specialist Support Worker — Swimming':       { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 28 }
  };
  /** Legacy role titles → current RATE_TABLE / JD keys (saved drafts, timesheets, older docs). */
  var ROLE_ALIASES = {
    'Support Worker': 'Specialist Support Worker — Hub & Community',
    'Service Lead': 'Specialist Support Worker — Session Lead',
    'Day Centre Service Lead': 'Specialist Support Worker — Session Lead',
    'Business Development': 'Business Development & Operations',
    'Climbing Instructor': 'Specialist Support Worker — Climbing',
    'Fitness Instructor': 'Specialist Support Worker — Fitness',
    'PT / Fitness Instructor': 'Specialist Support Worker — Fitness',
    'Swimming Instructor': 'Specialist Support Worker — Swimming'
  };
  /** Flat hourly roles (no Scale 1/2/3 picker in the generator). */
  var FLAT_HOURLY_RATES = {
    'Specialist Support Worker — Session Lead': 30,
    'Business Development & Operations': 30
  };
  var SCALE_OPTIONS = ['Scale 1', 'Scale 2', 'Scale 3'];

  function canonicalRoleName(role) {
    var r = String(role || '').trim();
    return ROLE_ALIASES[r] || r;
  }

  function isFlatRateRole(role) {
    var r = canonicalRoleName(role);
    return Object.prototype.hasOwnProperty.call(FLAT_HOURLY_RATES, r);
  }

  function getScaleOptionsForRole(role) {
    var r = canonicalRoleName(role);
    if (isFlatRateRole(r)) return [];
    if (r && RATE_TABLE[r]) return Object.keys(RATE_TABLE[r]);
    return SCALE_OPTIONS.slice();
  }

  function roleNeedsScalePicker(role) {
    return getScaleOptionsForRole(role).length > 1;
  }

  var JOB_DESCRIPTION_VERSION = '2026-07-27';

  var JOB_DESCRIPTIONS = {
    'Specialist Support Worker — Hub & Community': {
      byKind: {
        zero_hours: {
          title: 'Specialist Support Worker — Hub & Community',
          summary:
            'Provide hands-on, person-centred support for children and young people with autism and/or learning disabilities at the clubSENsational Hub and in community activity sessions. Support is ordinarily delivered on a 1:1 or 2:1 basis in a physically active role that requires direct engagement throughout each session, promoting safety, participation, confidence and skill-building.',
          responsibilities: [
            'Prepare and organise Hub and community activity areas before each session so the environment is structured, safe and ready.',
            'Support participants to engage in Hub and community activities, adapting methods to individual abilities, sensory needs and learning styles.',
            'Provide 1:1 or 2:1 supervision as required, offering tailored attention and care throughout the session.',
            'Implement effective engagement and behaviour-support strategies, including for participants with challenging behaviour, while following agreed plans and safeguarding procedures.',
            'Conduct or support relevant health and safety checks before sessions and report concerns promptly.',
            'Assist with personal hygiene where necessary, maintaining dignity and respect.',
            'Offer emotional and behavioural support so participants feel safe, valued and included.',
            'Complete required session feedback, attendance/session records and incident reports promptly after each session (typically up to about 10 minutes per session; included in the Delivery Service rate).',
            'Communicate professionally with families, carers and colleagues; attend induction, planning and supervision as required.',
            'Work collaboratively within the team and model clubSENsational standards.'
          ],
          requirements: [
            'Enhanced DBS check (satisfactory outcome required; barred-list check where applicable).',
            'First Aid at Work certification (or willingness to obtain before / shortly after starting, as directed).',
            'Experience supporting individuals with autism, learning disabilities or special educational needs (ideally at least one year), or a clear willingness to learn autism-specific strategies.',
            'Strong communication and interpersonal skills; ability to adapt support to a range of needs.',
            'Physically able to engage actively throughout sessions.'
          ],
          behaviours: 'Reliable · Professional · Safe practice · Clear communication · Compassionate · Positive team member'
        },
        day_centre_part_time: {
          title: 'Specialist Support Worker — Day Centre',
          summary:
            'Provide high-quality, person-centred support in the Day Centre during Normal Hours of Work. The role supports adults with autism and/or learning disabilities through structured programmes, personal care as required, and a safe, welcoming environment. Support is typically delivered with close, individualised attention (including 1:1 or 2:1 where funded or required).',
          responsibilities: [
            'Facilitate structured Day Centre activities and programmes that promote engagement, independence and wellbeing.',
            'Support participants throughout the day, adapting approaches to individual abilities, sensory needs and behaviour-support plans.',
            'Assist with personal care and support needs as required and trained, maintaining dignity and respect.',
            'Maintain a safe, welcoming and organised environment; follow health and safety and safeguarding procedures.',
            'Implement effective engagement strategies, including for participants with complex or challenging behaviour.',
            'Complete daily records, reports and required session/day feedback as part of the role (covered by salary within Normal Hours; reasonable post-session/end-of-day admin typically up to about 10 minutes unless additional paid time is authorised).',
            'Liaise professionally with families, carers and external professionals.',
            'Work collaboratively with the Session Lead and Day Centre team; attend induction, supervision and training as required.'
          ],
          requirements: [
            'Enhanced DBS check (satisfactory outcome required; barred-list check where applicable).',
            'First Aid at Work certification (or willingness to obtain as directed).',
            'Experience supporting individuals with autism, learning disabilities or special educational needs (ideally at least one year), or a clear willingness to learn autism-specific strategies.',
            'Strong communication and interpersonal skills; ability to adapt support to a range of needs.',
            'Willingness to support personal care where required and trained.'
          ],
          behaviours: 'Reliable · Professional · Safe practice · Clear communication · Compassionate · Positive team member'
        }
      }
    },
    'Specialist Support Worker — Session Lead': {
      byKind: {
        zero_hours: {
          title: 'Specialist Support Worker — Session Lead',
          summary:
            'Provide hands-on, person-centred support for participants with autism and/or learning disabilities and lead the operational delivery of assigned Hub, community or weekend sessions. Work directly with participants as a support worker while owning service quality on shift, coaching the team, and acting as the accountable lead when directors are not on site.',
          responsibilities: [
            'Provide direct 1:1 or 2:1 support to participants during sessions, adapting approaches to individual needs.',
            'Lead and coordinate staff on assigned sessions, including allocation of support and handover of key information.',
            'Model best practice in person-centred support, safeguarding and behaviour support; coach Specialist Support Workers on shift.',
            'Escalate safeguarding concerns, complex behaviour or operational risks appropriately and without delay.',
            'Ensure session environments, equipment checks and health and safety standards are met before and during delivery.',
            'Ensure required session feedback and records are completed to standard (including own and team oversight where appropriate).',
            'Support inductions, buddying and informal training of newer staff.',
            'Contribute to service improvement, communication with families/venues and consistent clubSENsational standards.',
            'Act as the accountable lead on site when directors are unavailable.'
          ],
          requirements: [
            'Enhanced DBS check (satisfactory outcome required; barred-list check where applicable).',
            'Substantial experience supporting individuals with autism and/or learning disabilities in activity, education or care settings.',
            'Demonstrable leadership or shift-lead experience (or clear ability to lead a small team on session).',
            'Strong judgement, communication and de-escalation skills.',
            'First Aid at Work certification (or willingness to obtain as directed).',
            'Relevant activity qualification where the lead role includes specialist activity duties (e.g. swimming, climbing or fitness).'
          ],
          behaviours: 'Leadership · Hands-on support · Judgement · Accountability · Coaching · Calm under pressure'
        },
        day_centre_part_time: {
          title: 'Specialist Support Worker — Session Lead (Day Centre)',
          summary:
            'Lead the daily operation of the Day Centre while providing hands-on support to participants, coordinating staff and resources across venues as required, owning service quality, and delivering a safe, structured and person-centred day programme for adults with autism and/or learning disabilities.',
          responsibilities: [
            'Lead the daily operation of the Day Centre within Normal Hours of Work, including staff allocation and venue coordination.',
            'Coach and mentor the Day Centre team; set clear expectations and model best practice.',
            'Support complex behaviours and safeguarding decisions; escalate appropriately and record accurately.',
            'Oversee participant programmes, daily structure and documentation quality, including required feedback and records.',
            'Ensure health and safety, environment readiness and appropriate use of equipment and resources.',
            'Liaise with families, carers and external professionals as required.',
            'Contribute to recruitment support, inductions, training and service development.',
            'Act as the accountable senior when directors are unavailable.'
          ],
          requirements: [
            'Enhanced DBS check (satisfactory outcome required; barred-list check where applicable).',
            'Substantial experience supporting adults with autism and/or learning disabilities in day services, education or care.',
            'Proven ability to lead or supervise a staff team.',
            'Strong safeguarding judgement, communication and organisational skills.',
            'First Aid at Work certification (or willingness to obtain as directed).',
            'Willingness to support and oversee personal care standards within the service.'
          ],
          behaviours: 'Leadership · Judgement · Accountability · Coaching · Calm under pressure · Service improvement'
        }
      }
    },
    'Specialist Support Worker — Climbing': {
      default: {
        title: 'Specialist Support Worker — Climbing',
        summary:
          'Provide specialist, person-centred support through inclusive climbing sessions for clubSENsational participants, including individuals with autism and/or learning disabilities. Sessions are ordinarily 1:1 or 2:1. This is a physically active welfare support role requiring direct, hands-on engagement throughout each session in a safe, adaptive environment.',
        responsibilities: [
          'Prepare and organise the climbing area before sessions, ensuring equipment is set up and functional.',
          'Deliver structured climbing sessions adapted to individual needs, progress and sensory preferences.',
          'Use climbing aids and visual tools to support engagement and learning.',
          'Implement health and safety guidelines; conduct equipment checks before each session and report safety concerns.',
          'Provide 1:1 or 2:1 supervision and hands-on support throughout the session.',
          'Support participants with challenging behaviour using effective engagement and behaviour-support strategies, following agreed plans.',
          'Complete required session feedback, records and incident reports promptly after each session (typically up to about 10 minutes per session; included in the Delivery Service rate).',
          'Communicate professionally with families and colleagues; attend required training, induction and supervision.'
        ],
        requirements: [
          'Recognised climbing instructor qualification (e.g. CWI, SPI or equivalent).',
          'First Aid at Work certification.',
          'Enhanced DBS check (satisfactory outcome required).',
          'Experience working with individuals with autism, learning disabilities or SEN (or clear willingness to develop adaptive climbing practice).',
          'Strong communication skills and ability to adapt teaching methods to a range of abilities.'
        ],
        behaviours: 'Safety-first · Clear instruction · Patient · Adaptive · Professional · Team-oriented'
      }
    },
    'Specialist Support Worker — Fitness': {
      default: {
        title: 'Specialist Support Worker — Fitness',
        summary:
          'Provide specialist, person-centred support through inclusive fitness sessions for clubSENsational participants, including individuals with autism and/or learning disabilities. Sessions are ordinarily 1:1 or 2:1. This is a physically active welfare support role requiring direct, hands-on engagement throughout each session to promote health, confidence and participation.',
        responsibilities: [
          'Prepare and organise the fitness area before sessions, ensuring equipment is set up and functional.',
          'Deliver structured fitness sessions adapted to individual needs, progress levels and sensory preferences.',
          'Use teaching aids and visual tools to enhance engagement.',
          'Implement health and safety guidelines; conduct equipment checks before each session and report safety concerns.',
          'Provide 1:1 or 2:1 supervision and hands-on support throughout the session.',
          'Support participants with challenging behaviour using effective engagement and behaviour-support strategies, following agreed plans.',
          'Complete required session feedback, records and incident reports promptly after each session (typically up to about 10 minutes per session; included in the Delivery Service rate).',
          'Communicate professionally with families and colleagues; attend required training, induction and supervision.'
        ],
        requirements: [
          'Recognised Level 2 Fitness Instructor or Personal Training qualification (or equivalent demonstrating ability to deliver fitness safely).',
          'First Aid at Work certification.',
          'Enhanced DBS check (satisfactory outcome required).',
          'Experience working with individuals with autism, learning disabilities or SEN (or clear willingness to develop adaptive fitness practice).',
          'Strong communication skills and ability to adapt routines to a range of abilities and learning styles.'
        ],
        behaviours: 'Motivational · Safety-first · Adaptive · Professional · Team-oriented'
      }
    },
    'Specialist Support Worker — Swimming': {
      default: {
        title: 'Specialist Support Worker — Swimming',
        summary:
          'Provide specialist, person-centred support through inclusive swimming sessions for clubSENsational participants, including individuals with autism and/or learning disabilities. Sessions are ordinarily 1:1 or 2:1. This is a physically active welfare support role: the worker is in the water for each session, providing direct, hands-on support and adapted aquatic instruction.',
        responsibilities: [
          'Prepare and organise the swimming area before sessions.',
          'Deliver structured swimming sessions adapted to individual needs and progress levels.',
          'Use teaching aids (including PIXTOLEARN Swimming where applicable) to enhance engagement.',
          'Implement health and safety guidelines; conduct equipment checks before each session and report safety concerns.',
          'Provide 1:1 or 2:1 in-water supervision and support throughout the session.',
          'Support participants with challenging behaviour using effective engagement strategies, following agreed plans and safeguarding procedures.',
          'Complete required session feedback, records and incident reports promptly after each session (typically up to about 10 minutes per session; included in the Delivery Service rate).',
          'Communicate professionally with families and colleagues; attend required training, induction and supervision.'
        ],
        requirements: [
          'Swim England / STA Level 2 Swimming Teacher (or equivalent) qualification.',
          'National Rescue Award for Swimming Teachers (NRASTC) or equivalent rescue award as required for teaching.',
          'Enhanced DBS check (satisfactory outcome required).',
          'Experience working with individuals with autism, learning disabilities or SEN (or clear willingness to develop adaptive swimming practice).',
          'Strong communication skills and ability to adapt teaching methods to a range of abilities and learning styles.',
          'Physically able to deliver sessions in the water.'
        ],
        behaviours: 'Safety-first · Clear instruction · Patient · Adaptive · Professional · Team-oriented'
      }
    },
    'Business Development & Operations': {
      default: {
        title: 'Business Development & Operations',
        summary:
          'Drive growth, partnerships and commissioning opportunities for clubSENsational, and lead core organisational operations including HR administration, people processes and day-to-day admin so the service can grow sustainably. The role also supports Business Development for PIXTOLEARN where assigned.',
        responsibilities: [
          'Identify and pursue new funding, contracts and partnership opportunities for clubSENsational (and PIXTOLEARN where assigned).',
          'Build and maintain relationships with commissioners, local authorities, schools, venues and partner organisations.',
          'Prepare tenders, proposals, impact materials and follow-up communications as required.',
          'Support leadership with pipeline tracking, meetings and conversion of opportunities.',
          'Coordinate HR and people operations (onboarding support, contract administration, staff records and related processes) as directed.',
          'Manage day-to-day organisational administration, systems and follow-up so operations run smoothly.',
          'Complete required records and feedback on meetings, people processes and outcomes as directed.',
          'Uphold confidentiality, safeguarding awareness and professional standards in all internal and external engagement.',
          'Work collaboratively with operational leads so growth aligns with service capacity and quality.'
        ],
        requirements: [
          'Strong written and verbal communication skills; confident engaging external stakeholders.',
          'Experience in business development, fundraising, commissioning, sales, partnership, HR administration or operations roles (or transferable equivalent).',
          'Organised, self-directed working style with attention to deadlines, confidentiality and follow-up.',
          'Ability to represent clubSENsational\'s mission and values professionally.',
          'Enhanced DBS check where the role involves regulated activity or as otherwise required by the Employer.'
        ],
        behaviours: 'Proactive · Clear communicator · Organised · Relationship-focused · Accountable · Discreet'
      }
    }
  };

  function resolveJobDescription(role, kind) {
    var entry = JOB_DESCRIPTIONS[canonicalRoleName(role)];
    if (!entry) return null;
    var k = normalizeContractKind(kind);
    if (entry.byKind) {
      if (entry.byKind[k]) return entry.byKind[k];
      if (entry.byKind.zero_hours) return entry.byKind.zero_hours;
      var keys = Object.keys(entry.byKind);
      if (keys.length) return entry.byKind[keys[0]];
    }
    return entry.default || null;
  }

  function buildJobDescriptionsForRoles(roles, kind) {
    var list = [];
    var seen = {};
    (roles || []).forEach(function (role) {
      var r = String(role || '').trim();
      if (!r || seen[r]) return;
      seen[r] = true;
      var jd = resolveJobDescription(r, kind);
      if (jd) list.push({ role: r, jd: jd });
    });
    return list;
  }

  function formatJobDescriptionsPlain(roles, kind) {
    var items = buildJobDescriptionsForRoles(roles, kind);
    if (!items.length) return '';
    var lines = [];
    items.forEach(function (item, idx) {
      if (idx) lines.push('');
      lines.push(item.jd.title || item.role);
      if (item.jd.summary) lines.push(item.jd.summary);
      lines.push('Key responsibilities:');
      (item.jd.responsibilities || []).forEach(function (r) { lines.push(BULLET + r); });
      if (item.jd.requirements && item.jd.requirements.length) {
        lines.push('Essential requirements:');
        item.jd.requirements.forEach(function (r) { lines.push(BULLET + r); });
      }
      if (item.jd.behaviours) lines.push('Expected behaviour: ' + item.jd.behaviours);
    });
    return lines.join('\n');
  }

  function escapeJdHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatJobDescriptionsHtml(roles, kind) {
    var items = buildJobDescriptionsForRoles(roles, kind);
    if (!items.length) {
      return '<p class="muted">Select one or more roles to preview the job description.</p>';
    }
    return items.map(function (item) {
      var jd = item.jd;
      var lis = (jd.responsibilities || []).map(function (r) {
        return '<li>' + escapeJdHtml(r) + '</li>';
      }).join('');
      var req = (jd.requirements || []).map(function (r) {
        return '<li>' + escapeJdHtml(r) + '</li>';
      }).join('');
      return (
        '<article class="jd-card">' +
        '<h4>' + escapeJdHtml(jd.title || item.role) + '</h4>' +
        '<p class="jd-summary">' + escapeJdHtml(jd.summary || '') + '</p>' +
        '<p class="jd-label">Key responsibilities</p>' +
        '<ul>' + lis + '</ul>' +
        (req
          ? '<p class="jd-label">Essential requirements</p><ul>' + req + '</ul>'
          : '') +
        (jd.behaviours
          ? '<p class="jd-behaviours"><strong>Expected behaviour:</strong> ' +
            escapeJdHtml(jd.behaviours) + '</p>'
          : '') +
        '</article>'
      );
    }).join('');
  }

  function clauseAnnexJobDescription() {
    return [
      'ANNEX B ' + EM + ' JOB DESCRIPTION(S)',
      'The following job description(s) form part of this Agreement and describe the Employee\'s role. Duties may be updated by the Employer in line with the Job Title and Description section of this Agreement.',
      'Job description version: ' + JOB_DESCRIPTION_VERSION,
      '{{JOB_DESCRIPTIONS_PLAIN}}'
    ];
  }


  var ACTIVE_CONTRACT_KINDS = [
    'zero_hours',
    'day_centre_part_time',
    'full_time',
    'fixed_term'
  ];

  /* ================================================================
   *  LAYOUT / RENDER TOKENS
   * ================================================================ */

  var PARTY_BLOCKS     = ['EMPLOYEE DETAILS:', 'EMPLOYER DETAILS:'];
  var SIGNATURE_BLOCKS = ['EMPLOYEE SIGNATURE', 'DIRECTOR SIGNATURE'];
  var SECTION_HEADERS  = new Set([
    'BACKGROUND:',
    'PARTICULARS OF EMPLOYMENT',
    'COMMENCEMENT DATE AND TERM',
    'SCOPE OF THIS AGREEMENT',
    'JOB TITLE AND DESCRIPTION',
    'EMPLOYEE REMUNERATION',
    'PENSION',
    'PLACE OF WORK',
    'TIME OF WORK',
    'NO EXCLUSIVITY',
    'PROBATION PERIOD',
    'FIXED-TERM EMPLOYEE TREATMENT',
    'PART-TIME WORKER TREATMENT',
    'SICKNESS AND DISABILITY',
    'HOLIDAY ENTITLEMENT',
    'WORKING TIME',
    'OTHER PAID LEAVE',
    'DISCIPLINARY PROCEDURE',
    'GRIEVANCE PROCEDURE',
    'SAFEGUARDING AND DBS',
    'DATA PROTECTION',
    'CONFIDENTIAL INFORMATION',
    'OWNERSHIP OF CONFIDENTIAL INFORMATION',
    'RETURN OF CONFIDENTIAL INFORMATION',
    'CONTRACT BINDING AUTHORITY',
    'COLLECTIVE AGREEMENTS',
    'TRAINING',
    'OTHER BENEFITS',
    'TERMINATION OF EMPLOYMENT',
    'GOVERNING LAW',
    'GENERAL PROVISIONS',
    'SIGNATURES',
    'ACKNOWLEDGEMENT'
  ]);

  function isSectionHeader(line) {
    var t = (line || '').trim();
    if (!t) return false;
    if (SECTION_HEADERS.has(t)) return true;
    return t.indexOf('WRITTEN PARTICULARS') === 0 || t.indexOf('ANNEX A') === 0 || t.indexOf('ANNEX B') === 0;
  }

  function isBulletLine(line) {
    return /^\s*[\u2022\u00B7]\s+/.test(line || '') || /^\s*[-–]\s+/.test(line || '');
  }

  function stripBulletPrefix(line) {
    return String(line || '')
      .replace(/^\s*[\u2022\u00B7]\s+/, '')
      .replace(/^\s*[-–]\s+/, '')
      .trim();
  }

  /** Turn section body lines into paragraphs + <ul> for consecutive bullet lines. */
  function renderSectionBodyHtml(rest) {
    var lines = String(rest || '').split('\n');
    var html = '';
    var i = 0;
    while (i < lines.length) {
      var raw = lines[i];
      if (!String(raw).trim()) {
        i += 1;
        continue;
      }
      if (isBulletLine(raw)) {
        html += '<ul class="contract-bullets">';
        while (i < lines.length && isBulletLine(lines[i])) {
          html += '<li>' + applyFilledHtml(stripBulletPrefix(lines[i])) + '</li>';
          i += 1;
        }
        html += '</ul>';
        continue;
      }
      html += '<p>' + applyFilledHtml(raw) + '</p>';
      i += 1;
    }
    return html || '<p></p>';
  }

  /* Markers wrap filled template values so preview/PDF can emphasise them. */
  var FILL_OPEN = '\uFFF0';
  var FILL_CLOSE = '\uFFF1';
  var FILL_SKIP_HIGHLIGHT = {
    JOB_DESCRIPTIONS_HTML: true,
    JOB_DESCRIPTIONS_PLAIN: true,
    DUTIES_DESCRIPTION: true,
    CONCURRENT_CLAUSE: true,
    SUPERSEDE_CLAUSE: true,
    EMPLOYEE_SIGNATURE: true,
    DIRECTOR_SIGNATURE: true,
    EMPLOYEE_ACKNOWLEDGEMENT: true,
    CONTRACT_VERSION: true,
    CONTRACT_KIND: true,
    GENERATED_DATE: true,
    _contractDateRaw: true
  };

  function markFilledValue(value) {
    var v = String(value == null ? '' : value);
    if (!v || v === EM) return v;
    return v.split('\n').map(function (line) {
      if (!String(line).trim()) return line;
      return FILL_OPEN + line + FILL_CLOSE;
    }).join('\n');
  }

  function stripFilledMarkers(text) {
    return String(text || '').split(FILL_OPEN).join('').split(FILL_CLOSE).join('');
  }

  function applyFilledHtml(text) {
    return String(text || '')
      .split(FILL_OPEN).join('<span class="contract-filled">')
      .split(FILL_CLOSE).join('</span>');
  }

  /* ================================================================
   *  CONTRACT-KIND HELPERS
   * ================================================================ */

  function normalizeContractKind(kind) {
    var k = String(kind || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (k === 'zero_hours' || k === 'zerohours') return 'zero_hours';
    if (k === 'day_centre_part_time' || k === 'daycentre' || k === 'day_centre') return 'day_centre_part_time';
    if (k === 'full_time' || k === 'fulltime') return 'full_time';
    if (k === 'fixed_term' || k === 'fixedterm') return 'fixed_term';
    if (k === 'permanent_part_time' || k === 'permanentparttime') return 'permanent_part_time';
    return 'zero_hours';
  }

  function isSalariedKind(kind) {
    var k = normalizeContractKind(kind);
    return k === 'day_centre_part_time' || k === 'full_time' || k === 'fixed_term' || k === 'permanent_part_time';
  }

  function isZeroHoursKind(kind) {
    return normalizeContractKind(kind) === 'zero_hours';
  }

  function contractKindLabel(kind) {
    var map = {
      zero_hours: 'Zero Hours',
      day_centre_part_time: 'Part-Time (Day Centre)',
      full_time: 'Full-Time',
      fixed_term: 'Fixed-Term',
      permanent_part_time: 'Permanent Part-Time (Legacy)'
    };
    return map[normalizeContractKind(kind)] || 'Unknown';
  }

  /* ================================================================
   *  DATE / FORMAT HELPERS
   * ================================================================ */

  function formatUKDate(d) {
    if (!d) return EM;
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function formatShortUKDate(d) {
    if (!d) return EM;
    var dt = new Date(d + 'T12:00:00');
    var day = String(dt.getDate()).padStart(2, '0');
    var month = String(dt.getMonth() + 1).padStart(2, '0');
    return day + '/' + month + '/' + dt.getFullYear();
  }

  function formatDateTime() {
    return new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function formatSalary(amount) {
    if (amount == null || amount === '') return EM;
    var n = Number(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return EM;
    return GBP + n.toLocaleString('en-GB');
  }

  function formatWorkDaysList(days) {
    if (!days || !days.length) return '';
    if (days.length === 1) return days[0];
    if (days.length === 2) return days[0] + ' and ' + days[1];
    return days.slice(0, -1).join(', ') + ' and ' + days[days.length - 1];
  }

  /* ================================================================
   *  REFERENCE GENERATOR
   * ================================================================ */

  function generateReference(employeeName, kind, dateIso) {
    var k = normalizeContractKind(kind);
    var prefixMap = {
      zero_hours: 'ZH',
      day_centre_part_time: 'DC',
      full_time: 'PF',
      fixed_term: 'FX',
      permanent_part_time: 'PP'
    };
    var prefix = prefixMap[k] || 'ZH';
    var raw   = String(employeeName || '').trim();
    var first = raw.split(/\s+/).filter(Boolean)[0] || 'Staff';
    var namePart = first.replace(/[^a-zA-Z]/g, '');
    var capName  = namePart
      ? namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase()
      : 'Staff';
    var d;
    var iso = String(dateIso || '').trim().slice(0, 10);
    if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      d = new Date(iso + 'T12:00:00');
    } else {
      d = new Date();
    }
    if (Number.isNaN(d.getTime())) d = new Date();
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var day = String(d.getDate()).padStart(2, '0');
    var datePart = day + months[d.getMonth()] + String(d.getFullYear()).slice(-2);
    return prefix + '-' + capName + '-' + datePart;
  }

  /* ================================================================
   *  ROLE / REMUNERATION HELPERS
   * ================================================================ */

  function getDeliveryRate(role, scale) {
    var r = canonicalRoleName(role);
    if (isFlatRateRole(r)) return FLAT_HOURLY_RATES[r];
    return (r && scale && RATE_TABLE[r]) ? RATE_TABLE[r][scale] : null;
  }

  function normalizeRoles(o) {
    var src = o || {};
    if (Array.isArray(src.roles) && src.roles.length) {
      return src.roles.map(function (r) { return canonicalRoleName(r); }).filter(Boolean);
    }
    if (src.role && String(src.role).trim()) {
      return String(src.role).split(/\s*&\s*/).map(function (r) { return canonicalRoleName(r); }).filter(Boolean);
    }
    return [];
  }

  function formatJobTitles(roles, kind) {
    if (!roles || !roles.length) return '';
    return roles
      .map(function (role) {
        var jd = resolveJobDescription(role, kind);
        return (jd && jd.title) ? jd.title : canonicalRoleName(role);
      })
      .join(' & ');
  }

  function normalizeRoleScales(o, roles) {
    var src = o || {};
    var roleList = roles || normalizeRoles(src);
    var out = {};
    if (src.roleScales && typeof src.roleScales === 'object' && !Array.isArray(src.roleScales)) {
      roleList.forEach(function (role) {
        var scale = src.roleScales[role] || src.roleScales[canonicalRoleName(role)];
        if (!scale) {
          Object.keys(ROLE_ALIASES).forEach(function (legacy) {
            if (ROLE_ALIASES[legacy] === role && src.roleScales[legacy]) scale = src.roleScales[legacy];
          });
        }
        if (scale) out[role] = String(scale);
      });
      return out;
    }
    if (Array.isArray(src.roleScales)) {
      src.roleScales.forEach(function (entry) {
        if (entry && entry.role && entry.scale) out[String(entry.role)] = String(entry.scale);
      });
      return out;
    }
    if (src.scale) {
      roleList.forEach(function (role) { out[role] = String(src.scale); });
    }
    return out;
  }

  function formatRoleScaleSummary(roleScales, roles) {
    return (roles || [])
      .map(function (role) {
        if (isFlatRateRole(role)) {
          return role + ' (' + GBP + FLAT_HOURLY_RATES[role] + '/h)';
        }
        var scale = roleScales && roleScales[role];
        return scale ? role + ' (' + scale + ')' : role;
      })
      .filter(Boolean)
      .join('; ');
  }

  function buildDeliveryRemuneration(roles, scales) {
    var lines = [];
    var scaleMap = typeof scales === 'string'
      ? Object.fromEntries((roles || []).map(function (role) { return [role, scales]; }))
      : (scales || {});
    (roles || []).forEach(function (role) {
      if (isFlatRateRole(role)) {
        lines.push(GBP + FLAT_HOURLY_RATES[role] + '/h Delivery Service (' + role + ')');
        return;
      }
      var scale = scaleMap[role];
      var rate  = getDeliveryRate(role, scale);
      if (rate != null && scale) {
        lines.push(GBP + rate + '/h Delivery Service (' + scale + ' ' + EM + ' ' + role + ')');
      }
    });
    lines.push(
      GBP + ADMIN_RATE + '/h (Reviewed annually in line with Minimum Wage) ' + EM + ' Administrative Tasks, Inductions and Training.'
    );
    return lines.join('\n');
  }

  /* ================================================================
   *  SHARED LEGAL CLAUSE BUILDERS
   *  Each returns an array of template lines.
   *  An empty string '' produces a paragraph break when joined.
   * ================================================================ */

  function clauseOpening() {
    return [
      'THIS EMPLOYMENT CONTRACT dated {{CONTRACT_DATE}}', '',
      'BETWEEN:', '',
      'EMPLOYEE DETAILS:',
      'Full Name: {{EMPLOYEE_FULL_NAME}}',
      'Address: {{EMPLOYEE_ADDRESS}}',
      'Email: {{EMPLOYEE_EMAIL}}', '',
      'EMPLOYER DETAILS:',
      COMPANY_LEGAL_NAME,
      COMPANY_REGISTERED_ADDRESS,
      'Registered Company No. ' + COMPANY_NUMBER
    ];
  }

  function clauseBackground() {
    return [
      'BACKGROUND:',
      'The Employer is of the opinion that the Employee has the necessary qualifications, experience and abilities to assist and benefit the Employer in its business.',
      'The Employer desires to employ the Employee and the Employee has agreed to accept and enter such employment upon the terms and conditions set out in this Agreement.',
      'IN CONSIDERATION OF the matters described above and of the mutual benefits and obligations set forth in this Agreement, the receipt and sufficiency of which consideration is hereby acknowledged, the parties agree as follows:'
    ];
  }

  function clauseParticulars() {
    return [
      'PARTICULARS OF EMPLOYMENT',
      "As required by section 1 of the Employment Rights Act 1996, the particulars of the Employee's employment are set out in this Agreement."
    ];
  }

  function clausePension() {
    return [
      'PENSION',
      "The Employer will meet its automatic enrolment duties under the Pensions Act 2008. The Employer's current qualifying workplace pension scheme is " + PENSION_SCHEME_NAME + " (" + PENSION_SCHEME_URL + "), or such other qualifying scheme as the Employer may nominate from time to time. Where required by law, eligible employees will be automatically enrolled into that scheme. Eligibility is assessed on earnings paid by this Employer only. Further details are set out in Annex A and are available via the Staff Portal or " + HR_CONTACT_EMAIL + "."
    ];
  }

  function clauseWorkingTime() {
    return [
      'WORKING TIME',
      "The Employee may opt out of the 48-hour average weekly working time limit under regulation 4 of the Working Time Regulations 1998 by giving written notice to the Employer. Any such opt-out may be terminated by the Employee giving not less than seven days' written notice (or such longer period, up to three months, as agreed in writing). The Employer will keep records as required by the Regulations."
    ];
  }

  function clauseOtherPaidLeave() {
    return [
      'OTHER PAID LEAVE',
      'Statutory entitlements to family-related leave (including maternity, paternity, adoption, shared parental and parental bereavement leave and pay) apply where the Employee meets the qualifying conditions. Further information is set out in the Staff Handbook and the Employer\'s policies (Policies Portal); questions via the Staff Portal or ' + HR_CONTACT_EMAIL + '.'
    ];
  }

  function clauseSicknessZeroHours() {
    return [
      'SICKNESS AND DISABILITY',
      BULLET + 'If the Employee is unable to perform their duties as a result of illness or injury, the Employee will inform the Company Director by email no later than the night before, or not later than 7:00 am on the day of the absence.',
      BULLET + 'If the Employee satisfies the qualifying conditions for Statutory Sick Pay (SSP) under UK law, they will be entitled to receive SSP for any period of sickness or injury during agreed hours. No contractual sick pay is payable unless stated in a separate policy.'
    ];
  }

  function clauseSicknessSalaried() {
    return [
      'SICKNESS AND DISABILITY',
      BULLET + 'If the Employee is unable to perform their duties as a result of illness or injury, the Employee will inform the Company Director by email no later than 7:00 am on the day of the absence.',
      BULLET + "Subject to compliance with this Agreement and the Employer's Sickness Policy, the Employee shall receive sick pay in accordance with the Sickness Policy, which may be amended from time to time. Qualifying days for SSP purposes are Monday to Friday."
    ];
  }

  function clauseDisciplinary() {
    return [
      'DISCIPLINARY PROCEDURE',
      BULLET + "The Employer's disciplinary procedure, as amended from time to time, applies to the Employee.",
      BULLET + 'The disciplinary procedure is set out in the Employer\'s Disciplinary Policy (see also the Staff Handbook) and will be provided to the Employee or made available on request.'
    ];
  }

  function clauseGrievance() {
    return [
      'GRIEVANCE PROCEDURE',
      BULLET + "The Employer's grievance procedure, as amended from time to time, applies to the Employee.",
      BULLET + 'The grievance procedure is set out in the Employer\'s Grievance Policy (see also the Staff Handbook) and will be provided to the Employee or made available on request.'
    ];
  }

  function clauseSafeguardingDBS() {
    return [
      'SAFEGUARDING AND DBS',
      BULLET + "The Employee acknowledges that their role may involve regulated activity with children and/or vulnerable adults. The Employer will apply for an enhanced Disclosure and Barring Service (DBS) check (with barred-list check where applicable) before the Employee commences regulated duties, and may require further checks at intervals or where there is cause.",
      BULLET + 'The Employee must disclose any relevant convictions, cautions, reprimands or warnings (including those that are not "protected" under the Rehabilitation of Offenders Act 1974 (Exceptions) Order) before starting work and promptly upon any change.',
      BULLET + 'Employment is conditional on a satisfactory DBS disclosure. Failure to disclose relevant information, or an unsatisfactory disclosure, may result in withdrawal of any offer or summary dismissal.',
      BULLET + "The Employee will comply with the Employer's Safeguarding Policy and report any safeguarding concern to the Designated Safeguarding Lead without delay."
    ];
  }

  function clauseDataProtection() {
    return [
      'DATA PROTECTION',
      BULLET + "The Employer will process personal data relating to the Employee in accordance with its Data Protection Policy and the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018.",
      BULLET + "The Employee consents to the Employer processing such data for the purposes of employment administration, payroll, pensions, DBS checks, health and safety, equal opportunities monitoring and any other lawful purpose connected with the employment.",
      BULLET + "Details of the personal data held, the purposes of processing, and the Employee's rights under data protection legislation are set out in the Employee Privacy Notice, available via the Staff Portal or " + HR_CONTACT_EMAIL + "."
    ];
  }

  function clauseConfidentiality() {
    return [
      'CONFIDENTIAL INFORMATION',
      BULLET + 'The Employee acknowledges that, during employment, they may access confidential information belonging to the Employer.',
      BULLET + 'The Employee agrees to keep all confidential information strictly confidential and not to disclose, use or share such information except as required for the proper performance of their duties or as authorised by the Employer.',
      BULLET + 'This obligation will continue after the end of employment.', '',
      'OWNERSHIP OF CONFIDENTIAL INFORMATION',
      'All confidential information, documents, materials, systems, resources and work-related information remain the property of the Employer.', '',
      'RETURN OF CONFIDENTIAL INFORMATION',
      'Upon request, or upon termination of employment, the Employee must return all confidential information, documents, equipment, materials and records belonging to the Employer.'
    ];
  }

  function clauseBindingAuthority() {
    return [
      'CONTRACT BINDING AUTHORITY',
      'The Employee does not have authority to enter into contracts or commitments on behalf of the Employer without prior written consent.'
    ];
  }

  function clauseCollectiveAgreements() {
    return [
      'COLLECTIVE AGREEMENTS',
      "There are no collective agreements in force that directly affect the terms and conditions of the Employee's employment."
    ];
  }

  function clauseTraining() {
    return [
      'TRAINING',
      BULLET + 'The Employer may require the Employee to undertake training relevant to the role, including mandatory safeguarding, health and safety and equality training.',
      BULLET + 'Reasonable training costs will be met by the Employer.',
      BULLET + 'Details of any training obligation and any repayment clause will be notified in writing before the training commences.'
    ];
  }

  function clauseOtherBenefits() {
    return [
      'OTHER BENEFITS',
      'There are no other benefits provided by the Employer at this time, other than those specified in this Agreement. The Employer may introduce additional benefits at its discretion, details of which will be communicated in writing.'
    ];
  }

  function clauseGoverningLaw() {
    return [
      'GOVERNING LAW',
      'This Agreement will be construed in accordance with and governed by the laws of England and Wales.'
    ];
  }

  function clauseGeneralProvisions() {
    return [
      'GENERAL PROVISIONS',
      BULLET + '{{CONCURRENT_CLAUSE}}',
      BULLET + 'Any amendment or modification to this Agreement will only be binding if evidenced in writing and signed by both parties or their authorised representatives.',
      BULLET + '{{SUPERSEDE_CLAUSE}}'
    ];
  }

  function clauseSignatures() {
    return [
      'SIGNATURES',
      'By signing below, the Employee confirms that they have read, understood and agreed to the terms of this Employment Contract, including the workplace pension information at Annex A and the job description(s) at Annex B.', '',
      'EMPLOYEE SIGNATURE',
      'Name: {{EMPLOYEE_FULL_NAME}}',
      'Date: {{EMPLOYEE_SIGNATURE_DATE}}',
      'Signature: {{EMPLOYEE_SIGNATURE}}', '',
      'DIRECTOR SIGNATURE',
      'Name: {{DIRECTOR_NAME}}',
      'Date: {{DIRECTOR_SIGNATURE_DATE}}',
      'Signature: {{DIRECTOR_SIGNATURE}}', '',
      'ACKNOWLEDGEMENT',
      'I confirm that I have read, understood and agree to the terms of this employment contract, that I have received the workplace pension information at Annex A, and that I have read and understood the job description(s) at Annex B.'
    ];
  }

  function clauseAnnexPension(kind) {
    var k = normalizeContractKind(kind);
    var labelMap = {
      zero_hours: 'zero-hours',
      day_centre_part_time: 'part-time day centre',
      full_time: 'full-time',
      fixed_term: 'fixed-term',
      permanent_part_time: 'part-time'
    };
    var kindLabel = labelMap[k] || 'employment';

    var positionParagraph = (k === 'zero_hours')
      ? 'You are employed on a zero-hours contract. You may not be automatically enrolled when you start if your earnings from clubSENsational are below the automatic enrolment threshold. This is common where staff also work for other employers.'
      : 'You are employed on a ' + kindLabel + ' salaried contract. If your qualifying earnings from clubSENsational exceed the automatic enrolment earnings trigger in a pay reference period, you will be automatically enrolled into our workplace pension scheme (' + PENSION_SCHEME_NAME + ').';

    return [
      'ANNEX A ' + EM + ' WORKPLACE PENSION (AUTO-ENROLMENT INFORMATION)',
      'Date: {{CONTRACT_DATE}}',
      'To: {{EMPLOYEE_FULL_NAME}} ({{EMPLOYEE_EMAIL}})',
      'From: ' + COMPANY_LEGAL_NAME + ', ' + COMPANY_REGISTERED_ADDRESS,
      'Dear {{EMPLOYEE_FULL_NAME}},',
      'This letter is issued with your ' + kindLabel + ' employment contract to explain how workplace pension automatic enrolment applies to your employment with clubSENsational Ltd. We are required by UK law (the Pensions Act 2008) to operate qualifying workplace pension arrangements and to give you this information within six weeks of starting work with us.',
      'OUR WORKPLACE PENSION SCHEME',
      'Our current qualifying workplace pension scheme is ' + PENSION_SCHEME_NAME + '. Further information about ' + PENSION_SCHEME_NAME + ' is available at ' + PENSION_SCHEME_URL + '. The Employer may nominate a different qualifying scheme from time to time; if that happens, we will tell you in writing.',
      'HOW AUTO-ENROLMENT WORKS',
      'Automatic enrolment means eligible workers are enrolled into a workplace pension scheme unless they choose to opt out within one month. Your eligibility is assessed using qualifying earnings paid by clubSENsational only. Earnings from any other employer are not counted, even if you have a higher salary elsewhere.',
      'For the current tax year, the main earnings threshold for automatic enrolment is ' + GBP + '10,000 per year from this Employer (' + GBP + '833 per month or ' + GBP + '192 per week). The lower qualifying earnings threshold is ' + GBP + '6,240 per year (' + GBP + '520 per month or ' + GBP + '120 per week).',
      'YOUR CURRENT POSITION',
      positionParagraph,
      'We will assess your earnings from clubSENsational on each payday. If you meet the eligibility criteria in a pay reference period, we will automatically enrol you into ' + PENSION_SCHEME_NAME + ' (or such other qualifying scheme as then applies) and write to you, unless a lawful postponement applies.',
      'YOUR RIGHTS',
      BULLET + 'If you earn more than ' + GBP + '10,000 per year from clubSENsational and are aged at least 22 but under State Pension Age: we must automatically enrol you and pay employer pension contributions (minimum 3% of qualifying earnings, subject to scheme rules).',
      BULLET + 'If you earn between ' + GBP + '6,240 and ' + GBP + '10,000 per year from clubSENsational: you may opt in to our workplace pension scheme (' + PENSION_SCHEME_NAME + '). If you opt in, we must pay employer contributions.',
      BULLET + 'If you earn below ' + GBP + '6,240 per year from clubSENsational: you may request to join our pension scheme, but we are not required to pay employer contributions.',
      BULLET + 'If you are automatically enrolled: you may opt out within one month of enrolment and receive a refund of contributions paid in that period, in accordance with scheme rules.',
      'CONTRIBUTIONS',
      'Where contributions apply, the minimum total contribution is ordinarily 8% of qualifying earnings between ' + GBP + '6,240 and ' + GBP + '50,270 per year, of which the employer pays at least 3% and the worker pays the remainder (with tax relief where applicable). Actual rates depend on the ' + PENSION_SCHEME_NAME + ' scheme rules (or those of any replacement qualifying scheme).',
      'CONTACT AND FURTHER INFORMATION',
      BULLET + 'To opt in, ask questions, or notify us of a change in circumstances, contact HR at ' + HR_CONTACT_EMAIL + '.',
      BULLET + 'Scheme information: ' + PENSION_SCHEME_NAME + ' ' + EM + ' ' + PENSION_SCHEME_URL + '.',
      BULLET + 'Independent guidance is available from The Pensions Regulator (www.thepensionsregulator.gov.uk) and MoneyHelper (www.moneyhelper.org.uk).',
      'Yours sincerely,',
      '{{DIRECTOR_NAME}}',
      'For and on behalf of clubSENsational Ltd'
    ];
  }

  /* ================================================================
   *  TEMPLATE BUILDERS  (one per contract kind)
   * ================================================================ */

  /* ---------- ZERO HOURS ---------- */

  function buildZeroHoursTemplate() {
    return [].concat(
      ['ZERO HOURS EMPLOYMENT CONTRACT ' + EM + ' ACTIVITY SERVICES', ''],
      clauseOpening(), [''],
      clauseBackground(), [''],
      clauseParticulars(), [''],
      [
        'COMMENCEMENT DATE AND TERM',
        'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}} (the "Commencement Date").',
        '{{CONTINUOUS_EMPLOYMENT}}',
        "The Employee's schedule of employment will be as follows:",
        '{{CONTRACT_TYPE}}'
      ], [''],
      [
        'SCOPE OF THIS AGREEMENT',
        BULLET + 'This Agreement covers Activity Services only (including swimming, climbing, fitness and related support sessions delivered outside the Day Centre).',
        BULLET + 'This Agreement does not cover Day Centre Services. If the Employee also works in the Day Centre, that engagement must be set out in a separate Day Centre employment agreement. The two agreements may operate concurrently.'
      ], [''],
      [
        'JOB TITLE AND DESCRIPTION',
        'The initial job title of the Employee will be:',
        '{{JOB_TITLE}}',
        '{{DUTIES_DESCRIPTION}}',
        BULLET + 'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
        BULLET + 'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
        BULLET + "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
        BULLET + "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
        BULLET + "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
        BULLET + 'The Employee warrants that they are legally allowed to work in England.'
      ], [''],
      [
        'EMPLOYEE REMUNERATION',
        'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of:', '',
        '{{DELIVERY_REMUNERATION}}',
        BULLET + 'The hourly rates stated above are inclusive rates and already include statutory rolled-up holiday pay at 12.07% of the ordinary (basic) element. No additional 12.07% is paid on top. Payslips will itemise ordinary pay and rolled-up holiday pay as set out under Holiday Entitlement.',
        BULLET + 'Session feedback and records form part of the Employee\'s duties. The Delivery Service hourly rate(s) stated above are inclusive of a reasonable period of post-session administration (typically up to about ten minutes per session). No additional payment is due for that administration unless the Employer authorises additional paid time in writing.',
        BULLET + "If the Employer cancels a scheduled shift with at least 24 hours' notice, the Employee shall not be entitled to remuneration for that shift.",
        BULLET + 'If the cancellation occurs less than 24 hours before the scheduled start time, the Employee shall be entitled to full remuneration for the shift as originally scheduled.',
        BULLET + 'This remuneration will be payable once per month while this Agreement is in force.',
        BULLET + "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
        BULLET + "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time."
      ], [''],
      clausePension(), [''],
      [
        'PLACE OF WORK',
        "The Employee's place of work will be:",
        '{{PLACE_OF_WORK}}'
      ], [''],
      [
        'TIME OF WORK',
        "The Employee's normal hours of work, including breaks, are as follows:",
        '{{NORMAL_HOURS_OF_WORK}}',
        BULLET + 'This is a zero-hours contract. The Employer does not guarantee any minimum hours of work. Hours will be offered as and when work is available and the Employee is not obliged to accept any hours offered.',
        BULLET + "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's normal hours of work as deemed necessary by the Employer to meet business needs, as permitted by law."
      ], [''],
      [
        'NO EXCLUSIVITY',
        'This is a zero-hours contract. In accordance with section 27A of the Employment Rights Act 1996, the Employer does not require the Employee to work exclusively for the Employer. The Employee is free to work for other employers or to accept or decline work offered under this Agreement.'
      ], [''],
      [
        'PROBATION PERIOD',
        BULLET + "The Employee's employment will be subject to a probationary period of three (3) months commencing from the Commencement Date.",
        BULLET + "During the probation period, the Employee's performance and conduct will be reviewed. At the end of the probationary period, the Employee will be informed in writing whether their employment is to be confirmed, extended, or terminated.",
        BULLET + "The Employer reserves the right to extend the probationary period by up to a further three months if additional time is needed to assess the Employee's performance."
      ], [''],
      clauseSicknessZeroHours(), [''],
      [
        'HOLIDAY ENTITLEMENT',
        BULLET + 'The Employee is an irregular-hours worker for the purposes of the Working Time Regulations 1998 (as amended).',
        BULLET + "The Employer's holiday year runs between 1 January and 31 December.",
        BULLET + "Statutory holiday entitlement accrues at 12.07% of hours worked in each pay period, subject to the statutory maximum of 5.6 weeks' paid annual leave in each holiday year.",
        BULLET + 'The hourly rates in Employee Remuneration already include statutory rolled-up holiday pay at 12.07% of the ordinary (basic) element. No further 12.07% is paid on top. Payslips will itemise ordinary pay and rolled-up holiday pay separately; together they equal the inclusive hourly rate(s) for hours worked.',
        BULLET + 'Rolled-up holiday pay is paid with ordinary pay each pay period and is not paid again when holiday leave is taken. The Employee remains entitled to take holiday leave; booking and approval arrangements are set out in the Staff Handbook; questions via the Staff Portal or ' + HR_CONTACT_EMAIL + '. On termination, any outstanding holiday pay due under statute will be paid in accordance with the Working Time Regulations 1998 and the Employer\'s lawful payroll practice.'
      ], [''],
      clauseWorkingTime(), [''],
      clauseOtherPaidLeave(), [''],
      clauseDisciplinary(), [''],
      clauseGrievance(), [''],
      clauseSafeguardingDBS(), [''],
      clauseDataProtection(), [''],
      clauseConfidentiality(), [''],
      clauseBindingAuthority(), [''],
      clauseCollectiveAgreements(), [''],
      clauseTraining(), [''],
      clauseOtherBenefits(), [''],
      [
        'TERMINATION OF EMPLOYMENT',
        BULLET + "The Employer may terminate the Employee's employment by giving not less than two weeks' written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
        BULLET + "If the Employee wishes to terminate their employment, they must provide not less than two weeks' written notice, or such longer period of notice as required by statute.",
        BULLET + 'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.'
      ], [''],
      clauseGoverningLaw(), [''],
      clauseGeneralProvisions(), [''],
      [
        'WRITTEN PARTICULARS (ERA 1996, s.1)',
        BULLET + 'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
        BULLET + 'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
        BULLET + 'Job Title: {{JOB_TITLE}}',
        BULLET + 'Start Date: {{COMMENCEMENT_DATE}} (zero-hours Activity Services; no fixed end date)',
        BULLET + 'Continuous Employment: {{CONTINUOUS_EMPLOYMENT_SHORT}}',
        BULLET + 'Pay: Inclusive hourly rates as set out in Employee Remuneration (ordinary pay plus rolled-up holiday pay at 12.07% of the ordinary element, itemised separately on payslips; no additional 12.07% on top of the stated rates), paid monthly.',
        BULLET + 'Hours: Variable according to business need; no minimum guaranteed hours; days and hours vary according to offered and accepted shifts.',
        BULLET + 'Place of Work: {{PLACE_OF_WORK}}',
        BULLET + 'Holiday: Irregular-hours worker; accrual at 12.07%; rolled-up holiday pay included within the stated hourly rates and itemised on payslips as above.',
        BULLET + 'Pension: ' + PENSION_SCHEME_NAME + ' (or other qualifying scheme nominated by the Employer); auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
        BULLET + 'Notice: Not less than two weeks, or statutory minimum if greater.',
        BULLET + 'Probation: Three months from commencement.',
        BULLET + 'Obligatory training: Safeguarding and role-required training as directed.',
        BULLET + 'Other benefits: None beyond those stated in this Agreement / statute.',
        BULLET + 'Collective Agreements: None.',
        BULLET + 'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection. Full policy texts are in the Employer\'s Policies & Compliance Portal on the Staff Portal (and summarised in the Staff Handbook). All staff must read and sign the policies that apply to their role, as amended from time to time. Questions: Staff Portal or ' + HR_CONTACT_EMAIL + '.'
      ], [''],
      clauseSignatures(), [''],
      clauseAnnexPension('zero_hours'), [''],
      clauseAnnexJobDescription()
    ).join('\n');
  }

  /* ---------- DAY CENTRE PART-TIME ---------- */

  function buildDayCentreTemplate() {
    return [].concat(
      ['PART-TIME EMPLOYMENT CONTRACT ' + EM + ' DAY CENTRE', ''],
      clauseOpening(), [''],
      clauseBackground(), [''],
      clauseParticulars(), [''],
      [
        'COMMENCEMENT DATE AND TERM',
        'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}} (the "Commencement Date").',
        '{{CONTINUOUS_EMPLOYMENT}}',
        "The Employee's schedule of employment will be as follows:",
        '{{CONTRACT_TYPE}}',
        'This employment is permanent and will continue until terminated in accordance with this Agreement or by mutual written agreement.'
      ], [''],
      [
        'SCOPE OF THIS AGREEMENT',
        BULLET + 'This Agreement covers Day Centre Services only (ordinarily Monday to Friday, 11:00 to 16:00).',
        BULLET + 'This Agreement does not cover Activity Services delivered outside the Day Centre (such as evening swimming, climbing or related sessions). If the Employee also performs Activity Services, that engagement must be set out in a separate zero-hours Activity Services agreement. The two agreements may operate concurrently.'
      ], [''],
      [
        'JOB TITLE AND DESCRIPTION',
        'The initial job title of the Employee will be:',
        '{{JOB_TITLE}}',
        '{{DUTIES_DESCRIPTION}}',
        BULLET + 'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
        BULLET + 'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
        BULLET + "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
        BULLET + "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
        BULLET + "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
        BULLET + 'The Employee warrants that they are legally allowed to work in England.'
      ], [''],
      [
        'EMPLOYEE REMUNERATION',
        'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of a salary of:', '',
        '{{ANNUAL_SALARY}} per year (gross), paid monthly in arrears via payroll on or around the last working day of the month. Statutory deductions will be made.',
        BULLET + 'The monthly salary is payable while this Agreement remains in force and is not reduced by individual session cancellations within the agreed Normal Hours of Work, provided the Employee remains available for work in accordance with this Agreement.',
        BULLET + 'Session feedback and daily records form part of the Employee\'s duties under this Agreement. Where such records are completed during Normal Hours of Work, they are covered by the salary. Where the Employer requires reasonable post-session or end-of-day feedback/records outside Normal Hours of Work, that time is included within the overall remuneration for the role (typically up to about ten minutes per session or working day) unless the Employer authorises additional paid time in writing.',
        BULLET + 'This remuneration will be payable once per month while this Agreement is in force.',
        BULLET + "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
        BULLET + "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time."
      ], [''],
      clausePension(), [''],
      [
        'PLACE OF WORK',
        "The Employee's place of work will be:",
        '{{PLACE_OF_WORK}}',
        'Travel between sites may be required from time to time.'
      ], [''],
      [
        'TIME OF WORK',
        'The Employee\'s normal hours of work ("Normal Hours of Work") are as follows:',
        '{{WEEKLY_HOURS}} hours per week.',
        '{{NORMAL_HOURS_OF_WORK}}',
        BULLET + 'Each working day runs from 11:00 to 16:00, totalling 5 paid hours per day. A short comfort break of 10 to 15 minutes may be taken when operationally possible; this does not reduce the paid hours.',
        BULLET + "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's Normal Hours of Work as deemed necessary by the Employer to meet business needs, as permitted by law."
      ], [''],
      [
        'PROBATION PERIOD',
        BULLET + "The Employee's employment will be subject to a probationary period of six (6) months commencing from the Commencement Date.",
        BULLET + "During the probation period, the Employee's performance and conduct will be reviewed. At the end of the probationary period, the Employee will be informed in writing whether their employment is to be confirmed, extended, or terminated.",
        BULLET + "The Employer reserves the right to extend the probationary period by up to a further three months if additional time is needed to assess the Employee's performance."
      ], [''],
      [
        'PART-TIME WORKER TREATMENT',
        'The Employee is a part-time worker. The Employee will not be treated less favourably than a comparable full-time worker solely because of part-time status, in accordance with the Part-time Workers (Prevention of Less Favourable Treatment) Regulations 2000.'
      ], [''],
      clauseSicknessSalaried(), [''],
      [
        'HOLIDAY ENTITLEMENT',
        BULLET + "The Employer's holiday year runs between 1 January and 31 December.",
        BULLET + "The Employee is entitled to paid annual leave calculated on a pro-rata basis against a full-time entitlement of 28 days plus the usual eight public holidays (bank holidays) in England and Wales (based on a 40-hour, five-day working week).",
        BULLET + "Holiday entitlement is pro-rated according to the Employee's contracted weekly hours and is taken as paid leave (it is not rolled up into salary). Holiday pay will be calculated in accordance with the Working Time Regulations 1998 and the Employer's lawful payroll practice.",
        BULLET + 'Requests for annual leave must be submitted in writing and are subject to the approval of the Employer. The Employer may require the Employee to take holiday on specified dates, giving reasonable notice.'
      ], [''],
      clauseWorkingTime(), [''],
      clauseOtherPaidLeave(), [''],
      clauseDisciplinary(), [''],
      clauseGrievance(), [''],
      clauseSafeguardingDBS(), [''],
      clauseDataProtection(), [''],
      clauseConfidentiality(), [''],
      clauseBindingAuthority(), [''],
      clauseCollectiveAgreements(), [''],
      clauseTraining(), [''],
      clauseOtherBenefits(), [''],
      [
        'TERMINATION OF EMPLOYMENT',
        BULLET + "The Employer may terminate the Employee's employment by giving not less than one month's written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
        BULLET + "If the Employee wishes to terminate their employment, they must provide not less than one month's written notice, or such longer period of notice as required by statute.",
        BULLET + 'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.'
      ], [''],
      clauseGoverningLaw(), [''],
      clauseGeneralProvisions(), [''],
      [
        'WRITTEN PARTICULARS (ERA 1996, s.1)',
        BULLET + 'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
        BULLET + 'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
        BULLET + 'Job Title: {{JOB_TITLE}}',
        BULLET + 'Start Date: {{COMMENCEMENT_DATE}} (permanent part-time; no fixed end date)',
        BULLET + 'Continuous Employment: {{CONTINUOUS_EMPLOYMENT_SHORT}}',
        BULLET + 'Salary: {{ANNUAL_SALARY}} per annum (gross)',
        BULLET + 'Hours: {{WEEKLY_HOURS}} hours per week; {{WORK_DAYS}}, 11:00' + EM + '16:00.',
        BULLET + 'Place of Work: {{PLACE_OF_WORK}}',
        BULLET + 'Holiday: Pro-rata of 28 days plus bank holidays against 40-hour FTE (see Holiday Entitlement).',
        BULLET + 'Pension: ' + PENSION_SCHEME_NAME + ' (or other qualifying scheme nominated by the Employer); auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
        BULLET + 'Notice: Not less than one month, or statutory minimum if greater.',
        BULLET + 'Probation: Six months from commencement.',
        BULLET + 'Collective Agreements: None.',
        BULLET + 'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection. Full policy texts are in the Employer\'s Policies & Compliance Portal on the Staff Portal (and summarised in the Staff Handbook). All staff must read and sign the policies that apply to their role, as amended from time to time. Questions: Staff Portal or ' + HR_CONTACT_EMAIL + '.'
      ], [''],
      clauseSignatures(), [''],
      clauseAnnexPension('day_centre_part_time'), [''],
      clauseAnnexJobDescription()
    ).join('\n');
  }

  /* ---------- FULL-TIME ---------- */

  function buildFullTimeTemplate() {
    return [].concat(
      ['FULL-TIME EMPLOYMENT CONTRACT', ''],
      clauseOpening(), [''],
      clauseBackground(), [''],
      clauseParticulars(), [''],
      [
        'COMMENCEMENT DATE AND TERM',
        'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}} (the "Commencement Date").',
        '{{CONTINUOUS_EMPLOYMENT}}',
        "The Employee's schedule of employment will be as follows:",
        '{{CONTRACT_TYPE}}',
        'This employment is permanent and will continue until terminated in accordance with this Agreement or by mutual written agreement.'
      ], [''],
      [
        'JOB TITLE AND DESCRIPTION',
        'The initial job title of the Employee will be:',
        '{{JOB_TITLE}}',
        '{{DUTIES_DESCRIPTION}}',
        BULLET + 'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
        BULLET + 'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
        BULLET + "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
        BULLET + "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
        BULLET + "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
        BULLET + 'The Employee warrants that they are legally allowed to work in England.'
      ], [''],
      [
        'EMPLOYEE REMUNERATION',
        'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of a salary of:', '',
        '{{ANNUAL_SALARY}} per year (gross), paid monthly in arrears via payroll on or around the last working day of the month. Statutory deductions will be made.',
        BULLET + 'This remuneration will be payable once per month while this Agreement is in force.',
        BULLET + "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
        BULLET + "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time."
      ], [''],
      clausePension(), [''],
      [
        'PLACE OF WORK',
        "The Employee's place of work will be:",
        '{{PLACE_OF_WORK}}',
        'Travel between sites or to partner organisations may be required from time to time.'
      ], [''],
      [
        'TIME OF WORK',
        'The Employee\'s normal hours of work, excluding unpaid breaks ("Normal Hours of Work"), are as follows:',
        '{{WEEKLY_HOURS}} hours per week.',
        '{{NORMAL_HOURS_OF_WORK}}',
        BULLET + "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's Normal Hours of Work as deemed necessary by the Employer to meet business needs, as permitted by law."
      ], [''],
      [
        'PROBATION PERIOD',
        BULLET + "The Employee's employment will be subject to a probationary period of six (6) months commencing from the Commencement Date.",
        BULLET + "During the probation period, the Employee's performance and conduct will be reviewed. At the end of the probationary period, the Employee will be informed in writing whether their employment is to be confirmed, extended, or terminated.",
        BULLET + "The Employer reserves the right to extend the probationary period by up to a further three months if additional time is needed to assess the Employee's performance."
      ], [''],
      clauseSicknessSalaried(), [''],
      [
        'HOLIDAY ENTITLEMENT',
        BULLET + "The Employer's holiday year runs between 1 January and 31 December.",
        BULLET + "The Employee is entitled to 28 days' paid annual leave per holiday year plus the usual eight public holidays in England and Wales.",
        BULLET + "Holiday pay will be calculated in accordance with the Working Time Regulations 1998 and the Employer's lawful payroll practice.",
        BULLET + 'Requests for annual leave must be submitted in writing and are subject to the approval of the Employer. The Employer may require the Employee to take holiday on specified dates, giving reasonable notice.'
      ], [''],
      clauseWorkingTime(), [''],
      clauseOtherPaidLeave(), [''],
      clauseDisciplinary(), [''],
      clauseGrievance(), [''],
      clauseSafeguardingDBS(), [''],
      clauseDataProtection(), [''],
      clauseConfidentiality(), [''],
      clauseBindingAuthority(), [''],
      clauseCollectiveAgreements(), [''],
      clauseTraining(), [''],
      clauseOtherBenefits(), [''],
      [
        'TERMINATION OF EMPLOYMENT',
        BULLET + "The Employer may terminate the Employee's employment by giving not less than one month's written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
        BULLET + "If the Employee wishes to terminate their employment, they must provide not less than one month's written notice, or such longer period of notice as required by statute.",
        BULLET + 'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.'
      ], [''],
      clauseGoverningLaw(), [''],
      clauseGeneralProvisions(), [''],
      [
        'WRITTEN PARTICULARS (ERA 1996, s.1)',
        BULLET + 'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
        BULLET + 'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
        BULLET + 'Job Title: {{JOB_TITLE}}',
        BULLET + 'Start Date: {{COMMENCEMENT_DATE}} (permanent full-time; no fixed end date)',
        BULLET + 'Continuous Employment: {{CONTINUOUS_EMPLOYMENT_SHORT}}',
        BULLET + 'Salary: {{ANNUAL_SALARY}} per annum (gross)',
        BULLET + 'Hours: {{WEEKLY_HOURS}} hours per week.',
        BULLET + 'Place of Work: {{PLACE_OF_WORK}}',
        BULLET + 'Holiday: 28 days plus bank holidays (see Holiday Entitlement).',
        BULLET + 'Pension: ' + PENSION_SCHEME_NAME + ' (or other qualifying scheme nominated by the Employer); auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
        BULLET + 'Notice: Not less than one month, or statutory minimum if greater.',
        BULLET + 'Probation: Six months from commencement.',
        BULLET + 'Collective Agreements: None.',
        BULLET + 'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection. Full policy texts are in the Employer\'s Policies & Compliance Portal on the Staff Portal (and summarised in the Staff Handbook). All staff must read and sign the policies that apply to their role, as amended from time to time. Questions: Staff Portal or ' + HR_CONTACT_EMAIL + '.'
      ], [''],
      clauseSignatures(), [''],
      clauseAnnexPension('full_time')
    ).join('\n');
  }

  /* ---------- FIXED-TERM ---------- */

  function buildFixedTermTemplate() {
    return [].concat(
      ['FIXED-TERM EMPLOYMENT CONTRACT', ''],
      clauseOpening(), [''],
      clauseBackground(), [''],
      clauseParticulars(), [''],
      [
        'COMMENCEMENT DATE AND TERM',
        'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}} (the "Commencement Date").',
        '{{CONTINUOUS_EMPLOYMENT}}',
        "The Employee's schedule of employment will be as follows:",
        '{{CONTRACT_TYPE}}',
        'This employment is for a fixed term ending on {{TERM_END_DATE}} (the "End Date") unless terminated earlier in accordance with this Agreement or by mutual written agreement. Unless terminated earlier under this Agreement or by law, employment will end automatically on the End Date without the need for further notice.'
      ], [''],
      [
        'JOB TITLE AND DESCRIPTION',
        'The initial job title of the Employee will be:',
        '{{JOB_TITLE}}',
        '{{DUTIES_DESCRIPTION}}',
        BULLET + 'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
        BULLET + 'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
        BULLET + "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
        BULLET + "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
        BULLET + "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
        BULLET + 'The Employee warrants that they are legally allowed to work in England.'
      ], [''],
      [
        'EMPLOYEE REMUNERATION',
        'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of a salary of:', '',
        '{{ANNUAL_SALARY}} per year (gross), paid monthly in arrears via payroll on or around the last working day of the month. Statutory deductions will be made.',
        BULLET + 'This remuneration will be payable once per month while this Agreement is in force.',
        BULLET + "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
        BULLET + "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time."
      ], [''],
      clausePension(), [''],
      [
        'PLACE OF WORK',
        "The Employee's place of work will be:",
        '{{PLACE_OF_WORK}}',
        'Travel between sites may be required from time to time.'
      ], [''],
      [
        'TIME OF WORK',
        'The Employee\'s normal hours of work, excluding unpaid breaks ("Normal Hours of Work"), are as follows:',
        '{{WEEKLY_HOURS}} hours per week.',
        '{{NORMAL_HOURS_OF_WORK}}',
        BULLET + "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's Normal Hours of Work as deemed necessary by the Employer to meet business needs, as permitted by law."
      ], [''],
      [
        'PROBATION PERIOD',
        BULLET + "The Employee's employment will be subject to a probationary period of up to six (6) months commencing from the Commencement Date, or such shorter period as is proportionate to the length of this fixed-term contract.",
        BULLET + "During the probation period, the Employee's performance and conduct will be reviewed. At the end of the probationary period, the Employee will be informed in writing whether their employment is to be confirmed, extended, or terminated.",
        BULLET + "The Employer reserves the right to extend the probationary period if additional time is needed to assess the Employee's performance, subject to the overall fixed term."
      ], [''],
      [
        'FIXED-TERM EMPLOYEE TREATMENT',
        'The Employee is employed on a fixed-term contract. The Employee will not be treated less favourably than a comparable permanent employee solely because of fixed-term status, in accordance with the Fixed-term Employees (Prevention of Less Favourable Treatment) Regulations 2002.'
      ], [''],
      clauseSicknessSalaried(), [''],
      [
        'HOLIDAY ENTITLEMENT',
        BULLET + "The Employer's holiday year runs between 1 January and 31 December.",
        BULLET + "The Employee is entitled to paid annual leave calculated on a pro-rata basis against a full-time entitlement of 28 days plus the usual eight public holidays in England and Wales (based on a 40-hour, five-day working week). For a part-year contract, entitlement is further pro-rated to the duration of the fixed term.",
        BULLET + "Holiday pay will be calculated in accordance with the Working Time Regulations 1998 and the Employer's lawful payroll practice.",
        BULLET + 'Requests for annual leave must be submitted in writing and are subject to the approval of the Employer.'
      ], [''],
      clauseWorkingTime(), [''],
      clauseOtherPaidLeave(), [''],
      clauseDisciplinary(), [''],
      clauseGrievance(), [''],
      clauseSafeguardingDBS(), [''],
      clauseDataProtection(), [''],
      clauseConfidentiality(), [''],
      clauseBindingAuthority(), [''],
      clauseCollectiveAgreements(), [''],
      clauseTraining(), [''],
      clauseOtherBenefits(), [''],
      [
        'TERMINATION OF EMPLOYMENT',
        BULLET + "The Employer may terminate the Employee's employment before the End Date by giving not less than one month's written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
        BULLET + "If the Employee wishes to terminate their employment before the End Date, they must provide not less than one month's written notice, or such longer period of notice as required by statute.",
        BULLET + 'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.',
        BULLET + 'Unless terminated earlier under this Agreement or by law, employment will end automatically on {{TERM_END_DATE}} without the need for further notice.'
      ], [''],
      clauseGoverningLaw(), [''],
      clauseGeneralProvisions(), [''],
      [
        'WRITTEN PARTICULARS (ERA 1996, s.1)',
        BULLET + 'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
        BULLET + 'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
        BULLET + 'Job Title: {{JOB_TITLE}}',
        BULLET + 'Start Date: {{COMMENCEMENT_DATE}} ' + EM + ' End Date: {{TERM_END_DATE}} (fixed term; automatic expiry on End Date)',
        BULLET + 'Continuous Employment: {{CONTINUOUS_EMPLOYMENT_SHORT}}',
        BULLET + 'Salary: {{ANNUAL_SALARY}} per annum (gross)',
        BULLET + 'Hours: {{WEEKLY_HOURS}} hours per week.',
        BULLET + 'Place of Work: {{PLACE_OF_WORK}}',
        BULLET + 'Holiday: Pro-rata of 28 days plus bank holidays (see Holiday Entitlement).',
        BULLET + 'Pension: ' + PENSION_SCHEME_NAME + ' (or other qualifying scheme nominated by the Employer); auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
        BULLET + 'Notice: Not less than one month, or statutory minimum if greater.',
        BULLET + 'Probation: Up to six months, or shorter if proportionate to contract length.',
        BULLET + 'Collective Agreements: None.',
        BULLET + 'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection. Full policy texts are in the Employer\'s Policies & Compliance Portal on the Staff Portal (and summarised in the Staff Handbook). All staff must read and sign the policies that apply to their role, as amended from time to time. Questions: Staff Portal or ' + HR_CONTACT_EMAIL + '.'
      ], [''],
      clauseSignatures(), [''],
      clauseAnnexPension('fixed_term')
    ).join('\n');
  }

  /* ---------- PERMANENT PART-TIME (LEGACY / DEPRECATED) ---------- */

  function buildPermanentPartTimeTemplate() {
    return [
      'PERMANENT PART-TIME EMPLOYMENT CONTRACT', '',
      '[DEPRECATED ' + EM + ' This contract template is retained for historical reference only. Do not issue new contracts using this template. Use zero_hours, day_centre_part_time, full_time or fixed_term instead.]', '',
      'THIS EMPLOYMENT CONTRACT dated {{CONTRACT_DATE}}', '',
      'BETWEEN:', '',
      'EMPLOYEE DETAILS:',
      'Full Name: {{EMPLOYEE_FULL_NAME}}',
      'Address: {{EMPLOYEE_ADDRESS}}',
      'Email: {{EMPLOYEE_EMAIL}}', '',
      'EMPLOYER DETAILS:',
      COMPANY_LEGAL_NAME,
      COMPANY_REGISTERED_ADDRESS,
      'Registered Company No. ' + COMPANY_NUMBER, '',
      'BACKGROUND:',
      'The Employer is of the opinion that the Employee has the necessary qualifications, experience and abilities to assist and benefit the Employer in its business.',
      'The Employer desires to employ the Employee and the Employee has agreed to accept and enter such employment upon the terms and conditions set out in this Agreement.',
      'IN CONSIDERATION OF the matters described above and of the mutual benefits and obligations set forth in this Agreement, the receipt and sufficiency of which consideration is hereby acknowledged, the parties agree as follows:', '',
      'PARTICULARS OF EMPLOYMENT',
      "As required by section 1 of the Employment Rights Act 1996, the particulars of the Employee's employment are set out in this Agreement.", '',
      'COMMENCEMENT DATE AND TERM',
      'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}} (the "Commencement Date").',
      "The Employee's schedule of employment will be as follows:",
      '{{CONTRACT_TYPE}}',
      'This employment is permanent and will continue until terminated in accordance with this Agreement or by mutual written agreement.', '',
      'JOB TITLE AND DESCRIPTION',
      'The initial job title of the Employee will be:',
      '{{JOB_TITLE}}',
      'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
      '{{DUTIES_DESCRIPTION}}', '',
      'EMPLOYEE REMUNERATION',
      'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of a salary of:', '',
      '{{ANNUAL_SALARY}} per year, paid monthly in arrears via payroll on or around the last working day of the month. Statutory deductions will be made.',
      'This remuneration will be payable once per month while this Agreement is in force.',
      "The Employer is entitled to deduct from the Employee's remuneration any applicable deductions and remittances as required by law.", '',
      'PENSION',
      "The Employer will meet its automatic enrolment duties under the Pensions Act 2008. The Employer's current qualifying workplace pension scheme is " + PENSION_SCHEME_NAME + ".", '',
      'PLACE OF WORK',
      "The Employee's place of work will be:",
      '{{PLACE_OF_WORK}}', '',
      'TIME OF WORK',
      '{{WEEKLY_HOURS}} hours per week.',
      '{{NORMAL_HOURS_OF_WORK}}', '',
      'PROBATION PERIOD',
      "The Employee's employment will be subject to a probationary period of six (6) months.", '',
      'SICKNESS AND DISABILITY',
      'Statutory Sick Pay applies where the Employee meets qualifying conditions.', '',
      'HOLIDAY ENTITLEMENT',
      "The Employer's holiday year runs between 1 January and 31 December.",
      'Statutory holiday entitlement is included within total pay.', '',
      'TERMINATION OF EMPLOYMENT',
      "Either party may terminate by giving not less than two weeks' written notice, or such longer period as required by statute.", '',
      'GOVERNING LAW',
      'This Agreement will be construed in accordance with and governed by the laws of England and Wales.', '',
      'GENERAL PROVISIONS',
      'This Agreement constitutes the entire agreement between the parties.',
      '{{SUPERSEDE_CLAUSE}}', '',
      'WRITTEN PARTICULARS (ERA 1996, s.1)',
      'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
      'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
      'Job Title: {{JOB_TITLE}}',
      'Start Date: {{COMMENCEMENT_DATE}} (permanent part-time)',
      'Salary: {{ANNUAL_SALARY}} per annum',
      'Hours: {{WEEKLY_HOURS}} hours/week.',
      'Place of Work: {{PLACE_OF_WORK}}', '',
      'SIGNATURES',
      'By signing below, the Employee confirms that they have read, understood and agreed to the terms of this Employment Contract.', '',
      'EMPLOYEE SIGNATURE',
      'Name: {{EMPLOYEE_FULL_NAME}}',
      'Date: {{EMPLOYEE_SIGNATURE_DATE}}',
      'Signature: {{EMPLOYEE_SIGNATURE}}', '',
      'DIRECTOR SIGNATURE',
      'Name: {{DIRECTOR_NAME}}',
      'Date: {{DIRECTOR_SIGNATURE_DATE}}',
      'Signature: {{DIRECTOR_SIGNATURE}}', '',
      'ACKNOWLEDGEMENT',
      'I confirm that I have read, understood and agree to the terms of this employment contract.'
    ].join('\n');
  }

  /* ================================================================
   *  TEMPLATE CACHE & LOOKUP
   * ================================================================ */

  var _templateCache = {};

  function getMasterTemplate(kind) {
    var k = normalizeContractKind(kind);
    if (!_templateCache[k]) {
      switch (k) {
        case 'zero_hours':           _templateCache[k] = buildZeroHoursTemplate(); break;
        case 'day_centre_part_time': _templateCache[k] = buildDayCentreTemplate(); break;
        case 'full_time':            _templateCache[k] = buildFullTimeTemplate(); break;
        case 'fixed_term':           _templateCache[k] = buildFixedTermTemplate(); break;
        case 'permanent_part_time':  _templateCache[k] = buildPermanentPartTimeTemplate(); break;
        default:                     _templateCache[k] = buildZeroHoursTemplate(); break;
      }
    }
    return _templateCache[k];
  }

  /* ================================================================
   *  FILL / SANITISE
   * ================================================================ */

  function sanitizeContractText(text) {
    return String(text || '')
      .replace(/\uFFFD/g, '-')
      .replace(/of of the/g, 'of the')
      .replace(/(\d:\d{2})\?(\d{1,2}:\d{2})/g, '$1-$2')
      .replace(/ Fixed Term \? from /g, ' Fixed Term ' + EM + ' from ')
      .replace(/ \? End Date: /g, ' ' + EM + ' End Date: ')
      .replace(/ANNEX A \? WORKPLACE/g, 'ANNEX A ' + EM + ' WORKPLACE')
      .replace(/\?(\d)/g, GBP + '$1');
  }

  function fillTemplate(data, kind) {
    var contractKind = normalizeContractKind(kind || (data && data.CONTRACT_KIND));
    var text = getMasterTemplate(contractKind);
    Object.keys(data || {}).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var raw = data[k];
      var value = FILL_SKIP_HIGHLIGHT[k] ? String(raw == null ? '' : raw) : markFilledValue(raw);
      text = text.split('{{' + k + '}}').join(value);
    });
    return sanitizeContractText(text);
  }

  /* ================================================================
   *  DUTIES DESCRIPTIONS (per kind)
   * ================================================================ */

  function dutiesDescription(kind) {
    var k = normalizeContractKind(kind);
    switch (k) {
      case 'zero_hours':
        return 'The Employee will perform any and all duties as requested by the Employer that are reasonable and customarily performed by a person holding a similar position in the industry or business of the Employer. Duties include delivering activity sessions (swimming, climbing, fitness or support work as applicable to the assigned role or roles), preparing and tidying session areas, completing attendance and session records, completing required session feedback after each session, attending planning meetings and supervision sessions, and any other reasonable tasks related to the delivery of the Employer\'s Activity Services. Session feedback and records form part of the role and are included in the Delivery Service hourly rate(s) as set out under Employee Remuneration.';
      case 'day_centre_part_time':
        return 'The Employee will provide day centre support services including facilitating structured activities and programmes for participants, assisting with personal care and support needs as required, maintaining a safe and welcoming environment, completing daily records, reports and required session/day feedback, liaising with families and external professionals, and any other reasonable duties related to the operation of the Employer\'s Day Centre service. Session feedback and daily records form part of the role and are covered by the remuneration for this Agreement as set out under Employee Remuneration.';
      case 'full_time':
        return 'The Employee will drive business growth and partnership development, including identifying and securing new funding streams, developing relationships with commissioners, local authorities and partner organisations, preparing tenders, proposals and impact reports, coordinating HR and organisational administration as directed, supporting the senior leadership team with strategic planning and operations, and any other reasonable duties related to the Employer\'s business development and operations objectives.';
      case 'fixed_term':
        return 'The Employee will perform all duties as requested by the Employer that are reasonable and customarily performed by a person holding a similar position in the industry or business of the Employer. Specific duties will be communicated at or before the start of employment and may reasonably vary with service needs.';
      case 'permanent_part_time':
        return 'Duties as specified in the original contract issued under this template.';
      default:
        return '';
    }
  }

  /* ================================================================
   *  buildTemplateData
   * ================================================================ */

  function buildTemplateData(opts) {
    var o    = opts || {};
    var kind = normalizeContractKind(o.contractKind);
    var roles      = normalizeRoles(o);
    var roleScales = normalizeRoleScales(o, roles);
    var roleScaleSummary = formatRoleScaleSummary(roleScales, roles);
    var jobTitle   = o.jobTitleOverride || formatJobTitles(roles, kind) || (o.role ? String(o.role).trim() : '') || EM;
    var today      = new Date().toISOString().slice(0, 10);
    var workDays   = Array.isArray(o.workDays) ? o.workDays.filter(Boolean) : [];

    var directorSig  = o.directorSignatureDataUrl ? '[Signed electronically]' : (o.directorName || EM);
    var employeeSig  = o.employeeSignatureDataUrl ? '[Signed electronically]' : (o.employeePending ? 'Pending employee signature' : EM);

    var continuousEmploymentDate = o.continuousEmploymentDate;
    var continuousEmploymentLine = continuousEmploymentDate
      ? "The Employee's period of continuous employment began on " + formatUKDate(continuousEmploymentDate) + '.'
      : "The Employee's period of continuous employment began on the Commencement Date.";
    var continuousEmploymentShort = continuousEmploymentDate
      ? formatUKDate(continuousEmploymentDate)
      : 'Same as start date';

    var concurrentWithOther = !!o.concurrentWithOther;
    var concurrentClause, supersedeClause;
    if (concurrentWithOther) {
      var otherRef = o.otherContractRef ? ' (reference: ' + String(o.otherContractRef) + ')' : '';
      concurrentClause = 'This Agreement runs concurrently with the Employee\'s existing agreement with the Employer' + otherRef + '. Where both agreements are in force, the terms of each agreement apply independently to the work performed under that agreement.';
      supersedeClause  = 'This Agreement does not supersede or replace any other current agreement between the Employer and the Employee; each agreement remains independently binding.';
    } else {
      concurrentClause = 'This Agreement constitutes the entire agreement between the parties.';
      supersedeClause  = 'This Agreement supersedes any previous employment agreement between the Employer and the Employee.';
    }

    var shared = {
      CONTRACT_VERSION: CONTRACT_VERSION,
      CONTRACT_KIND: kind,
      CONTRACT_REFERENCE: o.contractReference || EM,
      GENERATED_DATE: o.generatedDate || formatDateTime(),
      CONTRACT_DATE: formatUKDate(o.contractDate),
      EMPLOYEE_FULL_NAME: o.employeeName || EM,
      EMPLOYEE_ADDRESS: o.employeeAddress || EM,
      EMPLOYEE_EMAIL: o.employeeEmail || EM,
      COMMENCEMENT_DATE: formatUKDate(o.commencementDate),
      JOB_TITLE: jobTitle,
      PLACE_OF_WORK: o.placeOfWork || EM,
      DUTIES_DESCRIPTION: dutiesDescription(kind),
      JOB_DESCRIPTIONS_PLAIN: formatJobDescriptionsPlain(roles, kind) || EM,
      JOB_DESCRIPTIONS_HTML: formatJobDescriptionsHtml(roles, kind),
      JOB_DESCRIPTION_VERSION: JOB_DESCRIPTION_VERSION,
      CONTINUOUS_EMPLOYMENT: continuousEmploymentLine,
      CONTINUOUS_EMPLOYMENT_SHORT: continuousEmploymentShort,
      CONCURRENT_CLAUSE: concurrentClause,
      SUPERSEDE_CLAUSE: supersedeClause,
      DIRECTOR_NAME: o.directorName || EM,
      EMPLOYEE_SIGNATURE_DATE: o.employeeSignatureDate || formatUKDate(today),
      EMPLOYEE_SIGNATURE: employeeSig,
      DIRECTOR_SIGNATURE_DATE: o.directorSignatureDate || formatUKDate(today),
      DIRECTOR_SIGNATURE: directorSig,
      EMPLOYEE_ACKNOWLEDGEMENT: o.employeeAcknowledged ? 'Confirmed' : 'Pending',
      SIGNED_TIMESTAMP: o.signedTimestamp || EM,
      _contractDateRaw: o.contractDate || today
    };

    if (kind === 'zero_hours') {
      var firstRole  = roles.length ? roles[0] : '';
      var firstScale = firstRole ? roleScales[firstRole] : '';
      var firstRate  = firstRole ? getDeliveryRate(firstRole, firstScale) : null;
      return Object.assign(shared, {
        CONTRACT_TYPE: 'Zero Hours Contract ' + EM + ' hours worked will vary according to business requirements and mutual agreement.',
        ROLE_SCALE: roleScaleSummary || o.scale || EM,
        DELIVERY_RATE: firstRate != null ? String(firstRate) : EM,
        DELIVERY_REMUNERATION: buildDeliveryRemuneration(roles, roleScales),
        ADMIN_RATE: ADMIN_RATE,
        NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || 'Variable hours; no minimum guaranteed.',
        TERM_END_DATE: EM,
        ANNUAL_SALARY: EM,
        WEEKLY_HOURS: EM,
        WORK_DAYS: EM
      });
    }

    if (kind === 'day_centre_part_time') {
      var dcWeeklyHours = o.weeklyHours;
      if ((!dcWeeklyHours || dcWeeklyHours === '') && workDays.length) {
        dcWeeklyHours = workDays.length * 5;
      }
      var dcNormalHours = o.normalHoursOfWork;
      if (!dcNormalHours && workDays.length) {
        dcNormalHours = formatWorkDaysList(workDays) + ': 11:00' + EM + '16:00 (5 paid hours per day).';
      }
      var dcWorkDaysStr = formatWorkDaysList(workDays) || EM;
      return Object.assign(shared, {
        CONTRACT_TYPE: 'Permanent Part-Time (Day Centre) ' + EM + ' ' + dcWorkDaysStr + ', 11:00' + EM + '16:00.',
        ANNUAL_SALARY: formatSalary(o.annualSalary),
        WEEKLY_HOURS: dcWeeklyHours != null && dcWeeklyHours !== '' ? String(dcWeeklyHours) : EM,
        WORK_DAYS: dcWorkDaysStr,
        NORMAL_HOURS_OF_WORK: dcNormalHours || EM,
        TERM_END_DATE: EM,
        ROLE_SCALE: EM,
        DELIVERY_RATE: EM,
        DELIVERY_REMUNERATION: EM,
        ADMIN_RATE: EM
      });
    }

    if (kind === 'full_time') {
      var ftWeeklyHours = o.weeklyHours;
      if (!ftWeeklyHours || ftWeeklyHours === '') ftWeeklyHours = 40;
      return Object.assign(shared, {
        CONTRACT_TYPE: 'Permanent Full-Time ' + EM + ' ' + String(ftWeeklyHours) + ' hours per week.',
        ANNUAL_SALARY: formatSalary(o.annualSalary),
        WEEKLY_HOURS: String(ftWeeklyHours),
        WORK_DAYS: formatWorkDaysList(workDays) || 'Monday to Friday',
        NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || 'Monday to Friday, as agreed with the Employer.',
        TERM_END_DATE: EM,
        ROLE_SCALE: EM,
        DELIVERY_RATE: EM,
        DELIVERY_REMUNERATION: EM,
        ADMIN_RATE: EM
      });
    }

    if (kind === 'fixed_term') {
      var fxWeeklyHours = o.weeklyHours;
      if (!fxWeeklyHours || fxWeeklyHours === '') fxWeeklyHours = EM;
      return Object.assign(shared, {
        CONTRACT_TYPE: 'Fixed Term ' + EM + ' from ' + formatShortUKDate(o.commencementDate) + ' to ' + formatShortUKDate(o.termEndDate),
        ANNUAL_SALARY: formatSalary(o.annualSalary),
        WEEKLY_HOURS: String(fxWeeklyHours),
        WORK_DAYS: formatWorkDaysList(workDays) || EM,
        NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || EM,
        TERM_END_DATE: formatUKDate(o.termEndDate),
        ROLE_SCALE: EM,
        DELIVERY_RATE: EM,
        DELIVERY_REMUNERATION: EM,
        ADMIN_RATE: EM
      });
    }

    /* permanent_part_time (legacy) */
    return Object.assign(shared, {
      CONTRACT_TYPE: 'Permanent Part-Time',
      ANNUAL_SALARY: formatSalary(o.annualSalary),
      WEEKLY_HOURS: o.weeklyHours != null && o.weeklyHours !== '' ? String(o.weeklyHours) : EM,
      WORK_DAYS: formatWorkDaysList(workDays) || EM,
      NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || EM,
      TERM_END_DATE: EM,
      ROLE_SCALE: EM,
      DELIVERY_RATE: EM,
      DELIVERY_REMUNERATION: EM,
      ADMIN_RATE: EM
    });
  }

  /* ================================================================
   *  DOC TITLE / PDF FILENAME
   * ================================================================ */

  function contractDocTitle(kind) {
    var map = {
      zero_hours: 'Zero Hours Employment Contract',
      day_centre_part_time: 'Part-Time Employment Contract ' + EM + ' Day Centre',
      full_time: 'Full-Time Employment Contract',
      fixed_term: 'Fixed-Term Employment Contract',
      permanent_part_time: 'Permanent Part-Time Employment Contract'
    };
    return map[normalizeContractKind(kind)] || 'Employment Contract';
  }

  function pdfFilename(templateData) {
    var kind = normalizeContractKind(templateData && templateData.CONTRACT_KIND);
    var name = (templateData.EMPLOYEE_FULL_NAME || 'Employee').replace(/\s+/g, '_');
    var variantMap = {
      zero_hours: 'ZeroHours',
      day_centre_part_time: 'DayCentre',
      full_time: 'FullTime',
      fixed_term: 'FixedTerm',
      permanent_part_time: 'PermanentPartTime'
    };
    var variant = variantMap[kind] || 'Contract';
    var date = templateData._contractDateRaw || new Date().toISOString().slice(0, 10);
    return 'ClubSENsational_Employment_Contract_' + name + '_' + variant + '_' + date + '.pdf';
  }

  /* ================================================================
   *  RENDER HTML
   * ================================================================ */

  var logoDataUrl = '';

  function renderContractHtml(filledText, forPdf, sigs, kind) {
    var s = sigs || {};
    var contractKind = normalizeContractKind(kind);
    var logoSrc  = s.logoDataUrl || logoDataUrl || LOGO_DISPLAY;
    var imgStyle = forPdf ? 'max-width:200px;height:auto;display:block;margin:0 auto 8px;' : '';
    var blocks   = filledText.split('\n\n').filter(function (b) { return b.trim(); });
    var body     = '';
    var employeeDone = false;
    var directorDone = false;

    blocks.forEach(function (block) {
      var firstLine = block.split('\n')[0];

      if (firstLine.indexOf('EMPLOYMENT CONTRACT') >= 0 &&
          (firstLine.startsWith('ZERO HOURS') ||
           firstLine.startsWith('PART-TIME EMPLOYMENT') ||
           firstLine.startsWith('FULL-TIME EMPLOYMENT') ||
           firstLine.startsWith('FIXED-TERM EMPLOYMENT') ||
           firstLine.startsWith('FIXED TERM EMPLOYMENT') ||
           firstLine.startsWith('PERMANENT PART-TIME'))) {
        return;
      }

      if (firstLine.startsWith('[DEPRECATED')) {
        body += '<div class="contract-section" style="background:#fff3cd;border:1px solid #ffc107;border-left:4px solid #d39e00;padding:10px 14px;margin:8px 0;"><p style="margin:0;font-size:9pt;font-weight:600;color:#856404;">' + block + '</p></div>';
        return;
      }

      if (block.startsWith('THIS EMPLOYMENT CONTRACT')) {
        body += '<p class="contract-opening">' + applyFilledHtml(block) + '</p>';
        return;
      }

      if (block === 'BETWEEN:') return;

      var lines = block.split('\n');
      var title = lines[0];
      var rest  = lines.slice(1).join('\n');

      if (PARTY_BLOCKS.indexOf(title) >= 0) {
        body += '<div class="contract-parties"><strong>' + title.replace(':', '') + '</strong><p style="margin:0;white-space:pre-wrap;">' + applyFilledHtml(rest) + '</p></div>';
        return;
      }

      if (SIGNATURE_BLOCKS.indexOf(title) >= 0) {
        var extra = '';
        if (title === 'EMPLOYEE SIGNATURE' && !employeeDone && s.employeeSignatureDataUrl) {
          employeeDone = true;
          extra = '<img src="' + s.employeeSignatureDataUrl + '" alt="Employee signature" style="max-width:200px;height:65px;display:block;margin-top:8px;">';
        }
        if (title === 'DIRECTOR SIGNATURE' && !directorDone && s.directorSignatureDataUrl) {
          directorDone = true;
          extra = '<img src="' + s.directorSignatureDataUrl + '" alt="Director signature" style="max-width:200px;height:65px;display:block;margin-top:8px;">';
        }
        var restClean = rest.replace(/Signature: \[Signed electronically\]\s*/g, '').trim();
        body += '<div class="contract-section contract-signature-block"><h3>' + title + '</h3><p style="margin:0;white-space:pre-wrap;">' + applyFilledHtml(restClean) + '</p>' + extra + '</div>';
        return;
      }

      if (lines.length === 1) {
        if (isSectionHeader(title)) {
          body += '<div class="contract-section"><h3>' + title + '</h3></div>';
        } else {
          body += '<div class="contract-section"><p style="white-space:pre-wrap;">' + applyFilledHtml(block) + '</p></div>';
        }
        return;
      }

      if (isSectionHeader(title)) {
        var annexClass = (title.indexOf('ANNEX A') === 0 || title.indexOf('ANNEX B') === 0) ? ' contract-annex' : '';
        body += '<div class="contract-section' + annexClass + '"><h3>' + title + '</h3>' + renderSectionBodyHtml(rest) + '</div>';
      } else {
        body += '<div class="contract-section">' + renderSectionBodyHtml(block) + '</div>';
      }
    });

    var logoImg = forPdf
      ? '<img src="' + logoSrc + '" alt="clubSENsational" class="contract-logo" width="280" height="202" style="' + (imgStyle || '') + 'max-width:280px;height:auto;">'
      : '<img src="' + logoSrc + '" srcset="' + LOGO_DISPLAY + ' 1x, assets/clubsensational-logo@2x.png?v=3 2x" alt="clubSENsational" class="contract-logo" width="280" height="202"' + (imgStyle ? ' style="' + imgStyle + 'max-width:280px;height:auto;"' : '') + '>';

    return (
      '<div class="contract-document">' +
        '<header class="contract-letterhead">' +
          '<div class="letterhead-accent" aria-hidden="true"></div>' +
          '<div class="letterhead-brand">' +
            logoImg +
            '<div class="letterhead-legal">' + COMPANY_LEGAL_NAME + '</div>' +
            '<div class="letterhead-reg">Registered in England and Wales &middot; Company No. ' + COMPANY_NUMBER + '</div>' +
            '<div class="letterhead-address">' + COMPANY_FOOTER_ADDRESS + '</div>' +
          '</div>' +
          '<div class="letterhead-rule" aria-hidden="true"></div>' +
        '</header>' +
        '<div class="contract-body">' +
          '<h1 class="contract-doc-title">' + contractDocTitle(contractKind) + '</h1>' +
          body +
        '</div>' +
        '<footer class="contract-footer">' +
          '<div class="footer-brand">' + COMPANY_LEGAL_NAME + '</div>' +
          '<div>' + COMPANY_FOOTER_ADDRESS + ' &middot; Company No. ' + COMPANY_NUMBER + '</div>' +
          '<div class="footer-web">www.clubsensational.org</div>' +
        '</footer>' +
      '</div>'
    );
  }

  /* ================================================================
   *  PDF HTML BUILDER
   * ================================================================ */

  function buildPdfHtml(templateData, sigs) {
    var kind = normalizeContractKind(templateData && templateData.CONTRACT_KIND);
    var pdfStyles = '<style>' +
      '.contract-document{font-family:Georgia,"Times New Roman",serif;color:#152033;box-sizing:border-box;width:100%;max-width:100%;overflow-wrap:break-word;word-wrap:break-word;}' +
      '.contract-letterhead{background:linear-gradient(180deg,#fbfcfe 0%,#ffffff 72%);padding:0 0 12px;text-align:center;box-sizing:border-box;border-bottom:1px solid #e6edf4;}' +
      '.letterhead-accent{height:5px;background:linear-gradient(90deg,#0f2744 0%,#c9a227 52%,#0f2744 100%);}' +
      '.letterhead-brand{padding:16px 18px 8px;}' +
      '.contract-logo{width:240px;max-width:72%;height:auto;display:block;margin:0 auto 8px;}' +
      '.letterhead-legal{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9pt;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f2744;}' +
      '.letterhead-reg{margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#5b6b7c;letter-spacing:0.02em;}' +
      '.letterhead-address{margin:2px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#5b6b7c;}' +
      '.letterhead-rule{height:1px;margin:10px 18px 8px;background:linear-gradient(90deg,transparent,#c9a227,#0f2744,#c9a227,transparent);}' +
      '.contract-body{padding:14px 16px 10px;box-sizing:border-box;}' +
      '.contract-doc-title{text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12.5pt;font-weight:700;color:#0f2744;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 14px;padding:10px 8px;background:#f7fafc;border-top:2px solid #c9a227;border-bottom:2px solid #c9a227;}' +
      '.contract-opening{text-align:center;font-weight:600;color:#0f2744;margin:0 0 14px;font-size:10pt;}' +
      '.contract-section h3{font-family:Arial,Helvetica,sans-serif;font-size:8.5pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0f2744;margin:16px 0 6px;padding:0 0 4px 8px;border-left:3px solid #c9a227;border-bottom:1px solid #e6edf4;}' +
      '.contract-section p{margin:0 0 8px;font-size:9.5pt;line-height:1.5;text-align:justify;overflow-wrap:break-word;word-wrap:break-word;}' +
      '.contract-section ul.contract-bullets{margin:0 0 10px;padding:0 0 0 1.15em;list-style:disc;}' +
      '.contract-section ul.contract-bullets li{margin:0 0 5px;font-size:9.5pt;line-height:1.5;text-align:justify;overflow-wrap:break-word;word-wrap:break-word;}' +
      '.contract-filled{font-weight:700;color:#0f2744;background:rgba(201,162,39,0.20);padding:0 0.12em;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone;}' +
      '.contract-parties{background:linear-gradient(180deg,#f3f7fb,#eaf1f7);border:1px solid #c5d6e3;border-left:4px solid #0f2744;padding:10px 12px;margin:8px 0 12px;font-size:9pt;box-sizing:border-box;max-width:100%;overflow-wrap:break-word;}' +
      '.contract-parties > strong{display:block;font-family:Arial,Helvetica,sans-serif;font-size:8pt;letter-spacing:0.06em;text-transform:uppercase;color:#0f2744;margin-bottom:4px;}' +
      '.contract-parties .contract-filled{font-weight:700;}' +
      '.contract-parties p{overflow-wrap:break-word;word-wrap:break-word;}' +
      '.contract-signature-block{border-top:1px dashed #c5d0db;padding-top:10px;margin-top:8px;}' +
      '.contract-annex{page-break-before:always;margin-top:20px;padding-top:14px;border-top:2px solid #c9a227;}' +
      '.contract-footer{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#64748b;text-align:center;padding:12px 14px;border-top:1px solid #e2e8f0;background:linear-gradient(180deg,#fbfcfe,#f3f6f9);box-sizing:border-box;}' +
      '.footer-brand{font-weight:700;color:#0f2744;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:2px;}' +
      '.footer-web{margin-top:2px;color:#0f2744;}' +
      '</style>';
    var mergedSigs = Object.assign({}, sigs || {}, {
      contractReference: (templateData && templateData.CONTRACT_REFERENCE) || (sigs && sigs.contractReference) || '',
      contractDateLabel: (templateData && templateData.CONTRACT_DATE) || (sigs && sigs.contractDateLabel) || ''
    });
    return pdfStyles + renderContractHtml(fillTemplate(templateData, kind), true, mergedSigs, kind);
  }

  /* ================================================================
   *  BROWSER HELPERS
   * ================================================================ */

  function loadLogo() {
    return fetch(LOGO_PATH)
      .then(function (r) { if (!r.ok) throw new Error('logo'); return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var fr = new FileReader();
          fr.onload = function () { resolve(fr.result); };
          fr.onerror = function () { resolve(''); };
          fr.readAsDataURL(blob);
        });
      })
      .catch(function () { return ''; });
  }

  function setupSignaturePad(targetCanvas, padState, onComplete) {
    var context = targetCanvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var resize = function () {
      var rect = targetCanvas.getBoundingClientRect();
      targetCanvas.width  = Math.max(rect.width, 300) * dpr;
      targetCanvas.height = 150 * dpr;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      targetCanvas.style.height = '150px';
      context.strokeStyle = '#0f2744';
      context.lineWidth   = 2;
      context.lineCap     = 'round';
    };
    resize();

    var pos = function (e) {
      var r = targetCanvas.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: x, y: y };
    };

    var start = function (e) {
      e.preventDefault();
      padState.drawing = true;
      var p = pos(e);
      context.beginPath();
      context.moveTo(p.x, p.y);
    };
    var move = function (e) {
      if (!padState.drawing) return;
      e.preventDefault();
      var p = pos(e);
      context.lineTo(p.x, p.y);
      context.stroke();
    };
    var end = function () {
      if (!padState.drawing) return;
      padState.drawing = false;
      onComplete(targetCanvas.toDataURL('image/png'));
    };

    targetCanvas.addEventListener('mousedown', start);
    targetCanvas.addEventListener('mousemove', move);
    targetCanvas.addEventListener('mouseup', end);
    targetCanvas.addEventListener('mouseleave', end);
    targetCanvas.addEventListener('touchstart', start, { passive: false });
    targetCanvas.addEventListener('touchmove', move, { passive: false });
    targetCanvas.addEventListener('touchend', end);
    targetCanvas.addEventListener('touchcancel', end);

    return { context: context, resize: resize, clear: function () { resize(); } };
  }

  function getSigningTokenFromUrl() {
    var path = global.location.pathname || '';
    var m = path.match(/\/sign\/([^/]+)/);
    if (m) return m[1];
    return new URLSearchParams(global.location.search).get('token') || '';
  }

  function getOrigin() {
    return global.location.origin || '';
  }

  /* ================================================================
   *  EXPORT
   * ================================================================ */

  global.ContractCore = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    ADMIN_RATE: ADMIN_RATE,
    GBP: GBP,
    EM: EM,
    RATE_TABLE: RATE_TABLE,
    ROLE_ALIASES: ROLE_ALIASES,
    canonicalRoleName: canonicalRoleName,
    FLAT_HOURLY_RATES: FLAT_HOURLY_RATES,
    SCALE_OPTIONS: SCALE_OPTIONS,
    getScaleOptionsForRole: getScaleOptionsForRole,
    isFlatRateRole: isFlatRateRole,
    roleNeedsScalePicker: roleNeedsScalePicker,
    JOB_DESCRIPTIONS: JOB_DESCRIPTIONS,
    JOB_DESCRIPTION_VERSION: JOB_DESCRIPTION_VERSION,
    resolveJobDescription: resolveJobDescription,
    buildJobDescriptionsForRoles: buildJobDescriptionsForRoles,
    formatJobDescriptionsPlain: formatJobDescriptionsPlain,
    formatJobDescriptionsHtml: formatJobDescriptionsHtml,
    ACTIVE_CONTRACT_KINDS: ACTIVE_CONTRACT_KINDS,
    LOGO_PATH: LOGO_PATH,
    LOGO_DISPLAY: LOGO_DISPLAY,
    COMPANY_LEGAL_NAME: COMPANY_LEGAL_NAME,
    COMPANY_NUMBER: COMPANY_NUMBER,
    COMPANY_REGISTERED_ADDRESS: COMPANY_REGISTERED_ADDRESS,
    COMPANY_FOOTER_ADDRESS: COMPANY_FOOTER_ADDRESS,
    HR_CONTACT_EMAIL: HR_CONTACT_EMAIL,
    PENSION_SCHEME_NAME: PENSION_SCHEME_NAME,
    PENSION_SCHEME_URL: PENSION_SCHEME_URL,
    formatUKDate: formatUKDate,
    formatShortUKDate: formatShortUKDate,
    formatDateTime: formatDateTime,
    formatSalary: formatSalary,
    generateReference: generateReference,
    getDeliveryRate: getDeliveryRate,
    normalizeRoles: normalizeRoles,
    normalizeRoleScales: normalizeRoleScales,
    formatRoleScaleSummary: formatRoleScaleSummary,
    formatJobTitles: formatJobTitles,
    buildDeliveryRemuneration: buildDeliveryRemuneration,
    normalizeContractKind: normalizeContractKind,
    isSalariedKind: isSalariedKind,
    isZeroHoursKind: isZeroHoursKind,
    contractKindLabel: contractKindLabel,
    contractDocTitle: contractDocTitle,
    fillTemplate: fillTemplate,
    stripFilledMarkers: stripFilledMarkers,
    applyFilledHtml: applyFilledHtml,
    buildTemplateData: buildTemplateData,
    renderContractHtml: renderContractHtml,
    buildPdfHtml: buildPdfHtml,
    pdfFilename: pdfFilename,
    loadLogo: loadLogo,
    setupSignaturePad: setupSignaturePad,
    getSigningTokenFromUrl: getSigningTokenFromUrl,
    getOrigin: getOrigin,
    get logoDataUrl() { return logoDataUrl; },
    set logoDataUrl(v) { logoDataUrl = v; }
  };

})(typeof window !== 'undefined' ? window : global);
