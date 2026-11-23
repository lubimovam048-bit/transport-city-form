/* Demo of the project page: a click marks a section as filled, another click clears it.
   «Доп. сведения» is optional, so it does not count towards the ring. */
(function () {
  var tiles = [].slice.call(document.querySelectorAll('[data-section]'));
  var segments = [].slice.call(document.querySelectorAll('.pring path'));
  var beavers = [].slice.call(document.querySelectorAll('.pring__beaver'));
  var count = document.querySelector('[data-progress]');
  var submit = document.querySelector('.psubmit');
  var hint = document.querySelector('.psummary__hint');
  var required = tiles.filter(function (tile) { return tile.dataset.section === 'required'; });

  function update() {
    var filled = required.filter(function (tile) { return tile.classList.contains('is-done'); }).length;
    segments.forEach(function (segment, index) { segment.classList.toggle('is-on', index < filled); });
    var state = filled === 3 ? '3' : filled > 0 ? '1' : '0';
    beavers.forEach(function (beaver) { beaver.classList.toggle('is-on', beaver.dataset.state === state); });
    count.textContent = filled + ' из 3';
    submit.disabled = filled < 3;
    hint.textContent = filled < 3 ? 'Отправить можно, когда все разделы заполнены' : 'Все разделы заполнены, проект можно отправить';
  }

  tiles.forEach(function (tile) {
    var toggle = tile.querySelector('.ptoggle');
    var label = toggle.querySelector('[data-label]');
    toggle.addEventListener('click', function () {
      var done = tile.classList.toggle('is-done');
      toggle.setAttribute('aria-pressed', String(done));
      if (label) label.textContent = done ? 'Изменить' : 'Заполнить';
      update();
    });
  });
  update();
})();
