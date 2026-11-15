// Place glint sparkles over the hero logo and cheese cards (decor only).
(function () {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const spots = [[18, 30], [32, 62], [48, 24], [63, 58], [78, 34], [88, 66], [12, 74], [54, 82]];
  spots.forEach(([x, y], i) => {
    const s = document.createElement('i');
    s.className = 'spark';
    s.setAttribute('aria-hidden', 'true');
    s.style.left = x + '%'; s.style.top = y + '%';
    s.style.animationDelay = (i * 0.45) + 's';
    hero.appendChild(s);
  });
})();
