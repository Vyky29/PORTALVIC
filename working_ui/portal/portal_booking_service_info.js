/**
 * Public booking portal — service info summaries (from clubsensational.org first sections).
 * Merged client-side when the live offer payload has no infoLead yet.
 */
(function (global) {
  "use strict";

  var SERVICE_INFO = {
    aquatic: {
      infoLead:
        "clubSENsational offers Aquatic Activities (swimming and hydrotherapy) tailored for children, young people, and adults with autism and learning difficulties. Our instructors are trained in both swimming and learning difficulties, so sessions develop communication, emotional regulation, and confidence — not just strokes.",
      infoBullets: [
        "Personalised 1:1 support at SwimFarm, Acton Centre, Northolt, or home visits",
        "Structured sessions with visual aids (mini-schedules, first/next/then boards, AAC)",
        "PIXTOLEARN Swimming resources for verbal and non-verbal learners",
        "Focus on water confidence, independence, and emotional regulation",
      ],
      infoUrl: "https://www.clubsensational.org/swimming/",
    },
    climbing: {
      infoLead:
        "Structured climbing led by autism specialists at Westway Sports Centre. Climbing builds agility, balance, and coordination while giving proprioceptive and vestibular input in a supportive environment.",
      infoBullets: [
        "1:1 support with clear routines and visual aids",
        "Fundamental movement skills linked to cognitive, emotional, and social growth",
        "Personalised to each student's strengths and pace",
        "60-minute sessions on a world-class climbing wall",
      ],
      infoUrl: "https://www.clubsensational.org/climbing/",
    },
    physical: {
      infoLead:
        "Structured fitness with certified personal trainers from our autism specialists team. Regular physical activity improves cardiovascular health, motor skills, postural awareness, and self-image for autistic individuals and those with learning difficulties.",
      infoBullets: [
        "Strength, cardio, and problem-solving circuits",
        "Personalised goals in a structured, predictable session",
        "Visual supports and 1:1 coaching throughout",
        "Hub room and gym-based sessions",
      ],
      infoUrl: "https://www.clubsensational.org/fitness/",
    },
    multi: {
      infoLead:
        "Splash & Connect is a 90-minute multidisciplinary session combining 45 minutes of land-based learning with 45 minutes of swimming — nurturing mind and body together.",
      infoBullets: [
        "Communication, social skills, independence, and life skills through group games",
        "Swimming for motor skills, wellness, and anxiety reduction",
        "Holistic support integrating social, emotional, and physical development",
        "1:1 support with structured visual routines",
      ],
      infoUrl: "https://www.clubsensational.org/splash/",
    },
    bespoke: {
      infoLead:
        "Individualised 1:1 programmes built around the participant's goals after assessment by our autism consultants. Sessions are fun, creative, and adapted to special interests.",
      infoBullets: [
        "Social communication, independence, and emotional well-being",
        "Morning, afternoon, or evening sessions at SwimFarm, Acton, or Westway",
        "Progress reviews with the participant's support network",
        "Arranged with the office — we do not publish Bespoke slots online",
      ],
      infoUrl: "https://www.clubsensational.org/be-spoke/",
    },
    day_centre: {
      infoLead:
        "A weekday daytime programme at SwimFarm (Mon–Fri, 11am–4pm): table work, sensory time, gym, swimming, life skills, and more. Places are arranged with the office so we can discuss the day, funding, and support needs.",
      infoBullets: [
        "Open Monday to Friday, 11am – 4pm at SwimFarm",
        "Table work, sensory room, gym, swimming, and life skills",
        "Music, relaxation, and community trips when staffing allows",
        "Funding and bespoke quotes — enquire with the office",
      ],
      infoUrl: "https://www.clubsensational.org/contact-us/",
    },
    counselling: {
      infoLead:
        "Counselling for young people and adults with autism and their families. Person-centred sessions to explore what concerns you — face to face in Chiswick or online via Zoom.",
      infoBullets: [
        "Short-term (4–6 weeks) or longer-term support",
        "Starts with a short assessment phone call",
        "Safe, ethical, non-judgemental relationship",
        "Sessions tailored to what you want to focus on",
      ],
      infoUrl: "https://www.clubsensational.org/counselling/",
    },
    intensive: {
      infoLead:
        "Holiday crash courses and camps give continuity outside term time — swimming, climbing, fitness, Splash & Connect, and more in short intensive blocks with predictable routines and specialist staff.",
      infoBullets: [
        "Crash courses: focused progress over consecutive half-term days",
        "Day camps: swimming, climbing, fitness, group play, and sensory-friendly activities",
        "Visual supports and inclusive 1:1 or small-group format",
        "Limited daily places — book when blocks open online",
      ],
      infoUrl: "https://www.clubsensational.org/holidays/",
    },
  };

  function pack(service) {
    if (!service || !service.id) return null;
    var base = SERVICE_INFO[service.id] || {};
    return {
      lead: String(service.infoLead || base.infoLead || service.blurb || "").trim(),
      bullets: Array.isArray(service.infoBullets) && service.infoBullets.length
        ? service.infoBullets
        : base.infoBullets || [],
      url: String(service.infoUrl || base.infoUrl || "").trim(),
    };
  }

  global.PortalBookingServiceInfo = {
    SERVICE_INFO: SERVICE_INFO,
    pack: pack,
  };
})(typeof window !== "undefined" ? window : globalThis);
