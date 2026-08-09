// General UI behaviour: sticky header, mobile nav, footer year, active link on scroll

document.addEventListener("DOMContentLoaded", () => {
  const header = document.getElementById("siteHeader");
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");
  const footerYear = document.getElementById("footerYear");
  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll("main section[id]");

  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Sticky header on scroll
  const onScroll = () => {
    if (window.scrollY > 24) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile nav toggle
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", () => {
      mainNav.classList.toggle("mobile-open");
      navToggle.classList.toggle("open");
    });
  }

  // Highlight active nav link based on scroll position
  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((link) => link.classList.remove("active"));
            const activeLink = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
            if (activeLink) activeLink.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((section) => observer.observe(section));
  }

  // Close mobile nav when a link is clicked
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      mainNav?.classList.remove("mobile-open");
      navToggle?.classList.remove("open");
    });
  });
});
