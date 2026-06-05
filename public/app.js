/* =============================================
   ECD360 — App Logic
   =============================================
   First-time flow:  Dashboard → Caregiver Name → Child Info → Domain Choice
                     → Gentle Note → Breathing → Prompts → Contact Collection
                     → Results
   Returning users:  Dashboard login → My Children → Domain Choice → ...
   ============================================= */

(() => {
  "use strict";

  // ─── Firebase Auth ────────────────────────────────────────────────────────
  const firebaseConfig = {
    apiKey: "AIzaSyBAmqHThT-7_pk7FwujtVed9YVppmepWIM",
    authDomain: "parentzo-b16d0.firebaseapp.com",
    projectId: "parentzo-b16d0",
    storageBucket: "parentzo-b16d0.firebasestorage.app",
    messagingSenderId: "351985625747",
    appId: "1:351985625747:web:953e6de38b77e929e67b66"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const fbAuth = firebase.auth();
  fbAuth.useDeviceLanguage();
  let recaptchaVerifier = null;
  let confirmationResult = null;

  // ─── Constants ───────────────────────────────────────────────────────────────
  const DOMAINS = {
    COG:  { label: "Cognitive",                emoji: "🧠" },
    LANG: { label: "Language & Communication", emoji: "💬" },
    PHY:  { label: "Physical Development",     emoji: "🏃" },
    SE:   { label: "Social & Emotional",       emoji: "❤️" },
    ADP:  { label: "Adaptive Skills",          emoji: "🎯" },
  };

  const RESPONSE_OPTIONS = [
    { value: "OFTEN",       label: "I see this often" },
    { value: "SOMETIMES",   label: "I see this sometimes" },
    { value: "NOT_YET",     label: "Not yet" },
    { value: "NEUTRAL",     label: "I'm not sure" },
    { value: "REMIND_LATER",label: "I'll check, remind me later" },
  ];

  const GROUP_LABELS = {
    ACT_DEV:    "Actively Developing",
    STS:        "Still Taking Shape",
    NEEDS_ATTN: "Needs Attention",
    SEEK_SUPP:  "Seek Support",
    INCOMPLETE: "Incomplete",
  };

  const CHILD_AVATARS = ["👦","👧","🧒","👶","🐥","🌟","🦁","🐻","🐼","🦊"];

  // ─── Demo Prompts ────────────────────────────────────────────────────────────
  const DEMO_PROMPT_TEMPLATES = {
    COG: [
      "Does your child sort objects by shape or colour?",
      "Does your child follow simple two-step instructions?",
      "Does your child show curiosity by exploring new objects?",
      "Can your child match similar pictures or items?",
      "Does your child remember where familiar toys are kept?",
      "Does your child attempt simple puzzles or stacking activities?",
      "Can your child imitate actions they have seen before?",
      "Does your child understand the concept of 'more' or 'all gone'?",
    ],
    LANG: [
      "Does your child use two-word phrases (e.g., 'more milk')?",
      "Does your child point to objects when you name them?",
      "Can your child name at least 5 familiar objects?",
      "Does your child try to tell you about their experiences?",
      "Does your child respond when you call their name?",
      "Does your child use gestures to communicate (pointing, waving)?",
      "Can your child follow simple one-step instructions?",
      "Does your child babble or make sounds to get your attention?",
    ],
    PHY: [
      "Can your child walk up steps with support?",
      "Does your child kick a ball forward?",
      "Can your child stack 4 or more blocks?",
      "Does your child use a spoon to feed themselves?",
      "Can your child run without frequently falling?",
      "Does your child show a hand preference (left or right)?",
      "Can your child scribble with a crayon or pencil?",
      "Does your child climb on and off furniture independently?",
    ],
    SE: [
      "Does your child show affection to familiar people?",
      "Does your child notice when other children are upset?",
      "Can your child play alongside other children?",
      "Does your child show a range of emotions (happy, sad, angry)?",
      "Does your child seek comfort when upset?",
      "Does your child show signs of separation anxiety when you leave?",
      "Can your child wait briefly for their turn during play?",
      "Does your child mimic the expressions or emotions of others?",
    ],
    ADP: [
      "Can your child drink from an open cup?",
      "Does your child help with getting dressed (putting arms in sleeves)?",
      "Does your child attempt to wash their hands?",
      "Can your child use a fork or spoon with minimal spilling?",
      "Does your child indicate when they need the toilet?",
      "Can your child remove simple clothing (socks, shoes)?",
      "Does your child attempt to brush their teeth with assistance?",
      "Can your child safely carry small objects while walking?",
    ],
  };

  // ─── State ────────────────────────────────────────────────────────────────────
  let authState = { isLoggedIn: false, user: null };
  let children = [];
  let selectedChild = null;

  // First-time flow state
  let guestCaregiverName = "";  // name collected on caregiver-name screen
  let guestChildName = "";
  let guestChildDob = "";

  // Observation state
  let activeCycleId = null;
  let chosenDomain = null;        // single domain chosen this session
  let currentPromptIndex = 0;
  let prompts = [];
  let responses = {};
  let childName = "";
  let childAge = 0;
  let lastResults = [];
  let actionDictionary = {};

  // Track which domains have been done in this cycle (for "try another")
  let completedDomains = [];

  let currentView = "dashboard";

  // ─── DOM helpers ─────────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Toast ────────────────────────────────────────────────────────────────────
  function toast(msg, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
  }

  // ─── Navigation ───────────────────────────────────────────────────────────────
  function switchView(viewName) {
    $$(".view").forEach(v => v.classList.remove("active"));
    $$(".nav-link").forEach(l => l.classList.remove("active"));
    const v = $(`#view-${viewName}`);
    if (v) v.classList.add("active");
    const nl = $(`.nav-link[data-view="${viewName}"]`);
    if (nl) nl.classList.add("active");
    currentView = viewName;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ─── Age Calculation ─────────────────────────────────────────────────────────
  function calculateAgeInMonths(dob, now) {
    const start = new Date(dob);
    const end = new Date(now);
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();
    let totalMonths = yearDiff * 12 + monthDiff;
    if (end.getDate() < start.getDate()) {
      const isEndOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate() === end.getDate();
      const isStartDayHigher = start.getDate() > end.getDate();
      if (isStartDayHigher && (!isEndOfEndMonth || start.getMonth() === end.getMonth())) {
        totalMonths -= 1;
      }
    }
    return totalMonths;
  }

  // ─── Phone normalisation ──────────────────────────────────────────────────────
  function normalisePhone(raw) {
    let digits = raw.replace(/\D/g, "");
    if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
    if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
    return digits;
  }

  // ─── Auth UI Helpers ──────────────────────────────────────────────────────────
  function setLoggedInUI(user) {
    authState = { isLoggedIn: true, user };
    sessionStorage.setItem("ecd360_user", JSON.stringify(user));
    $("#nav-guest-area").classList.add("hidden");
    $("#nav-user-area").classList.remove("hidden");
    $("#nav-user-name").textContent = `👤 ${user.name || "My Account"}`;
    $("#nav-links").style.display = "";
  }

  function setLoggedOutUI() {
    authState = { isLoggedIn: false, user: null };
    sessionStorage.removeItem("ecd360_user");
    children = [];
    selectedChild = null;
    activeCycleId = null;
    $("#nav-guest-area").classList.remove("hidden");
    $("#nav-user-area").classList.add("hidden");
    $("#nav-links").style.display = "none";
    switchView("dashboard");
  }

  // ─── Check existing session ───────────────────────────────────────────────────
  async function checkExistingSession() {
    const cached = sessionStorage.getItem("ecd360_user");
    try {
      const res = await fetch("/v1/children", { credentials: "include" });
      if (res.ok) {
        children = await res.json();
        const user = cached ? JSON.parse(cached) : { name: "My Account", caregiver_id: "" };
        setLoggedInUI(user);
        const greeting = $("#children-greeting");
        if (greeting) greeting.textContent = `Welcome back, ${user.name || "there"} 👋`;
        renderChildren();
        switchView("children");
        return;
      }
    } catch (_) {}
    switchView("dashboard");
    if (cached) sessionStorage.removeItem("ecd360_user");
  }

  // ─── Auth — Request OTP ───────────────────────────────────────────────────────
  async function handleRequestOtp() {
    const phone = normalisePhone($("#login-phone").value.trim());
    if (!phone || phone.length !== 10) { toast("Please enter a valid 10-digit phone number.", "error"); return; }

    const btn = $("#btn-request-otp");
    btn.disabled = true; btn.textContent = "Sending OTP...";

    try {
      if (recaptchaVerifier) { try { recaptchaVerifier.clear(); } catch (_) {} recaptchaVerifier = null; }
      recaptchaVerifier = new firebase.auth.RecaptchaVerifier("btn-request-otp", {
        size: "invisible", callback: () => {}
      });
      await recaptchaVerifier.render();
      confirmationResult = await fbAuth.signInWithPhoneNumber("+91" + phone, recaptchaVerifier);
      $("#login-step-phone").classList.add("hidden");
      $("#login-step-otp").classList.remove("hidden");
      $("#otp-sent-msg").textContent = `OTP sent to ${phone}`;
      $("#login-otp").focus();
      toast("OTP sent to your phone!", "success");
    } catch (err) {
      if (recaptchaVerifier) { recaptchaVerifier.clear(); recaptchaVerifier = null; }
      toast(err.message || "Could not send OTP. Please try again.", "error");
    } finally {
      btn.disabled = false; btn.textContent = "Get OTP";
    }
  }

  // ─── Auth — Verify OTP ────────────────────────────────────────────────────────
  async function handleVerifyOtp() {
    const phone = normalisePhone($("#login-phone").value.trim());
    const otp = $("#login-otp").value.trim();
    if (!otp || otp.length !== 6) { toast("Please enter the 6-digit OTP.", "error"); return; }
    if (!confirmationResult) { toast("Please request an OTP first.", "error"); return; }

    const btn = $("#btn-verify-otp");
    btn.disabled = true; btn.textContent = "Verifying...";

    try {
      const userCredential = await confirmationResult.confirm(otp);
      const idToken = await userCredential.user.getIdToken();
      const res = await fetch("/v1/auth/login/verify-firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone_number: phone, firebase_id_token: idToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setLoggedInUI({ name: data.name, email: data.email, caregiver_id: data.caregiver_id });
        const greeting = $("#children-greeting");
        if (greeting) greeting.textContent = `Welcome back, ${data.name} 👋`;
        toast(`Welcome back, ${data.name}!`, "success");
        await loadChildren();
        switchView("children");
      } else {
        toast(data.error || "Login failed. Please try again.", "error");
      }
    } catch (err) {
      if (err.code === "auth/invalid-verification-code") {
        toast("Incorrect OTP. Please check and try again.", "error");
      } else {
        toast(err.message || "Verification failed.", "error");
      }
    } finally {
      btn.disabled = false; btn.textContent = "Verify & Login";
    }
  }

  // ─── Auth — Logout ────────────────────────────────────────────────────────────
  async function handleLogout() {
    try { await fetch("/v1/auth/logout", { method: "POST", credentials: "include" }); } catch (_) {}
    toast("Logged out.", "info");
    setLoggedOutUI();
  }

  // ─── Children — Load ──────────────────────────────────────────────────────────
  async function loadChildren() {
    try {
      const res = await fetch("/v1/children", { credentials: "include" });
      if (res.ok) { children = await res.json(); renderChildren(); }
    } catch (_) {}
  }

  // ─── Children — Render Grid ───────────────────────────────────────────────────
  function renderChildren() {
    const grid = $("#children-grid");
    const empty = $("#children-empty");
    grid.innerHTML = "";

    if (children.length === 0) {
      grid.classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }
    grid.classList.remove("hidden");
    empty.classList.add("hidden");

    children.forEach((child, idx) => {
      const ageMonths = calculateAgeInMonths(child.date_of_birth, new Date());
      const ageLabel = ageMonths >= 12
        ? `${Math.floor(ageMonths / 12)}y ${ageMonths % 12}m old`
        : `${ageMonths} months old`;
      const avatar = CHILD_AVATARS[idx % CHILD_AVATARS.length];

      const card = document.createElement("div");
      card.className = "child-card";
      card.dataset.childId = child.child_id;
      card.innerHTML = `
        <button class="btn-delete-child-corner" data-child-id="${child.child_id}" data-name="${child.pet_name}" title="Delete child">🗑</button>
        <div class="child-card-header"><div class="child-avatar">${avatar}</div></div>
        <div class="child-name">${child.pet_name}</div>
        <div class="child-age">${ageLabel}</div>
        <div class="child-card-footer" id="card-footer-${child.child_id}">
          <button class="btn btn-primary btn-start-obs" data-child-id="${child.child_id}" data-name="${child.pet_name}" data-dob="${child.date_of_birth}">
            Start Observation
          </button>
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll(".btn-start-obs").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedChild = { child_id: btn.dataset.childId, pet_name: btn.dataset.name, date_of_birth: btn.dataset.dob };
        launchDomainChoice(selectedChild);
      });
    });
    grid.querySelectorAll(".btn-delete-child-corner").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); confirmDeleteChild(btn.dataset.childId, btn.dataset.name); });
    });
  }

  // ─── Children — Add ───────────────────────────────────────────────────────────
  async function handleAddChild() {
    const name = $("#new-child-name").value.trim();
    const dob = $("#new-child-dob").value;
    if (!name) { toast("Please enter a name.", "error"); return; }
    if (!dob) { toast("Please enter a date of birth.", "error"); return; }

    const btn = $("#btn-save-child");
    btn.disabled = true; btn.textContent = "Saving...";
    try {
      const res = await fetch("/v1/children", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pet_name: name, date_of_birth: dob }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`${name} added! 🎉`, "success");
        $("#new-child-name").value = ""; $("#new-child-dob").value = "";
        $("#add-child-form").classList.add("hidden");
        await loadChildren();
      } else { toast(data.error || "Could not add child.", "error"); }
    } catch (_) { toast("Could not connect to server.", "error"); }
    finally { btn.disabled = false; btn.textContent = "Save Child"; }
  }

  // ─── Children — Delete ────────────────────────────────────────────────────────
  async function confirmDeleteChild(childId, name) {
    if (!confirm(`Delete ${name} and all their observation data? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/v1/children/${childId}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast(`${name}'s data deleted.`, "info"); await loadChildren(); }
      else { const d = await res.json(); toast(d.error || "Could not delete.", "error"); }
    } catch (_) { toast("Could not connect to server.", "error"); }
  }

  // ─── Domain Choice — launch ───────────────────────────────────────────────────
  function launchDomainChoice(child) {
    selectedChild = child;
    childName = child.pet_name;
    childAge = calculateAgeInMonths(child.date_of_birth, new Date());
    window.currentChildName = child.pet_name;
    window.currentChildAge = childAge;
    window.currentObsDate = new Date().toLocaleDateString("en-IN");

    // Mark already-completed domains as disabled
    const subtitle = $("#domain-choice-subtitle");
    if (subtitle) subtitle.textContent = completedDomains.length > 0
      ? `You've done: ${completedDomains.map(d => DOMAINS[d]?.label || d).join(", ")}. Pick another.`
      : `Pick one area you'd like to observe for ${childName} today.`;

    // Reset domain button states
    $$(".domain-choice-btn").forEach(btn => {
      const d = btn.dataset.domain;
      if (completedDomains.includes(d)) {
        btn.disabled = true;
        btn.style.opacity = "0.45";
        btn.title = "Already completed this session";
        // Add green tick if not already there
        if (!btn.querySelector(".domain-done-tick")) {
          const tick = document.createElement("span");
          tick.className = "domain-done-tick";
          tick.innerHTML = "&#10004;";
          tick.style.cssText = "position:absolute;top:8px;right:10px;font-size:1.3rem;color:#2E7D32;font-weight:900;line-height:1;";
          btn.style.position = "relative";
          btn.appendChild(tick);
        }
      } else {
        btn.disabled = false;
        btn.style.opacity = "";
        btn.title = "";
        // Remove tick if present (e.g. after reset)
        const existingTick = btn.querySelector(".domain-done-tick");
        if (existingTick) existingTick.remove();
      }
    });

    switchView("domain-choice");
  }

  // ─── Start Observation for chosen domain ─────────────────────────────────────
  async function startObservationForDomain(domain) {
    chosenDomain = domain;
    responses = {};
    currentPromptIndex = 0;

    // If logged in and we already have an activeCycleId reuse it (append domain)
    // otherwise create a new cycle
    if (!activeCycleId) {
      try {
        const childId = selectedChild ? selectedChild.child_id : null;
        if (childId) {
          const res = await fetch("/v1/cycles/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ child_id: childId, cycle_type: "regular", chosen_domain: domain }),
          });
          if (res.ok) {
            const data = await res.json();
            activeCycleId = data.cycle_id;
            // Filter prompts to chosen domain only
            const allPrompts = data.prompts || [];
            prompts = allPrompts.filter(p => p.domain === domain);
          } else { throw new Error("API unavailable"); }
        } else { throw new Error("No child"); }
      } catch (_) {
        // fallback to demo prompts
        activeCycleId = null;
        prompts = (DEMO_PROMPT_TEMPLATES[domain] || []).map((text, i) => ({
          prompt_id: `DEMO_${domain}_${i}`,
          domain,
          text,
        }));
      }
    } else {
      // Append domain: fetch fresh prompts for this domain
      try {
        // We need to fetch domain-specific prompts for an existing cycle
        // We'll call a sub-endpoint or fall back to demo
        const childId = selectedChild ? selectedChild.child_id : null;
        if (childId) {
          const res = await fetch("/v1/cycles/start-domain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ cycle_id: activeCycleId, child_id: childId, domain }),
          });
          if (res.ok) {
            const data = await res.json();
            prompts = data.prompts || [];
          } else { throw new Error("fallback"); }
        } else { throw new Error("no child"); }
      } catch (_) {
        prompts = (DEMO_PROMPT_TEMPLATES[domain] || []).map((text, i) => ({
          prompt_id: `DEMO_${domain}_${i}`,
          domain,
          text,
        }));
      }
    }

    if (prompts.length === 0) {
      toast("No prompts available for this domain and age. Using sample prompts.", "info");
      prompts = (DEMO_PROMPT_TEMPLATES[domain] || []).map((text, i) => ({
        prompt_id: `DEMO_${domain}_${i}`,
        domain,
        text,
      }));
    }

    // Show gentle note first
    switchView("observe");
    $$(".observe-step").forEach(s => s.classList.add("hidden"));
    const gn = $("#step-gentle-note");
    gn.classList.remove("hidden");
    gn.classList.add("slide-in-right");
    setTimeout(() => gn.classList.remove("slide-in-right"), 400);
  }

  // ─── Render Single Prompt ─────────────────────────────────────────────────────
  function renderPrompt(index) {
    const container = $("#prompts-container");
    const prompt = prompts[index];
    if (!prompt) return;

    const domainInfo = DOMAINS[prompt.domain] || { label: prompt.domain, emoji: "📋" };
    container.innerHTML = `
      <div class="prompt-card">
        <span class="prompt-domain-badge" data-domain="${prompt.domain}">${domainInfo.emoji} ${domainInfo.label}</span>
        <p class="prompt-text">${prompt.text}</p>
        <div class="response-options">
          ${RESPONSE_OPTIONS.map(opt => `
            <button class="response-option ${responses[prompt.prompt_id]?.response_value === opt.value ? "selected" : ""}"
                    data-value="${opt.value}">
              ${opt.label}
            </button>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelectorAll(".response-option").forEach(btn => {
      function handleSelect(e) {
        e.preventDefault();
        responses[prompt.prompt_id] = { prompt_id: prompt.prompt_id, domain: prompt.domain, response_value: btn.dataset.value };
        container.querySelectorAll(".response-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        updatePromptNav();
      }
      btn.addEventListener("touchend", handleSelect, { passive: false });
      btn.addEventListener("click", (e) => { if (!e._touchHandled) handleSelect(e); });
    });

    const answered = Object.keys(responses).length;
    const total = prompts.length;
    $("#prompt-progress").style.width = `${(answered / total) * 100}%`;
    $("#prompt-progress-label").textContent = `${answered} / ${total}`;
    updatePromptNav();
  }

  function updatePromptNav() {
    const prevBtn = $("#btn-prev-prompt");
    const nextBtn = $("#btn-next-prompt");
    const submitBtn = $("#btn-submit-responses");
    prevBtn.disabled = currentPromptIndex === 0;
    const isLast = currentPromptIndex === prompts.length - 1;
    const allAnswered = Object.keys(responses).length === prompts.length;
    if (isLast) {
      nextBtn.classList.add("hidden");
      submitBtn.classList.remove("hidden");
      submitBtn.disabled = !allAnswered;
    } else {
      nextBtn.classList.remove("hidden");
      submitBtn.classList.add("hidden");
    }
  }

  // ─── Submit Responses — show contact collection for first-timers ──────────────
  async function handleSubmitResponses() {
    if (Object.keys(responses).length !== prompts.length) {
      toast("Please answer all prompts.", "error"); return;
    }

    // If not logged in → show contact collection screen first
    if (!authState.isLoggedIn) {
      $("#step-prompts").classList.add("hidden");
      const cc = $("#step-collect-contact");
      cc.classList.remove("hidden");
      cc.classList.add("slide-in-right");
      setTimeout(() => cc.classList.remove("slide-in-right"), 400);
      return;
    }

    // Logged-in users go straight to processing
    await processAndSubmit();
  }

  // ─── Handle contact form submission (first-time users) ───────────────────────
  async function handleContactSubmit() {
    const email = $("#contact-email").value.trim();
    const phone = normalisePhone($("#contact-phone").value.trim());

    if (!email) { toast("Please enter your email address.", "error"); return; }
    if (!phone || phone.length !== 10) { toast("Please enter a valid 10-digit phone number.", "error"); return; }

    const btn = $("#btn-contact-submit");
    btn.disabled = true; btn.textContent = "Saving...";

    try {
      // Check if caregiver exists — link them, or create new
      let caregiver = null;
      try {
        const checkRes = await fetch("/v1/auth/find-by-phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone_number: phone }),
        });
        if (checkRes.ok) { caregiver = await checkRes.json(); }
      } catch (_) {}

      if (!caregiver) {
        // Register new caregiver
        const regRes = await fetch("/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: guestCaregiverName || "Parent", email, phone_number: phone }),
        });
        if (regRes.ok) { caregiver = await regRes.json(); }
      }

      if (caregiver) {
        // Store caregiver ID on the cycle
        if (activeCycleId) {
          try {
            await fetch(`/v1/cycles/${activeCycleId}/link-caregiver`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ caregiver_id: caregiver.caregiver_id }),
            });
          } catch (_) {}
        }
        // Now create the child under this caregiver if not already created
        if (!selectedChild?.child_id || selectedChild.child_id.startsWith("GUEST")) {
          try {
            const childRes = await fetch("/v1/children/guest-create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pet_name: guestChildName,
                date_of_birth: guestChildDob,
                caregiver_id: caregiver.caregiver_id,
              }),
            });
            if (childRes.ok) {
              const childData = await childRes.json();
              selectedChild = { child_id: childData.child_id, pet_name: guestChildName, date_of_birth: guestChildDob };
              // Update cycle with child_id
              if (activeCycleId) {
                await fetch(`/v1/cycles/${activeCycleId}/link-child`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ child_id: childData.child_id }),
                });
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    btn.disabled = false; btn.textContent = "View My Results →";

    // Proceed to process
    await processAndSubmit();
  }

  // ─── Core process + submit ────────────────────────────────────────────────────
  async function processAndSubmit() {
    $("#step-collect-contact").classList.add("hidden");
    $("#step-prompts").classList.add("hidden");
    $("#step-submitting").classList.remove("hidden");
    await new Promise(r => setTimeout(r, 1200));

    try {
      const payload = Object.values(responses);

      // If we have a real cycle ID, submit via API
      if (activeCycleId && !activeCycleId.startsWith("GUEST")) {
        const r1 = await fetch(`/v1/cycles/${activeCycleId}/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!r1.ok) throw new Error("Failed to submit responses");

        const r2 = await fetch(`/v1/cycles/${activeCycleId}/summary?domain=${chosenDomain}`, {
          credentials: "include",
        });
        if (!r2.ok) throw new Error("Failed to fetch summary");

        const summary = await r2.json();
        const domainResults = summary.filter(item => item.domain === chosenDomain);
        completedDomains.push(chosenDomain);

        // Merge with existing results (for "try another domain" flow)
        lastResults = [...lastResults.filter(r => r.domain !== chosenDomain), ...domainResults];

        if (authState.isLoggedIn) await loadChildren();
        renderResults(lastResults);
        switchView("results");
        toast("Classification complete! 🎉", "success");
      } else {
        // Demo / offline classification
        const domainResponses = payload.filter(r => r.domain === chosenDomain);
        const demoResult = classifyLocally(chosenDomain, domainResponses);
        completedDomains.push(chosenDomain);
        lastResults = [...lastResults.filter(r => r.domain !== chosenDomain), demoResult];
        renderResults(lastResults);
        switchView("results");
        toast("Classification complete! 🎉", "success");
      }
    } catch (err) {
      console.error("[Submit]", err);
      // Fallback to local classification
      const payload = Object.values(responses);
      const demoResult = classifyLocally(chosenDomain, payload);
      completedDomains.push(chosenDomain);
      lastResults = [...lastResults.filter(r => r.domain !== chosenDomain), demoResult];
      renderResults(lastResults);
      switchView("results");
    }
  }

  // ─── Local classification (demo fallback) ────────────────────────────────────
  function classifyLocally(domain, domainResponses) {
    const positive = domainResponses.filter(r => ["OFTEN","SOMETIMES"].includes(r.response_value)).length;
    const negative = domainResponses.filter(r => r.response_value === "NOT_YET").length;
    const neutral  = domainResponses.filter(r => r.response_value === "NEUTRAL").length;
    const nTotal   = positive + negative + neutral;

    let group = "INCOMPLETE";
    if (nTotal >= 3) {
      const pPct = Math.round((positive / nTotal) * 1000) / 10;
      const nPct = Math.round((negative / nTotal) * 1000) / 10;
      const uPct = Math.round((neutral  / nTotal) * 1000) / 10;
      if (uPct >= 60) group = "SEEK_SUPP";
      else if (pPct === 0 && nPct >= 80) group = "SEEK_SUPP";
      else if (pPct < 20 && nPct >= 60) group = "SEEK_SUPP";
      else if (pPct >= 60 && nPct <= 40) group = "ACT_DEV";
      else if (pPct >= 20 && nPct < 60) group = "STS";
      else if (pPct < 20 && nPct < 60) group = "NEEDS_ATTN";
      else group = "SEEK_SUPP";
    }
    return { domain, group, explanation: null, actions: null };
  }

  // ─── Action Dictionary ────────────────────────────────────────────────────────
  async function loadActionData() {
    try {
      const res = await fetch("/v1/actions");
      if (res.ok) {
        const data = await res.json();
        data.forEach(item => {
          const lookupKey = item.action_id.replace("A_", "").replace("_SUPPORT", "_SUPP");
          actionDictionary[lookupKey] = item;
        });
      }
    } catch (e) { console.warn("Could not load action data", e); }
  }

  // ─── Render Results ───────────────────────────────────────────────────────────
  function renderResults(classifications) {
    window.lastSummaryResults = classifications;
    const grid = $("#results-grid");
    grid.innerHTML = "";

    const sortOrder = { ACT_DEV: 1, STS: 2, NEEDS_ATTN: 3, SEEK_SUPP: 4, INCOMPLETE: 5 };
    const sorted = [...classifications].sort((a, b) => (sortOrder[a.group] || 99) - (sortOrder[b.group] || 99));

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const domainInfo = DOMAINS[item.domain] || { label: item.domain, emoji: "📋" };
      const groupLabel = GROUP_LABELS[item.group] || item.group;
      const groupStyles = {
        ACT_DEV:    { color: "#2E7D32", icon: "" },
        STS:        { color: "#6B4FA0", icon: "" },
        NEEDS_ATTN: { color: "#E65100", icon: "🔍" },
        SEEK_SUPP:  { color: "#C62828", icon: "⚠️" },
        INCOMPLETE: { color: "var(--text-muted)", icon: "" },
      };
      const gs = groupStyles[item.group] || { color: "var(--text-muted)", icon: "" };

      let explanation = item.explanation;
      let actions = item.actions;
      if (!explanation) {
        const action = actionDictionary[`${item.domain}_${item.group}`];
        explanation = action?.explanation || null;
        actions = action?.actions || null;
        item.explanation = explanation;
        item.actions = actions;
      }
      if (!explanation || item.group === "INCOMPLETE") {
        explanation = "Not enough responses were collected in this domain to generate a result.";
        item.explanation = explanation;
      }

      let actionsHtml = "";
      if (actions && item.group !== "INCOMPLETE") {
        actionsHtml = `
          <div class="action-plan-toggle" style="margin-top:14px;">
            <button class="how-to-improve-btn" type="button">
              <span class="hti-label">How To Improve</span>
              <svg class="hti-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
          <div class="action-plan-content hidden" style="margin-top:10px;font-size:0.9rem;color:var(--text-secondary);line-height:1.6;padding:10px 12px;background:rgba(107,79,160,0.05);border-radius:8px;border-left:3px solid var(--accent-primary);">${actions}</div>
        `;
      }

      const card = document.createElement("div");
      card.className = "result-card expanded";
      card.dataset.group = item.group;
      card.innerHTML = `
        <div class="result-card-header">
          <div class="result-info" style="flex:1;text-align:left;">
            <div class="result-domain" style="text-align:left;">${domainInfo.emoji} ${domainInfo.label}</div>
            <div class="result-group" style="text-align:left;color:${gs.color};font-weight:600;">${gs.icon ? gs.icon + " " : ""}${groupLabel}</div>
          </div>

        </div>
        <div class="result-card-body">
          <p class="result-explanation" style="font-weight:normal;font-size:0.95rem;margin:0;">${explanation}</p>
          ${actionsHtml}
        </div>
      `;
      // card is always expanded — no click toggle
      if (actions && item.group !== "INCOMPLETE") {
        card.querySelector(".how-to-improve-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          const contentEl = card.querySelector(".action-plan-content");
          const chevron   = card.querySelector(".hti-chevron");
          const isHidden  = contentEl.classList.toggle("hidden");
          chevron.style.transform = isHidden ? "rotate(0deg)" : "rotate(180deg)";
        });
      }
      grid.appendChild(card);
    }

    $("#results-child-info").textContent = `${childName || "Your child"} · ${childAge} months old · ${new Date().toLocaleDateString()}`;
    $("#results-content").classList.remove("hidden");
  }

  // ─── Popup helpers ────────────────────────────────────────────────────────────
  function showPopup(id) { $(`#${id}`).classList.remove("hidden"); }
  function hidePopup(id) { $(`#${id}`).classList.add("hidden"); }

  // ─── Event Bindings ───────────────────────────────────────────────────────────
  function bindEvents() {

    // Nav links
    $$(".nav-link").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const target = link.dataset.view;
        if (target === "children") loadChildren().then(() => switchView("children"));
        else switchView(target);
      });
    });

    $("#btn-nav-login").addEventListener("click", () => switchView("auth"));
    $("#btn-logout").addEventListener("click", handleLogout);

    // OTP flow
    $("#btn-request-otp").addEventListener("click", handleRequestOtp);
    $("#btn-verify-otp").addEventListener("click", handleVerifyOtp);
    $("#btn-back-phone").addEventListener("click", () => {
      $("#login-step-otp").classList.add("hidden");
      $("#login-step-phone").classList.remove("hidden");
      $("#login-otp").value = "";
    });
    $("#login-otp").addEventListener("keydown", e => { if (e.key === "Enter") handleVerifyOtp(); });
    $("#login-phone").addEventListener("keydown", e => { if (e.key === "Enter") handleRequestOtp(); });

    // ── Dashboard — Start Observation (first-time flow) ──
    $("#hero-start-btn").addEventListener("click", () => {
      if (authState.isLoggedIn) {
        loadChildren().then(() => switchView("children"));
      } else {
        // Reset first-time flow state
        guestCaregiverName = "";
        guestChildName = "";
        guestChildDob = "";
        completedDomains = [];
        lastResults = [];
        activeCycleId = null;
        selectedChild = null;
        if ($("#caregiver-name-input")) $("#caregiver-name-input").value = "";
        switchView("caregiver-name");
      }
    });

    // ── Step 1: Caregiver Name ──
    $("#btn-caregiver-name-next").addEventListener("click", () => {
      const name = $("#caregiver-name-input").value.trim();
      if (!name) { toast("Please enter your name.", "error"); return; }
      guestCaregiverName = name;
      switchView("child-info");
    });
    $("#caregiver-name-input").addEventListener("keydown", e => { if (e.key === "Enter") $("#btn-caregiver-name-next").click(); });

    // ── Step 2: Child Info ──
    $("#btn-child-info-back").addEventListener("click", () => switchView("caregiver-name"));
    $("#btn-child-info-next").addEventListener("click", () => {
      const name = $("#child-name-input").value.trim();
      const dob = $("#child-dob-input").value;
      if (!name) { toast("Please enter your child's name.", "error"); return; }
      if (!dob) { toast("Please enter your child's date of birth.", "error"); return; }
      const age = calculateAgeInMonths(dob, new Date());
      if (age < 0 || age > 72) { toast("Please enter a valid date of birth (0–72 months).", "error"); return; }

      guestChildName = name;
      guestChildDob = dob;
      childName = name;
      childAge = age;
      window.currentChildName = name;
      window.currentChildAge = age;
      window.currentObsDate = new Date().toLocaleDateString("en-IN");

      // Set a guest placeholder child
      selectedChild = { child_id: "GUEST_" + Date.now(), pet_name: name, date_of_birth: dob };

      // Create the cycle now (guest — no auth) so we have a cycle_id for responses
      fetch("/v1/cycles/start-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pet_name: name, date_of_birth: dob, caregiver_name: guestCaregiverName }),
      }).then(res => {
        if (res.ok) return res.json();
        throw new Error("guest cycle failed");
      }).then(data => {
        activeCycleId = data.cycle_id;
        selectedChild = { child_id: data.child_id || selectedChild.child_id, pet_name: name, date_of_birth: dob };
      }).catch(() => {
        activeCycleId = null; // will use demo mode
      });

      launchDomainChoice(selectedChild);
    });

    // ── Step 3: Domain Choice ──
    $$(".domain-choice-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const domain = btn.dataset.domain;
        startObservationForDomain(domain);
      });
    });

    // ── Gentle Note → Breathing ──
    $("#btn-gentle-note-next").addEventListener("click", () => {
      const gn = $("#step-gentle-note");
      const br = $("#step-breathing");
      gn.classList.add("slide-out-left");
      setTimeout(() => {
        gn.classList.add("hidden"); gn.classList.remove("slide-out-left");
        br.classList.remove("hidden"); br.classList.add("slide-in-right");
        setTimeout(() => br.classList.remove("slide-in-right"), 400);
      }, 350);
    });

    // ── Breathing → Prompts ──
    $("#btn-breathing-next").addEventListener("click", () => {
      const br = $("#step-breathing");
      const sp = $("#step-prompts");
      br.classList.add("slide-out-left");
      setTimeout(() => {
        br.classList.add("hidden"); br.classList.remove("slide-out-left");
        sp.classList.remove("hidden"); sp.classList.add("slide-in-right");
        setTimeout(() => sp.classList.remove("slide-in-right"), 400);
        const domainInfo = DOMAINS[chosenDomain] || { label: chosenDomain, emoji: "📋" };
        $("#prompts-subtitle").innerHTML = `<strong>${childName}</strong> &middot; ${childAge} months &middot; ${domainInfo.emoji} ${domainInfo.label} &middot; ${prompts.length} prompts`;
        currentPromptIndex = 0;
        renderPrompt(0);
      }, 350);
    });

    // ── Prompt navigation ──
    function handleNext() {
      if (!responses[prompts[currentPromptIndex].prompt_id]) { toast("Please select a response before continuing.", "error"); return; }
      if (currentPromptIndex < prompts.length - 1) { currentPromptIndex++; renderPrompt(currentPromptIndex); }
    }
    function handlePrev() {
      if (currentPromptIndex > 0) { currentPromptIndex--; renderPrompt(currentPromptIndex); }
    }
    $("#btn-next-prompt").addEventListener("click", handleNext);
    $("#btn-next-prompt").addEventListener("touchend", e => { e.preventDefault(); handleNext(); });
    $("#btn-prev-prompt").addEventListener("click", handlePrev);
    $("#btn-prev-prompt").addEventListener("touchend", e => { e.preventDefault(); handlePrev(); });
    $("#btn-submit-responses").addEventListener("click", handleSubmitResponses);

    // ── Contact collection ──
    $("#btn-contact-submit").addEventListener("click", handleContactSubmit);

    // ── Results — Three action buttons ──
    $("#btn-action-plan").addEventListener("click", () => showPopup("popup-acknowledged"));
    $("#btn-connect-expert").addEventListener("click", () => showPopup("popup-acknowledged"));
    $("#btn-learn-ecd").addEventListener("click", () => showPopup("popup-learn-ecd"));

    // ── Try Another Domain ──
    $("#btn-try-another-domain").addEventListener("click", () => {
      responses = {};
      currentPromptIndex = 0;
      launchDomainChoice(selectedChild);
    });

    // ── Popup close buttons ──
    ["btn-close-acknowledged", "btn-close-acknowledged-btn"].forEach(id => {
      const el = $(`#${id}`);
      if (el) el.addEventListener("click", () => hidePopup("popup-acknowledged"));
    });
    $("#btn-close-learn-ecd").addEventListener("click", () => hidePopup("popup-learn-ecd"));

    // Close popups on overlay click
    ["popup-acknowledged", "popup-learn-ecd"].forEach(id => {
      const el = $(`#${id}`);
      if (el) el.addEventListener("click", (e) => { if (e.target === el) hidePopup(id); });
    });

    // ── Children view ──
    $("#btn-show-add-child").addEventListener("click", () => { $("#add-child-form").classList.toggle("hidden"); });
    $("#btn-cancel-add-child").addEventListener("click", () => {
      $("#add-child-form").classList.add("hidden");
      $("#new-child-name").value = ""; $("#new-child-dob").value = "";
    });
    $("#btn-save-child").addEventListener("click", handleAddChild);
    $("#btn-add-first-child").addEventListener("click", () => {
      $("#add-child-form").classList.remove("hidden");
      $("#new-child-name").focus();
    });

    // ── Download Report ──
    $("#btn-download-report").addEventListener("click", function () {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentW = pageW - margin * 2;
      let y = margin;

      function checkPageBreak(h) { if (y + h > pageH - 20) { doc.addPage(); y = margin; } }
      function addText(text, fontSize, isBold, color, extra = 4) {
        doc.setFontSize(fontSize); doc.setFont("helvetica", isBold ? "bold" : "normal"); doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text || "", contentW);
        checkPageBreak(lines.length * (fontSize * 0.4 + 1));
        doc.text(lines, margin, y);
        y += lines.length * (fontSize * 0.4 + 1) + extra;
      }

      addText("ECD360 by Parentzo — Developmental Observation Report", 18, true, [107, 79, 160], 6);
      addText(`Child: ${window.currentChildName || "Child"}`, 11, false, [26, 26, 46], 2);
      addText(`Age: ${window.currentChildAge || ""} months`, 11, false, [26, 26, 46], 2);
      addText(`Date: ${window.currentObsDate || new Date().toLocaleDateString("en-IN")}`, 11, false, [26, 26, 46], 8);
      doc.setDrawColor(200, 200, 210); doc.line(margin, y, pageW - margin, y); y += 8;

      const results = window.lastSummaryResults || [];
      const domainLabels = { COG: "Cognitive", LANG: "Language", PHY: "Physical Development", SE: "Social & Emotional", ADP: "Adaptive Skills" };
      const groupLabels = { ACT_DEV: "Actively Developing", STS: "Still Taking Shape", NEEDS_ATTN: "Needs Attention!", SEEK_SUPP: "Seek Support!", INCOMPLETE: "Incomplete" };
      results.forEach(r => {
        checkPageBreak(40);
        addText(domainLabels[r.domain] || r.domain, 13, true, [26, 26, 46], 2);
        addText(groupLabels[r.group] || r.group, 11, false, [107, 79, 160], 3);
        if (r.explanation) addText(r.explanation, 10, false, [74, 74, 104], 3);
        if (r.actions) { addText("Action Plan:", 10, true, [26, 26, 46], 2); addText(r.actions, 10, false, [74, 74, 104], 6); }
        doc.setDrawColor(228, 228, 240); doc.line(margin, y, pageW - margin, y); y += 6;
      });

      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 170);
        doc.text("Generated by ECD360 · This is not a medical diagnosis", margin, pageH - 10);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 10, { align: "right" });
      }

      const safeName = (window.currentChildName || "child").replace(/\s+/g, "_");
      doc.save(`${safeName}_ecd360_report_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.pdf`);
    });

    // ── Dev autofill (Shift+1/2/3/4) ──
    document.addEventListener("keydown", (e) => {
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      if ($("#step-prompts").classList.contains("hidden")) return;
      if (e.shiftKey) {
        let v = null;
        if (e.key === "1" || e.key === "!") v = "OFTEN";
        if (e.key === "2" || e.key === "@") v = "SOMETIMES";
        if (e.key === "3" || e.key === "#") v = "NOT_YET";
        if (e.key === "4" || e.key === "$") v = "NEUTRAL";
        if (v) {
          e.preventDefault();
          prompts.forEach(p => { responses[p.prompt_id] = { prompt_id: p.prompt_id, domain: p.domain, response_value: v }; });
          currentPromptIndex = prompts.length - 1;
          renderPrompt(currentPromptIndex);
          toast(`Autofilled all prompts with ${v}! ✨`, "info");
        }
      }
    });
  }

  // ─── Session persistence ──────────────────────────────────────────────────────
  let _sessionRetryPending = false;
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !authState.isLoggedIn) return;
    try {
      const res = await fetch("/v1/children", { credentials: "include" });
      if (res.ok) {
        _sessionRetryPending = false;
        children = await res.json();
        if (currentView === "children") renderChildren();
      } else if (res.status === 401) {
        if (_sessionRetryPending) { _sessionRetryPending = false; setLoggedOutUI(); toast("Session expired. Please log in again.", "info"); }
        else { _sessionRetryPending = true; }
      } else { _sessionRetryPending = false; }
    } catch (_) {}
  });

  // ─── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    $("#nav-links").style.display = "none";
    $("#nav-user-area").classList.add("hidden");
    await loadActionData();
    bindEvents();
    await checkExistingSession();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
