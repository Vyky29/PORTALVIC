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

  function finishParentSubmit(opts) {
    opts = opts || {};
    var form = opts.formEl;
    var panel = opts.successEl;
    var notice = opts.noticeEl;
    var btn = opts.submitBtn;
    if (form) form.setAttribute('hidden', 'hidden');
    if (notice) notice.setAttribute('hidden', 'hidden');
    if (panel) {
      panel.removeAttribute('hidden');
      var msg = panel.querySelector('[data-parent-submit-msg]');
      if (msg) {
        msg.textContent =
          opts.message ||
          'Your form was sent to clubSENsational. A PDF copy was saved on your device. You do not need to email us — you can close this page.';
      }
      try {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_e) {}
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitted';
    }
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
    try {
      var sessTok =
        (global.PortalBookingServicePresence &&
          typeof global.PortalBookingServicePresence.getToken === 'function' &&
          global.PortalBookingServicePresence.getToken()) ||
        '';
      if (sessTok) fd.append('booking_service_session', String(sessTok));
    } catch (_eSess) {
      /* ignore */
    }

    var headers = {
      Authorization: 'Bearer ' + key,
      apikey: key
    };
    try {
      var tokHdr =
        (global.PortalBookingServicePresence &&
          typeof global.PortalBookingServicePresence.getToken === 'function' &&
          global.PortalBookingServicePresence.getToken()) ||
        '';
      if (tokHdr) headers['x-booking-service-session'] = String(tokHdr);
    } catch (_eHdr) {
      /* ignore */
    }

    return fetch(base + '/functions/v1/portal-parent-form-submit', {
      method: 'POST',
      headers: headers,
      body: fd
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, error: 'bad_response' };
      }).then(function (j) {
        if (!res.ok || !j || !j.ok) {
          var err = (j && j.error) ? String(j.error) : ('HTTP ' + res.status);
          throw new Error(err);
        }
        try {
          if (global.PortalBookingServicePresence) {
            var slotBit = '';
            try {
              var br = options.payload && options.payload.booking_request;
              if (br && br.slot_id) slotBit = String(br.slot_id);
            } catch (_eSlot) {
              /* ignore */
            }
            void global.PortalBookingServicePresence.ping(
              'registration_submit',
              slotBit || (j.slot_held ? 'slot_held' : null)
            );
          }
        } catch (_e2) {
          /* ignore */
        }
        return j;
      });
    });
  }

  global.portalSubmitParentForm = submitParentForm;
  global.portalFinishParentSubmit = finishParentSubmit;
})(typeof window !== 'undefined' ? window : globalThis);
