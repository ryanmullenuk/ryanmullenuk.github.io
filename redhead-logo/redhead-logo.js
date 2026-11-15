/* Play the supplied logo once on entry, then reveal the homepage. */
(function () {
  'use strict';
  var root = document.documentElement;
  var splash = document.getElementById('intro-splash');
  var page = document.querySelector('.page');
  if (!splash || !page) return;
  var finished = false;
  var playTimer;
  var holdTimer;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(window.redheadSplashSafety);
    clearTimeout(playTimer);
    clearTimeout(holdTimer);
    root.classList.remove('splash-pending', 'splash-revealing');
    page.inert = false;
    splash.remove();
  }
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!root.classList.contains('splash-pending') || reducedMotion.matches) {
    finish();
    return;
  }
  page.inert = true;
  reducedMotion.addEventListener('change', function (event) { if (event.matches) finish(); });
  var logo = splash.querySelector('.rh-logo');
  var leaving = false;
  function reveal() {
    if (finished || leaving) return;
    leaving = true;
    root.classList.add('splash-revealing');
    splash.classList.add('is-leaving');
    splash.addEventListener('transitionend', function (event) {
      if (event.target === splash && event.propertyName === 'opacity') finish();
    });
    setTimeout(finish, 700);
  }
  function completed() {
    if (holdTimer || finished) return;
    clearTimeout(playTimer);
    holdTimer = setTimeout(reveal, 350);
  }
  logo.addEventListener('animationend', function (event) {
    if (event.animationName === 'rh-reveal') completed();
  });
  var images = Array.from(splash.querySelectorAll('img'));
  var ready = images.map(function (img) {
    if (img.complete) return Promise.resolve();
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  });
  Promise.race([Promise.all(ready), new Promise(function (resolve) { setTimeout(resolve, 1500); })]).then(function () {
    if (finished) return;
    logo.classList.add('rh-play');
    // Fallback for disabled CSS animations or a missing animationend event.
    playTimer = setTimeout(completed, 1800);
  });
  window.addEventListener('pageshow', function (event) { if (event.persisted) finish(); });
})();
