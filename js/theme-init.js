/* Applies the saved theme before the first paint so there is no flash. Default: light. */
(function () {
  var theme = "light";
  try {
    var saved = JSON.parse(localStorage.getItem("QuraviaTheme"));
    if (saved === "dark" || saved === "light") theme = saved;
  } catch (error) {
    /* storage unavailable: keep the default */
  }
  document.documentElement.setAttribute("data-theme", theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#ffffff");
})();
