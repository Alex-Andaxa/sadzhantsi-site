// Тема застосовується ще до відмальовування сторінки, щоб не було «спалаху» світлої теми
(function () {
  var t;
  try { t = localStorage.getItem("theme"); } catch (e) {}
  if (t !== "dark" && t !== "light") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", t);
})();
