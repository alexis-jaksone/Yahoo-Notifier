/* globals self, safari */
'use strict';

var background = {}, manifest = {},
  isFirefox = typeof self !== 'undefined' && self.port,
  isSafari = typeof safari !== 'undefined',
  isChrome = typeof chrome !== 'undefined';

var url = 'https://mail.yahoo.com';

/**** wrapper (start) ****/
if (isChrome) {
  background.send = function (id, data) {
    chrome.extension.sendRequest({method: id, data: data});
  };
  background.receive = function (id, callback) {
    chrome.extension.onRequest.addListener(function (request) {
      if (request.method === id) {
        callback(request.data);
      }
    });
  };
  manifest.url = chrome.extension.getURL('');
  window.setTimeout(function () {
    document.getElementById('popup-iframe').src = url;
  }, 100);
}
if (isSafari) {
  background = (function () {
    var callbacks = {};
    return {
      send: function (id, data) {
        safari.extension.globalPage.contentWindow.app.popup.dispatchMessage(id, data);
      },
      receive: function (id, callback) {
        callbacks[id] = callback;
      },
      dispatchMessage: function (id, data) {
        if (callbacks[id]) {
          callbacks[id](data);
        }
      }
    };
  })();
  manifest.url = safari.extension.baseURI;
  safari.application.addEventListener('popover', function () {
    window.setTimeout(function () {
      document.getElementById('popup-iframe').src = url;
    }, 100);
  }, false);
}
if (isFirefox) {
  background.send = self.port.emit;
  background.receive = self.port.on;
  manifest.url = self.options.base;
  if (document.location.href.indexOf('resource:') === 0) {
    // wait for 5 seconds to show the gif loader if user checks the panel right away, else load Yahoo mail UI
    window.setTimeout(function () {
      document.location.href = url;
    }, 5000);
  }
}
/**** wrapper (end) ****/

background.receive('resize', function (o) {
  if (isChrome) {
    document.body.style.width = o.width + 'px';
    document.body.style.height = (o.height - 20) + 'px';
    document.querySelector('html').style.height = (o.height - 20) + 'px';
  }
});
background.send('resize');
