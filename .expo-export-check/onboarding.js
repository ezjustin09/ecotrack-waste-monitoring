const slides = [
  {
    badge: "GPS Tracking",
    title: "Track truck movement in real time",
    description:
      "View route location updates so operations teams can quickly confirm if collection vehicles are on schedule.",
    video: "/assets/onboarding/gps1.mp4",
  },
  {
    badge: "Issue Reporting",
    title: "Submit cleanup reports with context",
    description:
      "Capture field incidents in a structured format and reduce follow-up delays between crews and supervisors.",
    video: "/assets/onboarding/report.mp4",
  },
  {
    badge: "Announcements",
    title: "Share critical service advisories",
    description:
      "Keep residents and teams aligned when schedules change, with focused announcements everyone can see.",
    video: "/assets/onboarding/announcement.mp4",
  },
  {
    badge: "City News",
    title: "Stay informed with local updates",
    description:
      "Review relevant waste-management and city operations news in one place before each shift starts.",
    video: "/assets/onboarding/news.mp4",
  },
];

const state = {
  index: 0,
  completed: false,
};

const video = document.getElementById("onboardingVideo");
const badge = document.getElementById("slideBadge");
const title = document.getElementById("slideTitle");
const description = document.getElementById("slideDescription");
const counter = document.getElementById("slideCounter");
const dots = document.getElementById("slideDots");
const backButton = document.getElementById("backButton");
const nextButton = document.getElementById("nextButton");
const finishButton = document.getElementById("finishButton");
const skipButton = document.getElementById("skipButton");
const completionMessage = document.getElementById("completionMessage");

function clearCompletionState() {
  state.completed = false;
  finishButton.textContent = "Finish";
  completionMessage.hidden = true;
}

function goToSlide(index) {
  state.index = index;
  clearCompletionState();
  render();
}

function renderDots() {
  dots.innerHTML = "";

  slides.forEach((slide, index) => {
    const dot = document.createElement("button");
    dot.className = `dot${index === state.index ? " is-active" : ""}`;
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Go to step ${index + 1}: ${slide.title}`);
    dot.setAttribute("aria-selected", String(index === state.index));
    dot.addEventListener("click", () => goToSlide(index));
    dots.appendChild(dot);
  });
}

function render() {
  const slide = slides[state.index];
  const isLast = state.index === slides.length - 1;

  badge.textContent = slide.badge;
  title.textContent = slide.title;
  description.textContent = slide.description;
  counter.textContent = `Step ${state.index + 1} of ${slides.length}`;

  backButton.disabled = state.index === 0;
  nextButton.hidden = isLast;
  finishButton.hidden = !isLast;

  if (video.getAttribute("src") !== slide.video) {
    video.src = slide.video;
  }

  video.play().catch(() => {
    // Autoplay may be blocked in some browsers until user interaction.
  });

  renderDots();
}

backButton.addEventListener("click", () => {
  if (state.index > 0) {
    goToSlide(state.index - 1);
  }
});

nextButton.addEventListener("click", () => {
  if (state.index < slides.length - 1) {
    goToSlide(state.index + 1);
  }
});

skipButton.addEventListener("click", () => {
  goToSlide(slides.length - 1);
});

finishButton.addEventListener("click", () => {
  if (!state.completed) {
    state.completed = true;
    localStorage.setItem("ecotrack.webOnboardingComplete", new Date().toISOString());
    completionMessage.hidden = false;
    completionMessage.textContent = "Onboarding complete. This is a standalone web flow and is not attached to the Playground mobile app.";
    finishButton.textContent = "Replay";
    return;
  }

  goToSlide(0);
});

render();
