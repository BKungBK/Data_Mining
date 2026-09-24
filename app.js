(function () {
  "use strict";

  const chapters = Array.isArray(window.EXAM_CHAPTERS) ? window.EXAM_CHAPTERS : [];
  const app = document.getElementById("app");
  const homeButton = document.getElementById("homeButton");
  const brandButton = document.getElementById("brandButton");
  const STORAGE_KEY = "before-exam-progress-v1";
  const optionLetters = ["ก", "ข", "ค", "ง"];
  let progress = loadProgress();
  let swipe = null;
  let swipeSubmitting = false;
  const motionObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle("is-on-screen", entry.isIntersecting));
  }, { threshold: .1 }) : null;

  function syncMotion() {
    document.body.classList.toggle("motion-paused", document.visibilityState === "hidden");
    motionObserver?.disconnect();
    document.querySelectorAll(".cta-loop, .brand-mark").forEach(element => {
      if (motionObserver) motionObserver.observe(element);
      else element.classList.add("is-on-screen");
    });
  }

  function setupHomeWheelScroll() {
    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetY = window.scrollY;
    let frame = 0;
    let previousFrameTime = 0;

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      previousFrameTime = 0;
      targetY = window.scrollY;
    }

    function maxScrollY() {
      const root = document.scrollingElement || document.documentElement;
      return Math.max(0, root.scrollHeight - window.innerHeight);
    }

    function animateScroll(timestamp) {
      if (!app.querySelector(".home-page")) {
        stop();
        return;
      }

      const elapsed = previousFrameTime ? Math.min(48, timestamp - previousFrameTime) : 16;
      previousFrameTime = timestamp;
      const currentY = window.scrollY;
      const distance = targetY - currentY;
      if (Math.abs(distance) < .6) {
        window.scrollTo(0, targetY);
        frame = 0;
        previousFrameTime = 0;
        return;
      }

      const easingTime = reducedMotion.matches ? 64 : 92;
      window.scrollTo(0, currentY + distance * (1 - Math.exp(-elapsed / easingTime)));
      frame = requestAnimationFrame(animateScroll);
    }

    function scrollToY(destination) {
      const currentTarget = frame ? targetY : window.scrollY;
      const nextTarget = Math.max(0, Math.min(maxScrollY(), destination));
      if (Math.abs(nextTarget - currentTarget) < .5) return false;
      targetY = nextTarget;
      if (!frame) {
        previousFrameTime = 0;
        frame = requestAnimationFrame(animateScroll);
      }
      return true;
    }

    document.addEventListener("wheel", event => {
      if (!app.querySelector(".home-page") || !finePointer.matches || !event.cancelable ||
        event.defaultPrevented || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true'], [data-native-scroll]")) return;

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      if (scrollToY((frame ? targetY : window.scrollY) + event.deltaY * unit * 1.08)) event.preventDefault();
    }, { passive: false });

    window.addEventListener("keydown", event => {
      if (!app.querySelector(".home-page") || !finePointer.matches ||
        event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [role='tab'], [contenteditable='true']")) return;

      const step = Math.max(96, window.innerHeight * .82);
      const target = event.key === "ArrowDown" ? window.scrollY + 96
        : event.key === "ArrowUp" ? window.scrollY - 96
          : ["PageDown", " "].includes(event.key) ? window.scrollY + step
            : event.key === "PageUp" ? window.scrollY - step
              : event.key === "Home" ? 0
                : event.key === "End" ? maxScrollY()
                  : null;
      if (target !== null && scrollToY(target)) event.preventDefault();
    }, true);

    window.addEventListener("pointerdown", stop, true);
    window.addEventListener("blur", stop);
  }

  function loadProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
    catch (_) { /* UI still works if storage is unavailable. */ }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function icon(name, className = "icon") {
    const shapes = {
      back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
      next: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      close: '<path d="M6 6l12 12M18 6 6 18"/>'
    };
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[name]}</svg>`;
  }

  function chapterFor(id) { return chapters.find(chapter => chapter.id === id); }
  function answerFor(chapter, index) { return progress[chapter.id]?.answers?.[index] ?? null; }
  function isComplete(chapter) { return Boolean(progress[chapter.id]?.completedAt); }
  function countAnswered(chapter) { return progress[chapter.id]?.answers?.filter(Boolean).length ?? 0; }
  function scoreFor(chapter) { return progress[chapter.id]?.answers?.filter(answer => answer?.correct).length ?? 0; }
  function route() {
    const pieces = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
    return { page: pieces[0] || "home", id: pieces[1], index: Number(pieces[2] || 0) };
  }

  function go(path) {
    const next = "#" + path;
    if (location.hash === next) render();
    else location.hash = next;
  }

  function createAttempt(chapter, previous) {
    const questionSetChanged = Boolean(previous) && (!Array.isArray(previous.answers) || previous.answers.length !== chapter.questions.length);
    progress[chapter.id] = {
      answers: Array(chapter.questions.length).fill(null),
      startedAt: Date.now(),
      completedAt: null,
      lastScore: questionSetChanged ? null : previous?.lastScore ?? null,
      bestScore: questionSetChanged ? null : previous?.bestScore ?? null,
      attempts: previous?.attempts ?? 0
    };
    saveProgress();
  }

  function startQuiz(chapter) {
    if (!chapter.questions.length) return;
    let record = progress[chapter.id];
    if (!record || record.completedAt || !Array.isArray(record.answers) || record.answers.length !== chapter.questions.length) {
      createAttempt(chapter, record);
      record = progress[chapter.id];
    }
    const nextIndex = record.answers.findIndex(answer => !answer);
    go(`quiz/${chapter.id}/${nextIndex === -1 ? 0 : nextIndex}`);
  }

  function finishIfComplete(chapter) {
    const record = progress[chapter.id];
    if (!record || record.completedAt || record.answers.some(answer => !answer)) return;
    const score = record.answers.filter(answer => answer.correct).length;
    record.completedAt = Date.now();
    record.lastScore = score;
    record.bestScore = Math.max(record.bestScore ?? 0, score);
    record.attempts = (record.attempts || 0) + 1;
  }

  function submitAnswer(chapter, index, selected) {
    const question = chapter.questions[index];
    const record = progress[chapter.id];
    if (!question || !record || record.answers[index]) return;
    const correct = selected === question.answer;
    record.answers[index] = { selected, correct };
    finishIfComplete(chapter);
    saveProgress();
    render(false);
    const feedback = app.querySelector("[data-feedback]");
    if (feedback) {
      feedback.focus({ preventScroll: true });
      requestAnimationFrame(() => feedback.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }

  function breadcrumb(items) {
    return `<nav class="breadcrumb" aria-label="ตำแหน่งหน้า">${items.map((item, index) => {
      const sep = index ? `<span aria-hidden="true">/</span>` : "";
      return sep + (item.path
        ? `<button type="button" class="text-link" data-go="${escapeHtml(item.path)}">${escapeHtml(item.label)}</button>`
        : `<span aria-current="page">${escapeHtml(item.label)}</span>`);
    }).join("")}</nav>`;
  }

  function homeHero(finished, total) {
    const completion = total ? Math.round(finished / total * 100) : 0;
    return `<section class="home-hero" aria-label="ภาพรวมการทบทวน">
      <div class="hero-copy">
        <span class="hero-kicker"><span aria-hidden="true"></span> ห้องทบทวนก่อนสอบ</span>
        <h1>ทบทวนให้พร้อมสอบ</h1>
        <p>อ่านสรุป ลองตอบ รู้จุดที่ควรทวน</p>
        <div class="hero-path" aria-label="อ่าน ลองตอบ และทบทวน">
          <span><b>01</b> อ่าน</span><i aria-hidden="true"></i><span><b>02</b> ลองตอบ</span><i aria-hidden="true"></i><span><b>03</b> ทบทวน</span>
        </div>
      </div>
      <div class="hero-visual">
        <div class="hero-orbit" aria-hidden="true"></div>
        <div class="hero-note-card">
          <div class="hero-card-top"><span>แผนการทบทวน</span><span class="hero-card-spark" aria-hidden="true">✳</span></div>
          <div class="hero-card-title"><span>วันนี้</span><strong>ค่อย ๆ เก็บ<br>ให้เข้าใจ</strong></div>
          <div class="hero-card-rule" aria-hidden="true"></div>
          <div class="hero-progress-label"><span>ทำแบบทดสอบครบ</span><strong>${finished}<small>/${total} บท</small></strong></div>
          <div class="hero-progress-track" role="progressbar" aria-label="บทที่ทำแบบทดสอบครบ" aria-valuenow="${finished}" aria-valuemin="0" aria-valuemax="${Math.max(total, 1)}"><span style="transform:scaleX(${completion / 100})"></span></div>
          <div class="hero-card-foot"><span>${finished ? `ทำครบแล้ว ${finished} บท · ดีมาก` : "เริ่มจากบทที่สนใจได้เลย"}</span><span aria-hidden="true">${icon("next")}</span></div>
        </div>
      </div>
    </section>`;
  }

  function chapterRow(chapter, tab) {
    const done = countAnswered(chapter);
    const completed = isComplete(chapter);
    const record = progress[chapter.id];
    const status = completed ? `ล่าสุด ${record.lastScore}/${chapter.questions.length} ข้อ · ดีที่สุด ${record.bestScore}/${chapter.questions.length}`
      : done ? `ทำแล้ว ${done}/${chapter.questions.length} ข้อ · ทำต่อได้` : "ยังไม่ได้ทำแบบทดสอบ";
    const primary = tab === "read"
      ? `<button class="row-action primary cta-loop" type="button" data-go="lesson/${escapeHtml(chapter.id)}"><span>อ่านบทเรียน</span>${icon("next")}</button>`
      : completed
        ? `<button class="row-action primary cta-loop" type="button" data-go="result/${escapeHtml(chapter.id)}"><span>ดูผล</span>${icon("next")}</button>`
        : `<button class="row-action primary cta-loop" type="button" data-start="${escapeHtml(chapter.id)}"><span>${done ? "ทำต่อ" : "เริ่มทำ"}</span>${icon("next")}</button>`;
    return `<article class="chapter-row theme-${escapeHtml(chapter.theme)}">
      <span class="chapter-number" aria-hidden="true">${escapeHtml(chapter.number)}</span>
      <div><h3 class="chapter-name">${escapeHtml(chapter.title)}</h3><p class="chapter-desc" aria-label="${escapeHtml(chapter.description)}">${escapeHtml(chapter.summary || chapter.description)}</p>
      <div class="chapter-meta"><span>${tab === "read" ? escapeHtml(chapter.duration) : escapeHtml(status)}</span><span>${chapter.questions.length} ข้อ</span></div></div>
      <div class="chapter-actions">${primary}</div>
    </article>`;
  }

  function renderHome(tab) {
    const selected = tab === "read" ? "read" : "quiz";
    const finished = chapters.filter(isComplete).length;
    document.title = "ก่อนสอบ — เลือกบท";
    app.innerHTML = `<div class="page-view home-page" data-tab="${selected}">${homeHero(finished, chapters.length)}
      <div class="home-controls"><div class="home-controls-title"><h2>หัวข้อทบทวน</h2><span class="chapter-total">${chapters.length} บท</span></div>
      <div class="tab-list" role="tablist" aria-label="เลือกกิจกรรม">
        <button class="tab" type="button" role="tab" aria-selected="${selected === "quiz"}" tabindex="${selected === "quiz" ? 0 : -1}" data-go="home/quiz">ทำแบบทดสอบ</button>
        <button class="tab" type="button" role="tab" aria-selected="${selected === "read"}" tabindex="${selected === "read" ? 0 : -1}" data-go="home/read">อ่านแต่ละบท</button>
      </div></div>
      <div class="chapter-list" role="tabpanel" aria-label="${selected === "quiz" ? "รายการแบบทดสอบ" : "รายการบทเรียน"}">${chapters.map(chapter => chapterRow(chapter, selected)).join("")}</div></div>`;
  }

  function updateHome(tab) {
    const home = app.querySelector(".home-page");
    if (!home) return false;
    const selected = tab === "read" ? "read" : "quiz";
    if (home.dataset.tab === selected) return true;
    const hadTabFocus = document.activeElement?.getAttribute("role") === "tab";
    home.dataset.tab = selected;
    home.querySelectorAll('[role="tab"]').forEach(tabButton => {
      const active = tabButton.dataset.go === `home/${selected}`;
      tabButton.setAttribute("aria-selected", String(active));
      tabButton.tabIndex = active ? 0 : -1;
      if (active && hadTabFocus) tabButton.focus({ preventScroll: true });
    });
    const list = home.querySelector(".chapter-list");
    list.setAttribute("aria-label", selected === "quiz" ? "รายการแบบทดสอบ" : "รายการบทเรียน");
    list.innerHTML = chapters.map(chapter => chapterRow(chapter, selected)).join("");
    list.animate?.([{ opacity: .72, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 190, easing: "cubic-bezier(.16,1,.3,1)" });
    document.title = "ก่อนสอบ — เลือกบท";
    return true;
  }

  function visualFor(chapter) {
    const visual = chapter.lesson.visual || {};
    if (visual.image) {
      return `<div class="lesson-visual theme-${escapeHtml(chapter.theme)}"><div class="visual-inner"><img src="${escapeHtml(visual.image)}" alt="${escapeHtml(visual.alt || "ภาพประกอบบทเรียน")}"><span class="visual-caption">${escapeHtml(visual.label || "")}</span></div></div>`;
    }
    let content = "";
    if (visual.type === "percent") {
      content = `<div class="percent-grid" aria-hidden="true">${Array.from({ length: 100 }, (_, index) => `<span class="${index < 25 ? "filled" : ""}"></span>`).join("")}</div>`;
    } else if (visual.type === "flow") {
      const steps = visual.steps || [];
      content = "<ol class=\"lesson-flow\" aria-label=\"" + escapeHtml(visual.label || "Steps") + "\">"
        + steps.map(step => "<li>" + escapeHtml(step) + "</li>").join("")
        + "</ol>";
    } else if (visual.type === "bars") {
      content = `<div class="bar-chart" role="img" aria-label="กราฟแท่ง ก 12 ข 18 ค 9">
        <div class="bar-col"><b>12</b><i style="height:96px"></i><span>ก</span></div>
        <div class="bar-col"><b>18</b><i style="height:144px"></i><span>ข</span></div>
        <div class="bar-col"><b>9</b><i style="height:72px"></i><span>ค</span></div></div>`;
    } else {
      content = `<div class="reading-visual" aria-hidden="true"><div class="reading-main"></div><div class="reading-line"></div><div class="reading-line"></div><div class="reading-line short"></div></div>`;
    }
    return `<div class="lesson-visual theme-${escapeHtml(chapter.theme)}"><div class="visual-inner">${content}<span class="visual-caption">${escapeHtml(visual.label || "")}</span></div></div>`;
  }

  function lessonAction(chapter) {
    const done = countAnswered(chapter);
    const completed = isComplete(chapter);
    return `<button class="button button-primary cta-loop" type="button" data-start="${escapeHtml(chapter.id)}"><span>${completed ? "ทำแบบทดสอบอีกครั้ง" : done ? `ทำต่อจากข้อ ${done + 1}` : "เริ่มทำแบบทดสอบ"}</span><span class="button-arrow">${icon("next")}</span></button>`;
  }

  function renderLessonSection(section) {
    const paragraphs = section.paragraphs || (section.body ? [section.body] : []);
    const paragraphHtml = paragraphs.map(text => "<p>" + escapeHtml(text) + "</p>").join("");
    const renderItem = item => {
      if (typeof item === "string") return "<li>" + escapeHtml(item) + "</li>";
      const label = escapeHtml(item.label || item.term || "");
      const detail = escapeHtml(item.detail || item.body || "");
      return "<li>" + (label ? "<strong>" + label + "</strong>" : "") + (detail ? " " + detail : "") + "</li>";
    };
    const listHtml = (items, tag) => Array.isArray(items) && items.length
      ? "<" + tag + " class=\"lesson-list\">" + items.map(renderItem).join("") + "</" + tag + ">"
      : "";
    let tableHtml = "";
    if (section.table) {
      const headers = (section.table.headers || []).map(value => "<th scope=\"col\">" + escapeHtml(value) + "</th>").join("");
      const rows = (section.table.rows || []).map(row => "<tr>" + row.map((value, index) => "<td data-label=\"" + escapeHtml((section.table.headers || [])[index] || "") + "\">" + escapeHtml(value) + "</td>").join("") + "</tr>").join("");
      tableHtml = "<div class=\"lesson-table-wrap\" role=\"region\" tabindex=\"0\" aria-label=\"" + escapeHtml(section.table.caption || section.title) + "\">"
        + "<table class=\"lesson-table\">"
        + (section.table.caption ? "<caption>" + escapeHtml(section.table.caption) + "</caption>" : "")
        + "<thead><tr>" + headers + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    const equations = Array.isArray(section.equations) && section.equations.length
      ? "<div class=\"lesson-equations\">" + section.equations.map(value => "<code>" + escapeHtml(value) + "</code>").join("") + "</div>"
      : "";
    const note = section.note ? "<p class=\"lesson-note\">" + escapeHtml(section.note) + "</p>" : "";
    return "<section class=\"lesson-section\"><h2>" + escapeHtml(section.title) + "</h2>"
      + paragraphHtml + listHtml(section.items, "ul") + listHtml(section.steps, "ol") + tableHtml + equations + note + "</section>";
  }

  function renderLesson(chapter) {
    document.title = `${chapter.title} — ก่อนสอบ`;
    app.innerHTML = `<div class="page-view lesson-page">${breadcrumb([{ label: "อ่านแต่ละบท", path: "home/read" }, { label: chapter.title }])}
      <div class="lesson-layout"><article>
        <header class="lesson-head"><span class="overline">บท ${escapeHtml(chapter.number)} · ${escapeHtml(chapter.duration)}</span>
          <h1>${escapeHtml(chapter.title)}</h1><p>${escapeHtml(chapter.summary || chapter.description)}</p></header>
        ${visualFor(chapter)}
        <p class="lesson-intro">${escapeHtml(chapter.lesson.intro)}</p>
        ${chapter.lesson.sections.map(renderLessonSection).join("")}
        <div class="takeaway"><span class="takeaway-icon">${icon("check")}</span><span>จำไว้: ${escapeHtml(chapter.lesson.takeaway)}</span></div>
        <button class="button button-secondary" type="button" data-go="home/read"><span class="button-arrow">${icon("back")}</span> กลับไปเลือกบท</button>
      </article><aside class="lesson-side"><h2>พร้อมลองตอบหรือยัง?</h2><p>มี ${chapter.questions.length} ข้อ ตอบแล้วจะเห็นเฉลยและเหตุผลทันที</p>
        ${lessonAction(chapter)}<p class="small-note">หยุดกลางทางแล้วกลับมาทำต่อได้</p></aside></div>
      <div class="mobile-lesson-action">${lessonAction(chapter)}</div></div>`;
  }

  function selectedLabel(question, selected) {
    if (question.type === "binary") return selected ? "ใช่" : "ไม่ใช่";
    return question.options.find(option => option.id === selected)?.text || "";
  }

  function reasonFor(question, selected) {
    if (question.type === "binary") return question.reasons?.[String(selected)] || "";
    return question.options.find(option => option.id === selected)?.reason || "";
  }

  function choiceBody(question, answer) {
    return `<div class="option-list" role="group" aria-label="ตัวเลือกคำตอบ">
      ${question.options.map((option, index) => {
        const isCorrect = answer && option.id === question.answer;
        const isWrong = answer && option.id === answer.selected && !answer.correct;
        const status = isCorrect ? "คำตอบที่ถูก" : isWrong ? "ยังไม่ถูก" : "";
        return `<button class="option ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}" type="button"
          data-answer="${escapeHtml(option.id)}" ${answer ? "disabled" : ""} aria-label="${escapeHtml(optionLetters[index] || index + 1)} ${escapeHtml(option.text)}${status ? ` ${status}` : ""}">
          <span class="option-letter">${escapeHtml(optionLetters[index] || index + 1)}</span>
          <span class="option-copy"><span class="option-text">${escapeHtml(option.text)}</span>${status ? `<span class="option-mark" aria-hidden="true">${icon(isCorrect ? "check" : "close")}<span>${status}</span></span>` : ""}</span></button>`;
      }).join("")}</div>`;
  }

  function binaryBody(question, answer) {
    const yesClass = answer && question.answer === true ? "is-correct" : answer?.selected === true ? "is-wrong" : "";
    const noClass = answer && question.answer === false ? "is-correct" : answer?.selected === false ? "is-wrong" : "";
    const statusFor = value => !answer ? "" : value === question.answer ? `${icon("check")} คำตอบที่ถูก` : value === answer.selected ? `${icon("close")} ยังไม่ถูก` : "";
    return `<div class="swipe-guide" role="note"><span class="swipe-guide-no">${icon("back")} ปัดซ้าย <strong>ไม่ใช่</strong></span>
        <span class="swipe-guide-yes">ปัดขวา <strong>ใช่</strong> ${icon("next")}</span></div>
      <div class="swipe-stage"><div class="swipe-back-card" aria-hidden="true"></div>
        <span class="swipe-stamp no" aria-hidden="true">ไม่ใช่</span><span class="swipe-stamp yes" aria-hidden="true">ใช่</span>
        <div class="swipe-card ${answer ? answer.correct ? "answered-correct" : "answered-wrong" : ""}" data-swipe-card tabindex="${answer ? -1 : 0}" role="group" aria-label="ปัดซ้ายตอบไม่ใช่ ปัดขวาตอบใช่ หรือใช้ปุ่มด้านล่าง">
          <div><div class="card-label">ข้อความนี้ถูกหรือไม่?</div><div class="card-text">${escapeHtml(question.prompt)}</div>
          <div class="card-bottom">${answer ? `คุณตอบ ${answer.selected ? "ใช่" : "ไม่ใช่"}` : "ปัดบนหน้าจอเพื่อตอบ"}</div></div>
        </div></div>
      <div class="binary-actions" role="group" aria-label="ตอบใช่หรือไม่">
        <button class="binary-button ${noClass}" type="button" data-answer="false" aria-label="ตอบไม่ใช่" ${answer ? "disabled" : ""}>${icon("back")}<span>ไม่ใช่</span>${answer ? `<span class="binary-status">${statusFor(false)}</span>` : ""}</button>
        <button class="binary-button ${yesClass}" type="button" data-answer="true" aria-label="ตอบใช่" ${answer ? "disabled" : ""}><span>ใช่</span>${icon("next")}${answer ? `<span class="binary-status">${statusFor(true)}</span>` : ""}</button>
      </div>`;
  }

  function feedbackFor(question, answer) {
    if (!answer) return "";
    const chosenReason = reasonFor(question, answer.selected);
    const correctReason = reasonFor(question, question.answer);
    return `<section class="feedback ${answer.correct ? "" : "wrong"}" data-feedback tabindex="-1" aria-live="polite">
      <h2><span class="feedback-icon">${icon(answer.correct ? "check" : "close")}</span>${answer.correct ? "ถูกแล้ว — เพราะอะไร?" : "ยังไม่ถูก — มาดูเหตุผล"}</h2>
      <p>${escapeHtml(chosenReason)}</p>
      ${answer.correct ? "" : `<p class="feedback-detail"><strong>คำตอบที่ถูก: ${escapeHtml(selectedLabel(question, question.answer))}</strong><br>${escapeHtml(correctReason)}</p>`}
    </section>`;
  }

  function quizContent(question, answer) {
    return `<div class="question-type">${question.type === "binary" ? "ตอบใช่หรือไม่" : "เลือกคำตอบ 1 ข้อ"} · ${escapeHtml(question.topic)}</div>
      ${question.type === "binary" ? `<h1 class="question-title" tabindex="-1">ใช่หรือไม่?</h1>${binaryBody(question, answer)}` : `<h1 class="question-title" tabindex="-1">${escapeHtml(question.prompt)}</h1><p class="question-hint">แตะคำตอบที่คิดว่าถูก แล้วอ่านเหตุผลก่อนข้อต่อไป</p>${choiceBody(question, answer)}`}
      ${feedbackFor(question, answer)}`;
  }

  function quizAction(chapter, index, answer) {
    const last = index === chapter.questions.length - 1;
    const path = last ? `result/${chapter.id}` : `quiz/${chapter.id}/${index + 1}`;
    const label = answer ? last ? "ดูสรุปคะแนน" : "ข้อถัดไป" : "ตอบก่อนเพื่อไปต่อ";
    return `<button class="button button-primary cta-loop" type="button" ${answer ? `data-go="${escapeHtml(path)}"` : "disabled"}><span class="button-label">${label}</span><span class="button-arrow">${icon("next")}</span></button>`;
  }

  function renderQuiz(chapter, rawIndex) {
    if (!chapter.questions.length) { go("home/quiz"); return false; }
    const record = progress[chapter.id];
    if (!record || !Array.isArray(record.answers) || record.answers.length !== chapter.questions.length) createAttempt(chapter, record);
    const index = Math.max(0, Math.min(chapter.questions.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
    const question = chapter.questions[index];
    const answer = answerFor(chapter, index);
    const answeredCount = countAnswered(chapter);
    const backPath = index ? `quiz/${chapter.id}/${index - 1}` : `lesson/${chapter.id}`;
    document.title = `ข้อ ${index + 1} — ${chapter.title}`;
    const existing = app.querySelector(".quiz-page");
    if (existing?.dataset.chapter === chapter.id) {
      const changed = existing.dataset.index !== String(index);
      existing.dataset.index = String(index);
      existing.dataset.questionType = question.type;
      const back = existing.querySelector(".quiz-back");
      back.dataset.go = backPath;
      back.setAttribute("aria-label", index ? "กลับข้อก่อนหน้า" : "กลับบทเรียน");
      const crumb = existing.querySelector('.breadcrumb [aria-current="page"]');
      if (crumb) crumb.textContent = `ข้อ ${index + 1}`;
      const counter = existing.querySelector(".quiz-counter");
      counter.textContent = `ข้อ ${index + 1}/${chapter.questions.length}`;
      counter.setAttribute("aria-label", `ข้อ ${index + 1} จาก ${chapter.questions.length}`);
      const track = existing.querySelector(".progress-track");
      track.setAttribute("aria-valuenow", String(answeredCount));
      existing.querySelector(".progress-fill").style.transform = `scaleX(${answeredCount / chapter.questions.length})`;
      const content = existing.querySelector(".quiz-content");
      content.innerHTML = quizContent(question, answer);
      const action = existing.querySelector(".quiz-actions .button");
      const last = index === chapter.questions.length - 1;
      action.disabled = !answer;
      if (answer) action.dataset.go = last ? `result/${chapter.id}` : `quiz/${chapter.id}/${index + 1}`;
      else delete action.dataset.go;
      action.querySelector(".button-label").textContent = answer ? last ? "ดูสรุปคะแนน" : "ข้อถัดไป" : "ตอบก่อนเพื่อไปต่อ";
      if (changed) {
        content.scrollTop = 0;
        content.animate?.([{ opacity: .45, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
        counter.animate?.([{ opacity: .5, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 180, easing: "ease-out" });
      }
      return true;
    }
    app.innerHTML = `<div class="page-view quiz-page" data-chapter="${escapeHtml(chapter.id)}" data-index="${index}" data-question-type="${question.type}">${breadcrumb([{ label: "ทำแบบทดสอบ", path: "home/quiz" }, { label: chapter.title, path: `lesson/${chapter.id}` }, { label: `ข้อ ${index + 1}` }])}
      <div class="quiz-wrap"><div class="quiz-chrome"><div class="quiz-topline">
        <button class="quiz-back" type="button" data-go="${escapeHtml(backPath)}" aria-label="${index ? "กลับข้อก่อนหน้า" : "กลับบทเรียน"}">${icon("back")}</button>
        <div class="quiz-topline-copy"><span>บท ${escapeHtml(chapter.number)} · แบบทดสอบ</span><strong>${escapeHtml(chapter.title)}</strong></div>
        <span class="quiz-counter" aria-label="ข้อ ${index + 1} จาก ${chapter.questions.length}">ข้อ ${index + 1}/${chapter.questions.length}</span></div>
        <div class="progress-track" role="progressbar" aria-label="ความคืบหน้า" aria-valuenow="${answeredCount}" aria-valuemin="0" aria-valuemax="${chapter.questions.length}"><div class="progress-fill" style="transform:scaleX(${answeredCount / chapter.questions.length})"></div></div></div>
      <div class="swipe-overlay" aria-hidden="true"><span class="swipe-overlay-no">${icon("back")} ไม่ใช่</span><span class="swipe-overlay-yes">ใช่ ${icon("next")}</span></div>
      <div class="quiz-content">${quizContent(question, answer)}</div>
      <div class="quiz-actions">${quizAction(chapter, index, answer)}</div></div></div>`;
    return false;
  }

  function topicRows(chapter) {
    const map = new Map();
    chapter.questions.forEach((question, index) => {
      const row = map.get(question.topic) || { total: 0, wrong: 0 };
      row.total += 1;
      if (!answerFor(chapter, index)?.correct) row.wrong += 1;
      map.set(question.topic, row);
    });
    return [...map].sort((a, b) => b[1].wrong - a[1].wrong).map(([topic, data]) =>
      `<div class="topic-row ${data.wrong ? "has-wrong" : ""}"><span>${escapeHtml(topic)}</span><span>${data.wrong ? `พลาด ${data.wrong}/${data.total}` : `ถูก ${data.total}/${data.total}`}</span></div>`
    ).join("");
  }

  function renderResult(chapter) {
    const record = progress[chapter.id];
    if (record && (!Array.isArray(record.answers) || record.answers.length !== chapter.questions.length)) createAttempt(chapter, record);
    if (!isComplete(chapter)) { go("home/quiz"); return; }
    const total = chapter.questions.length;
    const score = scoreFor(chapter);
    const mistakes = chapter.questions.map((question, index) => ({ question, index })).filter(({ index }) => !answerFor(chapter, index)?.correct);
    document.title = `สรุปคะแนน ${chapter.title} — ก่อนสอบ`;
    app.innerHTML = `<div class="page-view result-page">${breadcrumb([{ label: "ทำแบบทดสอบ", path: "home/quiz" }, { label: chapter.title, path: `lesson/${chapter.id}` }, { label: "สรุปคะแนน" }])}
      <div class="result-head"><span class="overline">ทำครบแล้ว · ${escapeHtml(chapter.title)}</span>
        <h1>${score === total ? "เข้าใจครบทุกข้อ" : score >= total / 2 ? "รู้จุดที่ควรทวน" : "เริ่มทบทวนอีกครั้ง"}</h1>
        <p>คะแนนรอบนี้</p><div class="score-display"><strong>${score}</strong><span>/ ${total} ข้อ</span></div>
        <p>${mistakes.length ? `พลาด ${mistakes.length} ข้อ · เปิดดูเหตุผลแต่ละข้อได้ด้านล่าง` : "ตอบถูกทุกข้อ ลองทบทวนบทถัดไปได้เลย"}</p>
      </div>
      <div class="result-actions"><button class="button button-primary cta-loop" type="button" data-go="home/quiz"><span>เลือกบทต่อ</span><span class="button-arrow">${icon("next")}</span></button>
        <button class="button button-secondary" type="button" data-go="lesson/${escapeHtml(chapter.id)}">อ่านบทนี้อีกครั้ง</button>
        <button class="button button-secondary" type="button" data-start="${escapeHtml(chapter.id)}">ทำอีกครั้ง</button></div>
      <div class="report-grid"><section class="report-panel"><h2>พลาดเรื่องไหนบ่อย?</h2><p>เรียงหัวข้อที่พลาดมากที่สุดไว้ด้านบน</p>${topicRows(chapter)}</section>
      <section class="report-panel"><h2>ข้อที่ควรกลับไปดู</h2>
        ${mistakes.length ? mistakes.map(({ question, index }) => `<div class="mistake-item"><h3>ข้อ ${index + 1} · ${escapeHtml(question.type === "binary" ? question.prompt : question.prompt)}</h3>
          <p>คำตอบที่ถูก: ${escapeHtml(selectedLabel(question, question.answer))}</p><button class="text-link" type="button" data-go="quiz/${escapeHtml(chapter.id)}/${index}">ดูเหตุผลข้อนี้ ${icon("next")}</button></div>`).join("")
          : `<div class="all-good">ไม่มีข้อที่ตอบผิดในรอบนี้ ${icon("check")}</div>`}</section></div></div>`;
  }

  function render(scroll = true) {
    const current = route();
    const chapter = chapterFor(current.id);
    document.body.dataset.page = ["lesson", "quiz", "result"].includes(current.page) && chapter ? current.page : "home";
    homeButton.hidden = current.page === "home";
    let retained = false;
    if (current.page === "lesson" && chapter) renderLesson(chapter);
    else if (current.page === "quiz" && chapter) retained = renderQuiz(chapter, current.index);
    else if (current.page === "result" && chapter) renderResult(chapter);
    else if (updateHome(current.id)) retained = true;
    else renderHome(current.id);
    app.dataset.enter = retained ? "false" : scroll ? "true" : "false";
    syncMotion();
    if (!scroll || (retained && current.page === "home")) return;
    if (retained && current.page === "quiz") {
      window.scrollTo(0, 0);
      app.querySelector(".question-title")?.focus({ preventScroll: true });
      return;
    }
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }

  document.addEventListener("click", event => {
    const goButton = event.target.closest("[data-go]");
    if (goButton) { go(goButton.dataset.go); return; }
    const startButton = event.target.closest("[data-start]");
    if (startButton) { const chapter = chapterFor(startButton.dataset.start); if (chapter) startQuiz(chapter); return; }
    const answerButton = event.target.closest("[data-answer]");
    if (answerButton && !swipeSubmitting) {
      const current = route();
      const chapter = chapterFor(current.id);
      if (!chapter || current.page !== "quiz") return;
      const question = chapter.questions[current.index];
      const selected = question.type === "binary" ? answerButton.dataset.answer === "true" : answerButton.dataset.answer;
      submitAnswer(chapter, current.index, selected);
    }
  });

  document.addEventListener("keydown", event => {
    const current = route();
    if (current.page === "home" && event.target?.getAttribute("role") === "tab" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); go(current.id === "read" ? "home/quiz" : "home/read");
      return;
    }
    if (current.page !== "quiz" || swipeSubmitting || event.altKey || event.ctrlKey || event.metaKey) return;
    const chapter = chapterFor(current.id);
    const question = chapter?.questions[current.index];
    if (!question || answerFor(chapter, current.index)) return;
    if (question.type === "binary" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault(); submitAnswer(chapter, current.index, event.key === "ArrowRight");
    } else if (question.type === "choice" && /^[1-4]$/.test(event.key)) {
      const option = question.options[Number(event.key) - 1];
      if (option) { event.preventDefault(); submitAnswer(chapter, current.index, option.id); }
    }
  });

  document.addEventListener("pointerdown", event => {
    const page = event.target.closest(".quiz-page");
    const current = route();
    const chapter = chapterFor(current.id);
    if (!page || current.page !== "quiz" || !chapter || chapter.questions[current.index]?.type !== "binary" ||
      swipeSubmitting || answerFor(chapter, current.index) || event.target.closest("button, a, input, textarea, select") ||
      (event.pointerType === "mouse" && event.button !== 0)) return;
    const card = page.querySelector("[data-swipe-card]");
    if (!card) return;
    swipe = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, delta: 0, card, page, active: false,
      lastX: event.clientX, lastTime: event.timeStamp, velocity: 0, chapterId: chapter.id, index: current.index };
    try { page.setPointerCapture(event.pointerId); } catch (_) { /* Capture is optional. */ }
  });

  document.addEventListener("pointermove", event => {
    if (!swipe || event.pointerId !== swipe.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.active && Math.abs(dy) > Math.abs(dx) * 1.25 && Math.abs(dy) > 8) { swipe = null; return; }
    if (!swipe.active && Math.abs(dx) < 6) return;
    swipe.active = true;
    if (event.pointerType === "mouse" && event.cancelable) event.preventDefault();
    swipe.card.classList.add("dragging");
    swipe.delta = dx;
    if (event.timeStamp > swipe.lastTime) swipe.velocity = (event.clientX - swipe.lastX) / (event.timeStamp - swipe.lastTime);
    swipe.lastX = event.clientX;
    swipe.lastTime = event.timeStamp;
    swipe.card.style.transform = `translateX(${Math.max(-160, Math.min(160, dx))}px) rotate(${Math.max(-11, Math.min(11, dx / 14))}deg)`;
    const stage = swipe.card.parentElement;
    stage.classList.toggle("toward-yes", dx > 15);
    stage.classList.toggle("toward-no", dx < -15);
    swipe.page.classList.toggle("swiping-yes", dx > 15);
    swipe.page.classList.toggle("swiping-no", dx < -15);
    stage.previousElementSibling?.classList.toggle("toward-yes", dx > 15);
    stage.previousElementSibling?.classList.toggle("toward-no", dx < -15);
    stage.querySelector(".swipe-stamp.yes").style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
    stage.querySelector(".swipe-stamp.no").style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
  });

  function endSwipe(event) {
    if (!swipe || event.pointerId !== swipe.pointerId) return;
    const active = swipe;
    swipe = null;
    const stage = active.card.parentElement;
    const reset = () => {
      active.card.classList.remove("dragging");
      active.card.style.transform = "";
      stage.classList.remove("toward-no", "toward-yes");
      active.page.classList.remove("swiping-no", "swiping-yes");
      stage.previousElementSibling?.classList.remove("toward-no", "toward-yes");
      stage.querySelectorAll(".swipe-stamp").forEach(stamp => { stamp.style.opacity = ""; });
    };
    const threshold = Math.min(104, Math.max(64, active.card.clientWidth * .22));
    if (event.type === "pointercancel" || !active.active ||
      (Math.abs(active.delta) < threshold && !(Math.abs(active.delta) >= 28 && Math.abs(active.velocity) >= .6))) {
      reset();
      return;
    }
    swipeSubmitting = true;
    active.card.classList.remove("dragging");
    app.querySelectorAll(".binary-button").forEach(button => { button.disabled = true; });
    const direction = Math.sign(active.delta);
    const from = active.card.style.transform;
    const target = `translateX(${direction * (window.innerWidth + active.card.clientWidth)}px) rotate(${direction * 16}deg)`;
    const animation = active.card.animate([{ transform: from, opacity: 1 }, { transform: target, opacity: 0 }],
      { duration: 210, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
    animation.finished.catch(() => {}).then(() => {
      const current = route();
      const chapter = chapterFor(active.chapterId);
      active.page.classList.remove("swiping-no", "swiping-yes");
      swipeSubmitting = false;
      if (chapter && current.page === "quiz" && current.id === active.chapterId && current.index === active.index)
        submitAnswer(chapter, active.index, direction > 0);
    });
  }
  document.addEventListener("pointerup", endSwipe);
  document.addEventListener("pointercancel", endSwipe);
  window.addEventListener("hashchange", () => render());
  document.addEventListener("visibilitychange", syncMotion);
  brandButton.addEventListener("click", () => go("home/quiz"));
  homeButton.addEventListener("click", () => go("home/quiz"));
  setupHomeWheelScroll();
  render();
})();
