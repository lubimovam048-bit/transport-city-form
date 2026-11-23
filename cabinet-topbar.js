/* Top bar shared by the cabinet pages: copying the ID and its hint */
(function () {
    var copyButton = document.querySelector('[data-copy]');
    var copyStatus = document.querySelector('.topbar__status');
    var copyTimer;
    copyButton.addEventListener('click', function () {
      var use = copyButton.querySelector('use');
      var done = function () {
        use.setAttribute('href', '#i-check');
        copyButton.classList.add('is-copied');
        copyStatus.textContent = 'ID скопирован';
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          use.setAttribute('href', '#i-copy');
          copyButton.classList.remove('is-copied');
          copyStatus.textContent = '';
        }, 1600);
      };
      var fallback = function () {
        var area = document.createElement('textarea');
        area.value = copyButton.dataset.copy;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        area.remove();
        copyButton.focus();
        if (ok) done();
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(copyButton.dataset.copy).then(done, fallback);
      else fallback();
    });
    var helpButton = document.querySelector('.topbar__help');
    var helpTip = document.getElementById('idHint');
    var setHelp = function (open) {
      helpTip.classList.toggle('is-open', open);
      helpButton.classList.toggle('is-open', open);
      helpButton.setAttribute('aria-expanded', String(open));
    };
    helpButton.addEventListener('click', function (event) {
      event.stopPropagation();
      setHelp(!helpTip.classList.contains('is-open'));
    });
    document.addEventListener('click', function (event) {
      if (!helpTip.contains(event.target)) setHelp(false);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setHelp(false);
    });
})();
