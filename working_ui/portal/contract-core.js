/* Shared contract logic — clubSENsational HR Contract Portal */
(function (global) {
  'use strict';

  const CONTRACT_VERSION = '1.0';
  const ADMIN_RATE = '13';
  const GBP = '\u00A3';
  const EM = '\u2014';
  const LOGO_PATH = '../assets/clubsensational-logo-hq.png?v=2';
  const LOGO_DISPLAY = '../assets/clubsensational-logo.png?v=2';
  const RATE_TABLE = {
    'Support Worker': { 'Scale 1': 18, 'Scale 2': 20, 'Scale 3': 23 },
    'Climbing Instructor': { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 30 },
    'Fitness Instructor': { 'Scale 1': 24, 'Scale 2': 28, 'Scale 3': 32 },
    'Swimming Instructor': { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 28 }
  };
  const PARTY_BLOCKS = ['EMPLOYEE DETAILS:', 'EMPLOYER DETAILS:'];
  const SIGNATURE_BLOCKS = ['EMPLOYEE SIGNATURE', 'DIRECTOR SIGNATURE'];
  const MASTER_TEMPLATE = [
    'ZERO HOURS EMPLOYMENT CONTRACT', '',
    'THIS EMPLOYMENT CONTRACT dated {{CONTRACT_DATE}}', '',
    'BETWEEN:', '',
    'EMPLOYEE DETAILS:',
    'Full Name: {{EMPLOYEE_FULL_NAME}}',
    'Address: {{EMPLOYEE_ADDRESS}}',
    'Email: {{EMPLOYEE_EMAIL}}', '',
    'EMPLOYER DETAILS:',
    'clubSENsational LTD',
    '56A Valetta Road, W3 7TN, London, United Kingdom',
    'Registered Company No. 13755417', '',
    'BACKGROUND:',
    'The Employer is of the opinion that the Employee has the necessary qualifications, experience and abilities to assist and benefit the Employer in its business.',
    'The Employer desires to employ the Employee and the Employee has agreed to accept and enter such employment upon the terms and conditions set out in this Agreement.',
    'IN CONSIDERATION OF the matters described above and of of the mutual benefits and obligations set forth in this Agreement, the parties agree as follows:', '',
    'PARTICULARS OF EMPLOYMENT',
    "As required by section 1 of the Employment Rights Act 1996, the particulars of the Employee's employment are detailed within this agreement.", '',
    'COMMENCEMENT DATE AND TERM',
    'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}}.',
    "The Employee's schedule of employment will be as follows:", '',
    '{{CONTRACT_TYPE}}', '',
    'JOB TITLE AND DESCRIPTION',
    'The initial job title of the Employee will be:', '',
    '{{JOB_TITLE}}',
    'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
    'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
    'The Employee will perform any and all duties as requested by the Employer that are reasonable and customarily performed by a person holding a similar position in the industry or business of the Employer.',
    "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
    "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
    "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
    'The Employee warrants that they are legally allowed to work in England.', '',
    'EMPLOYEE REMUNERATION',
    'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of:', '',
    GBP + '{{DELIVERY_RATE}}/h Delivery Service ({{ROLE_SCALE}} ' + EM + ' {{JOB_TITLE}})', '',
    GBP + '{{ADMIN_RATE}}/h (Reviewed annually in line with Minimum Wage) ' + EM + ' Administrative Tasks, Inductions and Training.',
    "If the Employer cancels a scheduled shift with at least 24 hours' notice, the Employee shall not be entitled to remuneration for that shift.",
    'If the cancellation occurs less than 24 hours before the scheduled start time, the Employee shall be entitled to full remuneration for the shift as originally scheduled.',
    'This remuneration will be payable once per month while this Agreement is in force.',
    "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
    "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time.", '',
    'PENSION',
    'When required, the Employer will comply with its responsibility to operate a qualifying contributory pension scheme into which the Employee will be auto enrolled, subject to the conditions of the scheme.', '',
    'PLACE OF WORK',
    "The Employee's place of work will be:", '',
    '{{PLACE_OF_WORK}}', '',
    'TIME OF WORK',
    "The Employee's normal hours of work, including breaks, are as follows:", '',
    '{{NORMAL_HOURS_OF_WORK}}',
    "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's normal hours of work as deemed necessary by the Employer to meet business needs, as permitted by law.", '',
    'SICKNESS AND DISABILITY',
    'If the Employee is unable to perform their duties as a result of illness or injury, the Employee will inform the Company Director by email no later than the night before, or not later than 7:00 am on the day of the absence.',
    'If the Employee satisfies the qualifying conditions laid down by law, they will be entitled to receive statutory sick pay for any period of sickness or injury during agreed hours, but will not receive any other payments from the business during that time.', '',
    'HOLIDAY ENTITLEMENT',
    "The Employee's holiday entitlement will depend on the number of hours actually worked and will be pro rated based on a full time entitlement of 28 days' holiday during each full holiday year, including the usual eight public holidays in England and Wales.",
    "The Business' holiday year runs between 1 January and 31 December.", '',
    'DISCIPLINARY PROCEDURE',
    "The Employer's disciplinary procedure, as amended from time to time, applies to the Employee.",
    'The disciplinary procedure is set out in the Employee Manual and will be provided to the Employee or made available on request.', '',
    'GRIEVANCE PROCEDURE',
    "The Employer's grievance procedure, as amended from time to time, applies to the Employee.",
    'The grievance procedure is set out in the Employee Manual and will be provided to the Employee or made available on request.', '',
    'CONFIDENTIAL INFORMATION',
    'The Employee acknowledges that, during employment, they may access confidential information belonging to the Employer.',
    'The Employee agrees to keep all confidential information strictly confidential and not to disclose, use or share such information except as required for the proper performance of their duties or as authorised by the Employer.',
    'This obligation will continue after the end of employment.', '',
    'OWNERSHIP OF CONFIDENTIAL INFORMATION',
    'All confidential information, documents, materials, systems, resources and work related information remain the property of the Employer.', '',
    'RETURN OF CONFIDENTIAL INFORMATION',
    'Upon request, or upon termination of employment, the Employee must return all confidential information, documents, equipment, materials and records belonging to the Employer.', '',
    'CONTRACT BINDING AUTHORITY',
    'The Employee does not have authority to enter into contracts or commitments on behalf of the Employer without prior written consent.', '',
    'TERMINATION OF EMPLOYMENT',
    "Where there is just cause for termination, the Employer may terminate the Employee's employment with two weeks' notice, as permitted by law.",
    'If the Employee wishes to terminate their employment, they must provide two weeks\' notice.',
    'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.', '',
    'GOVERNING LAW',
    'This Agreement will be construed in accordance with and governed by the laws of England.', '',
    'GENERAL PROVISIONS',
    'This Agreement constitutes the entire agreement between the parties.',
    'Any amendment or modification to this Agreement will only be binding if evidenced in writing and signed by both parties or their authorised representatives.',
    'This Agreement supersedes any previous employment agreement between the Employer and the Employee.', '',
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
  ].join('\n').replace('of of the', 'of the');

  let logoDataUrl = '';

  function formatUKDate(d) {
    if (!d) return EM;
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatDateTime() {
    return new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function generateReference(employeeName) {
    const name = (employeeName || 'EMP').replace(/\s+/g, '').slice(0, 4).toUpperCase();
    return 'CS-ZH-' + name + '-' + Date.now().toString(36).toUpperCase();
  }

  function getDeliveryRate(role, scale) {
    return (role && scale && RATE_TABLE[role]) ? RATE_TABLE[role][scale] : null;
  }

  function fillTemplate(data) {
    let text = MASTER_TEMPLATE;
    Object.keys(data).forEach((k) => { text = text.split('{{' + k + '}}').join(data[k]); });
    return text;
  }

  function buildTemplateData(opts) {
    const o = opts || {};
    const rate = getDeliveryRate(o.role, o.scale);
    const today = new Date().toISOString().slice(0, 10);
    const directorSig = o.directorSignatureDataUrl ? '[Signed electronically]' : (o.directorName || EM);
    const employeeSig = o.employeeSignatureDataUrl ? '[Signed electronically]' : (o.employeePending ? 'Pending employee signature' : EM);
    return {
      CONTRACT_VERSION,
      CONTRACT_REFERENCE: o.contractReference || EM,
      GENERATED_DATE: o.generatedDate || formatDateTime(),
      CONTRACT_DATE: formatUKDate(o.contractDate),
      EMPLOYEE_FULL_NAME: o.employeeName || EM,
      EMPLOYEE_ADDRESS: o.employeeAddress || EM,
      EMPLOYEE_EMAIL: o.employeeEmail || EM,
      COMMENCEMENT_DATE: formatUKDate(o.commencementDate),
      CONTRACT_TYPE: 'Zero Hours Contract ' + EM + ' hours worked will vary according to business requirements and mutual agreement.',
      JOB_TITLE: o.role || EM,
      ROLE_SCALE: o.scale || EM,
      DELIVERY_RATE: rate != null ? String(rate) : EM,
      ADMIN_RATE,
      PLACE_OF_WORK: o.placeOfWork || EM,
      NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || 'Variable hours',
      DIRECTOR_NAME: o.directorName || EM,
      EMPLOYEE_SIGNATURE_DATE: o.employeeSignatureDate || formatUKDate(today),
      EMPLOYEE_SIGNATURE: employeeSig,
      DIRECTOR_SIGNATURE_DATE: o.directorSignatureDate || formatUKDate(today),
      DIRECTOR_SIGNATURE: directorSig,
      EMPLOYEE_ACKNOWLEDGEMENT: o.employeeAcknowledged ? 'Confirmed' : 'Pending',
      SIGNED_TIMESTAMP: o.signedTimestamp || EM
    };
  }

  function renderContractHtml(filledText, forPdf, sigs) {
    const s = sigs || {};
    const logoSrc = s.logoDataUrl || logoDataUrl || LOGO_DISPLAY;
    const imgStyle = forPdf ? 'max-width:200px;height:auto;display:block;margin:0 auto 8px;' : '';
    const blocks = filledText.split('\n\n').filter((b) => b.trim());
    let body = '';
    let employeeDone = false, directorDone = false;
    blocks.forEach((block) => {
      if (block.startsWith('ZERO HOURS')) return;
      if (block.startsWith('THIS EMPLOYMENT CONTRACT')) {
        body += '<p class="contract-opening">' + block + '</p>';
        return;
      }
      if (block === 'BETWEEN:') return;
      const lines = block.split('\n');
      const title = lines[0];
      const rest = lines.slice(1).join('\n');
      if (PARTY_BLOCKS.indexOf(title) >= 0) {
        body += '<div class="contract-parties"><strong>' + title.replace(':', '') + '</strong><p style="margin:0;white-space:pre-wrap;">' + rest + '</p></div>';
        return;
      }
      if (SIGNATURE_BLOCKS.indexOf(title) >= 0) {
        let extra = '';
        if (title === 'EMPLOYEE SIGNATURE' && !employeeDone && s.employeeSignatureDataUrl) {
          employeeDone = true;
          extra = '<img src="' + s.employeeSignatureDataUrl + '" alt="Employee signature" style="max-width:200px;height:65px;display:block;margin-top:8px;">';
        }
        if (title === 'DIRECTOR SIGNATURE' && !directorDone && s.directorSignatureDataUrl) {
          directorDone = true;
          extra = '<img src="' + s.directorSignatureDataUrl + '" alt="Director signature" style="max-width:200px;height:65px;display:block;margin-top:8px;">';
        }
        const restClean = rest.replace(/Signature: \[Signed electronically\]\s*/g, '').trim();
        body += '<div class="contract-section contract-signature-block"><h3>' + title + '</h3><p style="margin:0;white-space:pre-wrap;">' + restClean + '</p>' + extra + '</div>';
        return;
      }
      if (lines.length === 1) {
        if (/^[A-Z0-9\s&'\-\(\)\.]+$/.test(title) && title.length < 80) {
          body += '<div class="contract-section"><h3>' + title + '</h3></div>';
        } else {
          body += '<div class="contract-section"><p>' + block + '</p></div>';
        }
        return;
      }
      body += '<div class="contract-section"><h3>' + title + '</h3><p style="white-space:pre-wrap;">' + rest + '</p></div>';
    });
    return (
      '<div class="contract-document">' +
      '<header class="contract-letterhead">' +
      '<img src="' + logoSrc + '" srcset="' + LOGO_DISPLAY + ' 1x, assets/clubsensational-logo@2x.png?v=2 2x" alt="clubSENsational" class="contract-logo" width="260" height="188"' + (imgStyle ? ' style="' + imgStyle + ';max-width:260px;height:auto;"' : '') + '>' +
      '<div class="letterhead-legal">clubSENsational LTD</div>' +
      '</header>' +
      '<div class="contract-body">' +
      '<h1 class="contract-doc-title">Zero Hours Employment Contract</h1>' +
      body +
      '</div>' +
      '<footer class="contract-footer">56A Valetta Road, W3 7TN, London &middot; Registered Company No. 13755417</footer>' +
      '</div>'
    );
  }

  function buildPdfHtml(templateData, sigs) {
    const pdfStyles = '<style>' +
      '.contract-document{font-family:Georgia,serif;color:#111;}' +
      '.contract-letterhead{background:#fff;padding:18px 22px 12px;text-align:center;border-bottom:3px solid #c9a227;}' +
      '.contract-logo{width:260px;max-width:260px;height:auto;display:block;margin:0 auto;}' +
      '.letterhead-legal{margin-top:8px;font-family:Arial,sans-serif;font-size:8pt;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#0f2744;}' +
      '.contract-body{padding:18px 22px;}' +
      '.contract-doc-title{text-align:center;font-size:12pt;font-weight:700;color:#0f2744;letter-spacing:0.05em;text-transform:uppercase;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid #c9a227;}' +
      '.contract-opening{text-align:center;font-weight:600;color:#0f2744;margin:0 0 14px;font-size:10pt;}' +
      '.contract-section h3{font-family:Arial,sans-serif;font-size:8.5pt;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#0f2744;margin:14px 0 6px;padding-bottom:3px;border-bottom:1px solid #c9a227;}' +
      '.contract-section p{margin:0 0 8px;font-size:9.5pt;line-height:1.45;text-align:justify;}' +
      '.contract-parties{background:#e8f0f6;border:1px solid #b8cfd9;border-left:3px solid #0f2744;padding:10px 12px;margin:8px 0 12px;font-size:9pt;}' +
      '.contract-parties strong{display:block;font-family:Arial,sans-serif;font-size:8pt;text-transform:uppercase;color:#0f2744;margin-bottom:4px;}' +
      '.contract-signature-block{border-top:1px dashed #ccc;padding-top:8px;}' +
      '.contract-footer{font-family:Arial,sans-serif;font-size:7.5pt;color:#64748b;text-align:center;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f7f9fb;}' +
      '</style>';
    return pdfStyles + renderContractHtml(fillTemplate(templateData), true, sigs);
  }

  function pdfFilename(templateData) {
    const name = (templateData.EMPLOYEE_FULL_NAME || 'Employee').replace(/\s+/g, '_');
    const role = (templateData.JOB_TITLE || 'Role').replace(/\s+/g, '_');
    const scale = (templateData.ROLE_SCALE || 'Scale').replace(/\s+/g, '_');
    const date = templateData._contractDateRaw || new Date().toISOString().slice(0, 10);
    return 'ClubSENsational_Employment_Contract_' + name + '_' + role + '_' + scale + '_' + date + '.pdf';
  }

  function loadLogo() {
    return fetch(LOGO_PATH)
      .then((r) => { if (!r.ok) throw new Error('logo'); return r.blob(); })
      .then((blob) => new Promise((resolve) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => resolve('');
        fr.readAsDataURL(blob);
      }))
      .catch(() => '');
  }

  function setupSignaturePad(targetCanvas, padState, onComplete) {
    const context = targetCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = targetCanvas.getBoundingClientRect();
      targetCanvas.width = Math.max(rect.width, 300) * dpr;
      targetCanvas.height = 150 * dpr;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.scale(dpr, dpr);
      targetCanvas.style.height = '150px';
      context.strokeStyle = '#0f2744';
      context.lineWidth = 2;
      context.lineCap = 'round';
    };
    resize();
    const pos = (e) => {
      const r = targetCanvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x, y };
    };
    const start = (e) => { e.preventDefault(); padState.drawing = true; const p = pos(e); context.beginPath(); context.moveTo(p.x, p.y); };
    const move = (e) => {
      if (!padState.drawing) return;
      e.preventDefault();
      const p = pos(e);
      context.lineTo(p.x, p.y);
      context.stroke();
    };
    const end = () => {
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
    return { context, resize, clear: () => { resize(); } };
  }

  function getSigningTokenFromUrl() {
    const path = global.location.pathname || '';
    const m = path.match(/\/sign\/([^/]+)/);
    if (m) return m[1];
    return new URLSearchParams(global.location.search).get('token') || '';
  }

  function getOrigin() {
    return global.location.origin || '';
  }

  global.ContractCore = {
    CONTRACT_VERSION, ADMIN_RATE, GBP, EM, RATE_TABLE, LOGO_PATH, LOGO_DISPLAY,
    formatUKDate, formatDateTime, generateReference, getDeliveryRate,
    fillTemplate, buildTemplateData, renderContractHtml, buildPdfHtml, pdfFilename,
    loadLogo, setupSignaturePad, getSigningTokenFromUrl, getOrigin,
    get logoDataUrl() { return logoDataUrl; },
    set logoDataUrl(v) { logoDataUrl = v; }
  };
})(typeof window !== 'undefined' ? window : global);
