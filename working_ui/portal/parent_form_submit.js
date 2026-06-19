/**
 * Submit parent registration PDFs to Portal Supabase (portal-parent-form-submit).
 */
(function (global) {
  'use strict';

  function supabaseBase() {
    return String(global.SUPABASE_URL || '').replace(/\/$/, '');
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || '').trim();
  }

  function submitParentForm(opts) {
    var options = opts || {};
    var pdfBlob = options.pdf;
    if (!(pdfBlob instanceof Blob)) {
      return Promise.reject(new Error('PDF is required.'));
    }
    var formType = String(options.form_type || '').trim();
    if (formType !== 'climbing_registration' && formType !== 'client_registration') {
      return Promise.reject(new Error('Invalid form type.'));
    }
    var participantName = String(options.participant_name || '').trim();
    if (!participantName) {
      return Promise.reject(new Error('Participant name is required.'));
    }

    var base = supabaseBase();
    var key = anonKey();
    if (!base || !key) {
      return Promise.reject(new Error('Portal configuration missing.'));
    }

    var fd = new FormData();
    fd.append('form_type', formType);
    fd.append('participant_name', participantName);
    if (options.participant_dob) fd.append('participant_dob', String(options.participant_dob));
    if (options.parent_name) fd.append('parent_name', String(options.parent_name));
    if (options.parent_email) fd.append('parent_email', String(options.parent_email));
    if (options.parent_phone) fd.append('parent_phone', String(options.parent_phone));
    if (options.payload) {
      try {
        fd.append('payload', JSON.stringify(options.payload));
      } catch (_e) {
        fd.append('payload', '{}');
      }
    }
    fd.append('pdf', pdfBlob, options.pdf_filename || 'registration.pdf');
    if (options.photo instanceof Blob) {
      fd.append('photo', options.photo, options.photo_filename || 'participant-photo.jpg');
    }

    return fetch(base + '/functions/v1/portal-parent-form-submit', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + key,
        apikey: key
      },
      body: fd
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: 'bad_response' };
      }).then(function (j) {
        if (!res.ok || !j || !j.ok) {
          var err = (j && j.error) ? String(j.error) : ('HTTP ' + res.status);
          throw new Error(err);
        }
        return j;
      });
    });
  }

  global.portalSubmitParentForm = submitParentForm;
})(typeof window !== 'undefined' ? window : globalThis);
