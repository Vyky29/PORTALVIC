/* Shared contract logic ? clubSENsational HR Contract Portal */
(function (global) {
  'use strict';

  const CONTRACT_VERSION = '1.3';
  const ADMIN_RATE = '13';
  const GBP = '\u00A3';
  const EM = '\u2014';
  const HR_CONTACT_EMAIL = 'hr@clubsensational.co.uk';
  const COMPANY_LEGAL_NAME = 'clubSENsational LTD';
  const COMPANY_NUMBER = '13755417';
  const COMPANY_REGISTERED_ADDRESS = '71-75 Shelton Street, Covent Garden, WC2H 9JQ, London, United Kingdom';
  const COMPANY_FOOTER_ADDRESS = '71-75 Shelton Street, Covent Garden, WC2H 9JQ, London';
  const LOGO_PATH = '../assets/clubsensational-logo-hq.png?v=2';
  const LOGO_DISPLAY = '../assets/clubsensational-logo.png?v=2';
  const RATE_TABLE = {
    'Support Worker': { 'Scale 1': 18, 'Scale 2': 20, 'Scale 3': 23 },
    'Climbing Instructor': { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 30 },
    'Fitness Instructor': { 'Scale 1': 24, 'Scale 2': 28, 'Scale 3': 32 },
    'Swimming Instructor': { 'Scale 1': 22, 'Scale 2': 24, 'Scale 3': 28 },
    'Business Development': { 'Scale 1': 22, 'Scale 2': 26, 'Scale 3': 30 }
  };
  const SCALE_OPTIONS = ['Scale 1', 'Scale 2', 'Scale 3'];
  const PARTY_BLOCKS = ['EMPLOYEE DETAILS:', 'EMPLOYER DETAILS:'];
  const SIGNATURE_BLOCKS = ['EMPLOYEE SIGNATURE', 'DIRECTOR SIGNATURE'];
  const SECTION_HEADERS = new Set([
    'BACKGROUND:',
    'PARTICULARS OF EMPLOYMENT',
    'COMMENCEMENT DATE AND TERM',
    'JOB TITLE AND DESCRIPTION',
    'EMPLOYEE REMUNERATION',
    'PENSION',
    'PLACE OF WORK',
    'TIME OF WORK',
    'PROBATION PERIOD',
    'FIXED-TERM EMPLOYEE TREATMENT',
    'SICKNESS AND DISABILITY',
    'HOLIDAY ENTITLEMENT',
    'DISCIPLINARY PROCEDURE',
    'GRIEVANCE PROCEDURE',
    'CONFIDENTIAL INFORMATION',
    'OWNERSHIP OF CONFIDENTIAL INFORMATION',
    'RETURN OF CONFIDENTIAL INFORMATION',
    'CONTRACT BINDING AUTHORITY',
    'TERMINATION OF EMPLOYMENT',
    'GOVERNING LAW',
    'GENERAL PROVISIONS',
    'SIGNATURES',
    'ACKNOWLEDGEMENT'
  ]);

  function isSectionHeader(line) {
    const t = (line || '').trim();
    if (!t) return false;
    if (SECTION_HEADERS.has(t)) return true;
    return t.indexOf('WRITTEN PARTICULARS') === 0 || t.indexOf('ANNEX A') === 0;
  }
  const ZERO_HOURS_MASTER_TEMPLATE = [
    'ZERO HOURS EMPLOYMENT CONTRACT', '',
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
    'IN CONSIDERATION OF the matters described above and of of the mutual benefits and obligations set forth in this Agreement, the parties agree as follows:', '',
    'PARTICULARS OF EMPLOYMENT',
    "As required by section 1 of the Employment Rights Act 1996, the particulars of the Employee's employment are detailed within this agreement.", '',
    'COMMENCEMENT DATE AND TERM',
    'The Employee will commence employment with the Employer on {{COMMENCEMENT_DATE}}.',
    "The Employee's schedule of employment will be as follows:",
    '{{CONTRACT_TYPE}}', '',
    'JOB TITLE AND DESCRIPTION',
    'The initial job title of the Employee will be:',
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
    '{{DELIVERY_REMUNERATION}}',
    "If the Employer cancels a scheduled shift with at least 24 hours' notice, the Employee shall not be entitled to remuneration for that shift.",
    'If the cancellation occurs less than 24 hours before the scheduled start time, the Employee shall be entitled to full remuneration for the shift as originally scheduled.',
    'This remuneration will be payable once per month while this Agreement is in force.',
    "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
    "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time.", '',
    'PENSION',
    "The Employer will meet its automatic enrolment duties under the Pensions Act 2008. Where required by law, eligible employees will be automatically enrolled into the Employer's qualifying workplace pension scheme (or a scheme nominated by the Employer). Eligibility is assessed on earnings paid by this Employer only. Further details will be provided separately and are available on request.", '',
    'PLACE OF WORK',
    "The Employee's place of work will be:",
    '{{PLACE_OF_WORK}}', '',
    'TIME OF WORK',
    "The Employee's normal hours of work, including breaks, are as follows:",
    '{{NORMAL_HOURS_OF_WORK}}',
    "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's normal hours of work as deemed necessary by the Employer to meet business needs, as permitted by law.", '',
    'SICKNESS AND DISABILITY',
    'If the Employee is unable to perform their duties as a result of illness or injury, the Employee will inform the Company Director by email no later than the night before, or not later than 7:00 am on the day of the absence.',
    'If the Employee satisfies the qualifying conditions for Statutory Sick Pay (SSP) under UK law, they will be entitled to receive SSP for any period of sickness or injury during agreed hours. No contractual sick pay is payable unless stated in a separate policy.', '',
    'HOLIDAY ENTITLEMENT',
    "The Employee's holiday entitlement will depend on the number of hours actually worked and will be pro rated based on a full time entitlement of 28 days' holiday during each full holiday year, including the usual eight public holidays in England and Wales.",
    "The Business' holiday year runs between 1 January and 31 December.",
    'Holiday pay accrues in proportion to hours worked and will be calculated and paid in accordance with the Working Time Regulations 1998 and the Employer\'s lawful payroll practice (including, where permitted for irregular-hours workers, rolled-up holiday pay at not less than 12.07% of qualifying pay in the relevant pay period, itemised separately on payslips where applicable).', '',
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
    "The Employer may terminate the Employee's employment by giving not less than two weeks' written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
    'If the Employee wishes to terminate their employment, they must provide not less than two weeks\' written notice, or such longer period of notice as required by statute.',
    'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.', '',
    'GOVERNING LAW',
    'This Agreement will be construed in accordance with and governed by the laws of England.', '',
    'GENERAL PROVISIONS',
    'This Agreement constitutes the entire agreement between the parties.',
    'Any amendment or modification to this Agreement will only be binding if evidenced in writing and signed by both parties or their authorised representatives.',
    'This Agreement supersedes any previous employment agreement between the Employer and the Employee.', '',
    'WRITTEN PARTICULARS (ERA 1996, s.1)',
    'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
    'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
    'Job Title: {{JOB_TITLE}}',
    'Start Date: {{COMMENCEMENT_DATE}} (zero-hours; no fixed end date)',
    'Pay: Hourly rates as set out in Employee Remuneration (scale selected per role).',
    'Hours: Variable according to business need; no minimum guaranteed hours.',
    'Place of Work: {{PLACE_OF_WORK}}',
    'Holiday: Pro-rated statutory entitlement (see Holiday Entitlement).',
    'Pension: Auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
    'Notice: Not less than two weeks, or statutory minimum if greater.',
    'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection (Employee Manual).', '',
    'SIGNATURES',
    'By signing below, the Employee confirms that they have read, understood and agreed to the terms of this Employment Contract, including the workplace pension information at Annex A.', '',
    'EMPLOYEE SIGNATURE',
    'Name: {{EMPLOYEE_FULL_NAME}}',
    'Date: {{EMPLOYEE_SIGNATURE_DATE}}',
    'Signature: {{EMPLOYEE_SIGNATURE}}', '',
    'DIRECTOR SIGNATURE',
    'Name: {{DIRECTOR_NAME}}',
    'Date: {{DIRECTOR_SIGNATURE_DATE}}',
    'Signature: {{DIRECTOR_SIGNATURE}}', '',
    'ACKNOWLEDGEMENT',
    'I confirm that I have read, understood and agree to the terms of this employment contract, and that I have received the workplace pension information at Annex A.', '',
    'ANNEX A ' + EM + ' WORKPLACE PENSION (AUTO-ENROLMENT INFORMATION)',
    'Date: {{CONTRACT_DATE}}',
    'To: {{EMPLOYEE_FULL_NAME}} ({{EMPLOYEE_EMAIL}})',
    'From: ' + COMPANY_LEGAL_NAME + ', ' + COMPANY_REGISTERED_ADDRESS,
    'Dear {{EMPLOYEE_FULL_NAME}},',
    'This letter is issued with your zero-hours employment contract to explain how workplace pension automatic enrolment applies to your employment with clubSENsational Ltd. We are required by UK law (the Pensions Act 2008) to operate qualifying workplace pension arrangements and to give you this information within six weeks of starting work with us.',
    'HOW AUTO-ENROLMENT WORKS',
    'Automatic enrolment means eligible workers are enrolled into a workplace pension scheme unless they choose to opt out within one month. Your eligibility is assessed using qualifying earnings paid by clubSENsational only. Earnings from any other employer are not counted, even if you have a higher salary elsewhere.',
    'For the current tax year, the main earnings threshold for automatic enrolment is ' + GBP + '10,000 per year from this Employer (' + GBP + '833 per month or ' + GBP + '192 per week). The lower qualifying earnings threshold is ' + GBP + '6,240 per year (' + GBP + '520 per month or ' + GBP + '120 per week).',
    'YOUR CURRENT POSITION',
    'You are employed on a zero-hours contract. You may not be automatically enrolled when you start if your earnings from clubSENsational are below the automatic enrolment threshold. This is common where staff also work for other employers.',
    'We will assess your earnings from clubSENsational on each payday. If you meet the eligibility criteria in a pay reference period, we will automatically enrol you and write to you, unless a lawful postponement applies.',
    'YOUR RIGHTS',
    '1. If you earn more than ' + GBP + '10,000 per year from clubSENsational and are aged at least 22 but under State Pension Age: we must automatically enrol you and pay employer pension contributions (minimum 3% of qualifying earnings, subject to scheme rules).',
    '2. If you earn between ' + GBP + '6,240 and ' + GBP + '10,000 per year from clubSENsational: you may opt in to our workplace pension scheme. If you opt in, we must pay employer contributions.',
    '3. If you earn below ' + GBP + '6,240 per year from clubSENsational: you may request to join our pension scheme, but we are not required to pay employer contributions.',
    '4. If you are automatically enrolled: you may opt out within one month of enrolment and receive a refund of contributions paid in that period, in accordance with scheme rules.',
    'CONTRIBUTIONS',
    'Where contributions apply, the minimum total contribution is ordinarily 8% of qualifying earnings between ' + GBP + '6,240 and ' + GBP + '50,270 per year, of which the employer pays at least 3% and the worker pays the remainder (with tax relief where applicable). Actual rates depend on the pension scheme rules.',
    'CONTACT AND FURTHER INFORMATION',
    'To opt in, ask questions, or notify us of a change in circumstances, contact HR at ' + HR_CONTACT_EMAIL + '.',
    'Independent guidance is available from The Pensions Regulator (www.thepensionsregulator.gov.uk) and MoneyHelper (www.moneyhelper.org.uk).',
    'Yours sincerely,',
    '{{DIRECTOR_NAME}}',
    'For and on behalf of clubSENsational Ltd'
  ].join('\n').replace('of of the', 'of the');

  const FIXED_TERM_MASTER_TEMPLATE = [
    'FIXED TERM EMPLOYMENT CONTRACT', '',
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
    'This employment is for a fixed term ending on {{TERM_END_DATE}} (the "End Date") unless terminated earlier in accordance with this Agreement or by mutual written agreement. Unless terminated earlier under this Agreement or by law, employment will end automatically on the End Date without the need for further notice.', '',
    'JOB TITLE AND DESCRIPTION',
    'The initial job title of the Employee will be:',
    '{{JOB_TITLE}}',
    'The Employee agrees to be employed on the terms and conditions set out in this Agreement.',
    'The Employee agrees to be subject to the general supervision of and act pursuant to the orders, advice and direction of the Employer.',
    'The Employee will perform all duties as requested by the Employer that are reasonable and customarily performed by a person holding a similar position in the industry or business of the Employer.',
    "The Employee's job title or duties may be changed by agreement and with the approval of both the Employee and the Employer or after a notice period required under law.",
    'The Employee delivers structured, autism-informed sessions (PixtoLearn Swimming model; TEACCH/PECS/sensory-informed strategies), attends planning/supervision, and completes session records. Duties may reasonably vary with service needs. Follow all Company policies, including Equipment & Uniform Policy.',
    "The Employee agrees to abide by the Employer's rules, regulations, policies and practices, including those concerning work schedules, annual leave and sick leave, as they may from time to time be adopted or modified.",
    "The Employee agrees to follow the Employer's Equipment and Uniform Policy and is responsible for the proper use, maintenance and care of any equipment, tools, uniforms and materials provided by the Employer for work purposes.",
    'The Employee warrants that they are legally allowed to work in England.', '',
    'EMPLOYEE REMUNERATION',
    'Remuneration paid to the Employee for the services rendered by the Employee under this Agreement will consist of a salary of:', '',
    '{{ANNUAL_SALARY}} per year (inclusive of statutory holiday pay for a part-year worker), paid monthly in arrears via payroll on or around the last working day of the month. Statutory deductions will be made. Holiday pay is calculated and paid in accordance with the Working Time Regulations 1998 and the Employer\'s lawful payroll practice.',
    'The monthly salary is payable while this Agreement remains in force and is not reduced by individual session cancellations within the agreed Normal Hours of Work and term-time pattern, provided the Employee remains available for work in accordance with this Agreement.',
    'This remuneration will be payable once per month while this Agreement is in force.',
    "The Employer is entitled to deduct from the Employee's remuneration, or from any other remuneration in whatever form, any applicable deductions and remittances as required by law.",
    "The Employer will reimburse the Employee for all reasonable expenses, in accordance with the Employer's lawful policies as in effect from time to time.", '',
    'PENSION',
    "The Employer will meet its automatic enrolment duties under the Pensions Act 2008. Where required by law, eligible employees will be automatically enrolled into the Employer's qualifying workplace pension scheme (or a scheme nominated by the Employer). Eligibility is assessed on earnings paid by this Employer only. Further details will be provided separately and are available on request.", '',
    'PLACE OF WORK',
    "The Employee's place of work will be at the following locations:",
    '{{PLACE_OF_WORK}}',
    'Travel between sites may be required.', '',
    'TIME OF WORK',
    'The Employee\'s normal hours of work, excluding breaks ("Normal Hours of Work"), are as follows:',
    '{{WEEKLY_HOURS}} hours per week (term-time).',
    '{{NORMAL_HOURS_OF_WORK}}',
    'The Employer will issue weekly rota details by email. These set out operational scheduling within the Normal Hours of Work and place(s) of work in this Agreement. They do not amend this Agreement unless agreed in writing by both parties.',
    "However, the Employee will, on receiving reasonable notice from the Employer, work additional hours and/or hours outside of the Employee's Normal Hours of Work as deemed necessary by the Employer to meet business needs, as permitted by law.",
    'The employee must deliver 12 hours of sessions during one selected half-term or holiday period (October, February, Easter, or May). These hours are usually scheduled in consecutive morning slots (e.g., 9:00-13:00) across the chosen week.', '',
    'PROBATION PERIOD',
    "The Employee's employment will be subject to a probationary period of up to six (6) months commencing from the Commencement Date, or such shorter period as is proportionate to the length of this fixed-term contract.",
    "During the probation period, the Employee's performance and conduct will be reviewed. At the end of the probationary period, the Employee will be informed in writing whether their employment is to be confirmed, extended, or terminated.",
    "The Employer reserves the right to extend the probationary period if additional time is needed to assess the Employee's performance, subject to the overall fixed term.", '',
    'FIXED-TERM EMPLOYEE TREATMENT',
    'The Employee is employed on a fixed-term contract. The Employee will not be treated less favourably than a comparable permanent employee solely because of fixed-term status, in accordance with the Fixed-term Employees (Prevention of Less Favourable Treatment) Regulations 2002.', '',
    'SICKNESS AND DISABILITY',
    'If the Employee is unable to perform their duties as a result of illness or injury, the Employee will inform the Company Director by email no later than 7:00 am on the day of the absence.',
    'Subject to compliance with this Agreement and our Sickness Policy, the Employee shall receive sick pay in accordance with our Sickness Policy, which may be amended from time to time. Qualifying days for SSP purposes are Monday to Friday.', '',
    'HOLIDAY ENTITLEMENT',
    "The Business' holiday year runs between 1 January and 31 December.",
    'Statutory entitlement is included within the total pay; ordinarily taken outside term-time.', '',
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
    "The Employer may terminate the Employee's employment before the End Date by giving not less than two weeks' written notice, or such longer period of notice as required by statute, except where summary dismissal without notice is permitted by law for gross misconduct.",
    'If the Employee wishes to terminate their employment before the End Date, they must provide not less than two weeks\' written notice, or such longer period of notice as required by statute.',
    'Upon termination, the Employer will pay any outstanding remuneration and accrued holiday entitlement calculated up to the termination date.',
    'Unless terminated earlier under this Agreement or by law, employment will end automatically on {{TERM_END_DATE}} without the need for further notice.', '',
    'GOVERNING LAW',
    'This Agreement will be construed in accordance with and governed by the laws of England.', '',
    'GENERAL PROVISIONS',
    'This Agreement constitutes the entire agreement between the parties.',
    'Any amendment or modification to this Agreement will only be binding if evidenced in writing and signed by both parties or their authorised representatives.',
    'This Agreement supersedes any previous employment agreement between the Employer and the Employee.', '',
    'WRITTEN PARTICULARS (ERA 1996, s.1)',
    'Employee: {{EMPLOYEE_FULL_NAME}}, {{EMPLOYEE_ADDRESS}}',
    'Employer: clubSENsational Ltd, ' + COMPANY_REGISTERED_ADDRESS + ' (Company No. ' + COMPANY_NUMBER + ')',
    'Job Title: {{JOB_TITLE}}',
    'Start Date: {{COMMENCEMENT_DATE}} ' + EM + ' End Date: {{TERM_END_DATE}} (fixed term; automatic expiry on End Date)',
    'Salary: {{ANNUAL_SALARY}} per annum (inclusive of statutory holiday pay for a part-year worker)',
    'Hours: {{WEEKLY_HOURS}} hours/week (term-time).',
    'Place of Work: {{PLACE_OF_WORK}}',
    'Holiday: Statutory entitlement included within total pay; ordinarily taken outside term-time.',
    'Pension: Auto-enrolment if eligible under UK law (earnings assessed by this Employer only).',
    'Probation: Up to six months, or shorter if proportionate to contract length.',
    'Policies: Disciplinary, Grievance, Equipment & Uniform, Safeguarding, H&S, Data Protection.', '',
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

  let logoDataUrl = '';

  function normalizeContractKind(kind) {
    return kind === 'fixed_term' ? 'fixed_term' : 'zero_hours';
  }

  function getMasterTemplate(kind) {
    return normalizeContractKind(kind) === 'fixed_term'
      ? FIXED_TERM_MASTER_TEMPLATE
      : ZERO_HOURS_MASTER_TEMPLATE;
  }

  function formatUKDate(d) {
    if (!d) return EM;
    return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formatShortUKDate(d) {
    if (!d) return EM;
    const dt = new Date(d + 'T12:00:00');
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
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
    const n = Number(String(amount).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return EM;
    return GBP + n.toLocaleString('en-GB');
  }

  function generateReference(employeeName, kind) {
    const name = (employeeName || 'EMP').replace(/\s+/g, '').slice(0, 4).toUpperCase();
    const prefix = normalizeContractKind(kind) === 'fixed_term' ? 'CS-FT' : 'CS-ZH';
    return prefix + '-' + name + '-' + Date.now().toString(36).toUpperCase();
  }

  function getDeliveryRate(role, scale) {
    return (role && scale && RATE_TABLE[role]) ? RATE_TABLE[role][scale] : null;
  }

  function normalizeRoles(o) {
    const src = o || {};
    if (Array.isArray(src.roles) && src.roles.length) {
      return src.roles.map((r) => String(r || '').trim()).filter(Boolean);
    }
    if (src.role && String(src.role).trim()) {
      return String(src.role)
        .split(/\s*&\s*/)
        .map((r) => r.trim())
        .filter(Boolean);
    }
    return [];
  }

  function formatJobTitles(roles) {
    if (!roles || !roles.length) return '';
    return roles.join(' & ');
  }

  function normalizeRoleScales(o, roles) {
    const src = o || {};
    const roleList = roles || normalizeRoles(src);
    const out = {};
    if (src.roleScales && typeof src.roleScales === 'object' && !Array.isArray(src.roleScales)) {
      roleList.forEach((role) => {
        const scale = src.roleScales[role];
        if (scale) out[role] = String(scale);
      });
      return out;
    }
    if (Array.isArray(src.roleScales)) {
      src.roleScales.forEach((entry) => {
        if (entry && entry.role && entry.scale) out[String(entry.role)] = String(entry.scale);
      });
      return out;
    }
    if (src.scale) {
      roleList.forEach((role) => { out[role] = String(src.scale); });
    }
    return out;
  }

  function formatRoleScaleSummary(roleScales, roles) {
    return (roles || [])
      .map((role) => {
        const scale = roleScales && roleScales[role];
        return scale ? role + ' (' + scale + ')' : role;
      })
      .filter(Boolean)
      .join('; ');
  }

  function buildDeliveryRemuneration(roles, scales) {
    const lines = [];
    const scaleMap = typeof scales === 'string'
      ? Object.fromEntries((roles || []).map((role) => [role, scales]))
      : (scales || {});
    (roles || []).forEach((role) => {
      const scale = scaleMap[role];
      const rate = getDeliveryRate(role, scale);
      if (rate != null && scale) {
        lines.push(GBP + rate + '/h Delivery Service (' + scale + ' ' + EM + ' ' + role + ')');
      }
    });
    lines.push(
      GBP + ADMIN_RATE + '/h (Reviewed annually in line with Minimum Wage) ' + EM + ' Administrative Tasks, Inductions and Training.'
    );
    return lines.join('\n');
  }

  function sanitizeContractText(text) {
    return String(text || '')
      .replace(/\uFFFD/g, '-')
      .replace(/(\d:\d{2})\?(\d{1,2}:\d{2})/g, '$1-$2')
      .replace(/ Fixed Term \? from /g, ' Fixed Term ' + EM + ' from ')
      .replace(/ \? End Date: /g, ' ' + EM + ' End Date: ')
      .replace(/ANNEX A \? WORKPLACE/g, 'ANNEX A ' + EM + ' WORKPLACE')
      .replace(/\?(\d)/g, GBP + '$1');
  }

  function fillTemplate(data, kind) {
    const contractKind = normalizeContractKind(kind || (data && data.CONTRACT_KIND));
    let text = getMasterTemplate(contractKind);
    Object.keys(data || {}).forEach((k) => { text = text.split('{{' + k + '}}').join(data[k]); });
    return sanitizeContractText(text);
  }

  function buildTemplateData(opts) {
    const o = opts || {};
    const kind = normalizeContractKind(o.contractKind);
    const roles = normalizeRoles(o);
    const roleScales = normalizeRoleScales(o, roles);
    const roleScaleSummary = formatRoleScaleSummary(roleScales, roles);
    const jobTitle = formatJobTitles(roles) || (o.role ? String(o.role).trim() : '') || EM;
    const today = new Date().toISOString().slice(0, 10);
    const directorSig = o.directorSignatureDataUrl ? '[Signed electronically]' : (o.directorName || EM);
    const employeeSig = o.employeeSignatureDataUrl ? '[Signed electronically]' : (o.employeePending ? 'Pending employee signature' : EM);
    const shared = {
      CONTRACT_VERSION,
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
      NORMAL_HOURS_OF_WORK: o.normalHoursOfWork || (kind === 'fixed_term' ? EM : 'Variable hours'),
      DIRECTOR_NAME: o.directorName || EM,
      EMPLOYEE_SIGNATURE_DATE: o.employeeSignatureDate || formatUKDate(today),
      EMPLOYEE_SIGNATURE: employeeSig,
      DIRECTOR_SIGNATURE_DATE: o.directorSignatureDate || formatUKDate(today),
      DIRECTOR_SIGNATURE: directorSig,
      EMPLOYEE_ACKNOWLEDGEMENT: o.employeeAcknowledged ? 'Confirmed' : 'Pending',
      SIGNED_TIMESTAMP: o.signedTimestamp || EM
    };

    if (kind === 'fixed_term') {
      return Object.assign(shared, {
        CONTRACT_TYPE: 'Fixed Term ' + EM + ' from ' + formatShortUKDate(o.commencementDate) + ' to ' + formatShortUKDate(o.termEndDate),
        TERM_END_DATE: formatUKDate(o.termEndDate),
        TERM_START_SHORT: formatShortUKDate(o.commencementDate),
        TERM_END_SHORT: formatShortUKDate(o.termEndDate),
        ANNUAL_SALARY: formatSalary(o.annualSalary),
        WEEKLY_HOURS: o.weeklyHours != null && o.weeklyHours !== '' ? String(o.weeklyHours) : EM,
        ROLE_SCALE: EM,
        DELIVERY_RATE: EM,
        DELIVERY_REMUNERATION: EM,
        ADMIN_RATE: EM
      });
    }

    const firstRole = roles.length ? roles[0] : '';
    const firstScale = firstRole ? roleScales[firstRole] : '';
    const firstRate = firstRole ? getDeliveryRate(firstRole, firstScale) : null;
    return Object.assign(shared, {
      CONTRACT_TYPE: 'Zero Hours Contract ' + EM + ' hours worked will vary according to business requirements and mutual agreement.',
      ROLE_SCALE: roleScaleSummary || o.scale || EM,
      DELIVERY_RATE: firstRate != null ? String(firstRate) : EM,
      DELIVERY_REMUNERATION: buildDeliveryRemuneration(roles, roleScales),
      ADMIN_RATE,
      TERM_END_DATE: EM,
      ANNUAL_SALARY: EM,
      WEEKLY_HOURS: EM
    });
  }

  function contractDocTitle(kind) {
    return normalizeContractKind(kind) === 'fixed_term'
      ? 'Fixed Term Employment Contract'
      : 'Zero Hours Employment Contract';
  }

  function renderContractHtml(filledText, forPdf, sigs, kind) {
    const s = sigs || {};
    const contractKind = normalizeContractKind(kind);
    const logoSrc = s.logoDataUrl || logoDataUrl || LOGO_DISPLAY;
    const imgStyle = forPdf ? 'max-width:200px;height:auto;display:block;margin:0 auto 8px;' : '';
    const blocks = filledText.split('\n\n').filter((b) => b.trim());
    let body = '';
    let employeeDone = false, directorDone = false;
    blocks.forEach((block) => {
      if (block.startsWith('ZERO HOURS') || block.startsWith('FIXED TERM')) return;
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
        if (isSectionHeader(title)) {
          body += '<div class="contract-section"><h3>' + title + '</h3></div>';
        } else {
          body += '<div class="contract-section"><p style="white-space:pre-wrap;">' + block + '</p></div>';
        }
        return;
      }
      if (isSectionHeader(title)) {
        const annexClass = title.indexOf('ANNEX A') === 0 ? ' contract-annex' : '';
        body += '<div class="contract-section' + annexClass + '"><h3>' + title + '</h3><p style="white-space:pre-wrap;">' + rest + '</p></div>';
      } else {
        body += '<div class="contract-section"><p style="white-space:pre-wrap;">' + block + '</p></div>';
      }
    });
    return (
      '<div class="contract-document">' +
      '<header class="contract-letterhead">' +
      '<img src="' + logoSrc + '" srcset="' + LOGO_DISPLAY + ' 1x, assets/clubsensational-logo@2x.png?v=2 2x" alt="clubSENsational" class="contract-logo" width="260" height="188"' + (imgStyle ? ' style="' + imgStyle + ';max-width:260px;height:auto;"' : '') + '>' +
      '<div class="letterhead-legal">' + COMPANY_LEGAL_NAME + '</div>' +
      '</header>' +
      '<div class="contract-body">' +
      '<h1 class="contract-doc-title">' + contractDocTitle(contractKind) + '</h1>' +
      body +
      '</div>' +
      '<footer class="contract-footer">' + COMPANY_FOOTER_ADDRESS + ' &middot; Registered Company No. ' + COMPANY_NUMBER + '</footer>' +
      '</div>'
    );
  }

  function buildPdfHtml(templateData, sigs) {
    const kind = normalizeContractKind(templateData && templateData.CONTRACT_KIND);
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
      '.contract-annex{page-break-before:always;margin-top:20px;padding-top:14px;border-top:2px solid #c9a227;}' +
      '.contract-footer{font-family:Arial,sans-serif;font-size:7.5pt;color:#64748b;text-align:center;padding:10px 16px;border-top:1px solid #e2e8f0;background:#f7f9fb;}' +
      '</style>';
    return pdfStyles + renderContractHtml(fillTemplate(templateData, kind), true, sigs, kind);
  }

  function pdfFilename(templateData) {
    const kind = normalizeContractKind(templateData && templateData.CONTRACT_KIND);
    const name = (templateData.EMPLOYEE_FULL_NAME || 'Employee').replace(/\s+/g, '_');
    const role = (templateData.JOB_TITLE || 'Role').replace(/\s+/g, '_');
    const variant = kind === 'fixed_term' ? 'FixedTerm' : (templateData.ROLE_SCALE || 'Scale').replace(/\s+/g, '_');
    const date = templateData._contractDateRaw || new Date().toISOString().slice(0, 10);
    return 'ClubSENsational_Employment_Contract_' + name + '_' + role + '_' + variant + '_' + date + '.pdf';
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
    CONTRACT_VERSION, ADMIN_RATE, GBP, EM, RATE_TABLE, SCALE_OPTIONS, LOGO_PATH, LOGO_DISPLAY,
    COMPANY_LEGAL_NAME, COMPANY_NUMBER, COMPANY_REGISTERED_ADDRESS, COMPANY_FOOTER_ADDRESS, HR_CONTACT_EMAIL,
    formatUKDate, formatShortUKDate, formatDateTime, formatSalary, generateReference, getDeliveryRate,
    normalizeRoles, normalizeRoleScales, formatRoleScaleSummary, formatJobTitles, buildDeliveryRemuneration,
    fillTemplate, buildTemplateData, renderContractHtml, buildPdfHtml, pdfFilename,
    loadLogo, setupSignaturePad, getSigningTokenFromUrl, getOrigin,
    get logoDataUrl() { return logoDataUrl; },
    set logoDataUrl(v) { logoDataUrl = v; }
  };
})(typeof window !== 'undefined' ? window : global);
