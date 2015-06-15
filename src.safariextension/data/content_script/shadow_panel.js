'use strict';

var isSafari = typeof safari !== 'undefined',
    isChrome = typeof chrome !== 'undefined';

function script (src, callback) {
  var head = document.querySelector('head');
  var s = document.createElement('script');
  s.type = 'text/javascript';
  s.src = src;
  s.onload = callback;
  head.appendChild(s);
}

if (isChrome || isSafari) {
  script('panel.js');
}
