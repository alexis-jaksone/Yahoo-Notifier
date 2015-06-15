'use strict';

var app = new EventEmitter();

app.once('load', function () {
  var script = document.createElement('script');
  document.body.appendChild(script);
  script.src = '../common.js';
});

app.Promise = Promise;

app.storage = (function () {
  var objs = {};
  chrome.storage.local.get(null, function (o) {
    objs = o;
    app.emit('load');
  });
  return {
    read: function (id) {
      return (objs[id] || !isNaN(objs[id])) ? objs[id] + '' : objs[id];
    },
    write: function (id, data) {
      objs[id] = data;
      var tmp = {};
      tmp[id] = data;
      chrome.storage.local.set(tmp, function () {});
    }
  };
})();

app.XMLHttpRequest = window.XMLHttpRequest;

app.get = function (url, headers, data) {
  var xhr = new XMLHttpRequest();
  var d = app.Promise.defer();
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status >= 400 && xhr.status !== 500) {
        var e = new Error(xhr.statusText);
        e.status = xhr.status;
        d.reject(e);
      }
      else {
        d.resolve(xhr.responseText);
      }
    }
  };
  xhr.open(data ? 'POST' : 'GET', url, true);
  for (var id in headers) {
    xhr.setRequestHeader(id, headers[id]);
  }
  xhr.send(data ? JSON.stringify(data) : '');
  return d.promise;
};

app.popup = {
  send: function (id, data) {
    chrome.extension.sendRequest({method: id, data: data});
  },
  receive: function (id, callback) {
    chrome.extension.onRequest.addListener(function (request, sender) {
      if (request.method === id && !sender.tab) {
        callback(request.data);
      }
    });
  }
};

app.content_script = {
  send: function (id, data, global) {
    var options = global ? {} : {active: true, currentWindow: true};
    chrome.tabs.query(options, function (tabs) {
      tabs.forEach(function (tab) {
        chrome.tabs.sendMessage(tab.id, {method: id, data: data}, function () {});
      });
    });
  },
  receive: function (id, callback) {
    chrome.extension.onRequest.addListener(function (request, sender) {
      if (request.method === id && sender.tab) {
        callback(request.data);
      }
    });
  }
};

app.tab = {
  open: function (url, inBackground, inCurrent) {
    if (inCurrent) {
      chrome.tabs.update(null, {url: url});
    }
    else {
      chrome.tabs.create({
        url: url,
        active: typeof inBackground === 'undefined' ? true : !inBackground
      });
    }
  },
  openOptions: function () {

  },
  list: function () {
    var d = app.Promise.defer();
    chrome.tabs.query({
      currentWindow: false
    },
    function (tabs) {
      d.resolve(tabs);
    });
    return d.promise;
  }
};

app.version = function () {
  return chrome[chrome.runtime && chrome.runtime.getManifest ? 'runtime' : 'extension'].getManifest().version;
};

app.button = (function () {
  var callback;
  chrome.browserAction.onClicked.addListener(function () {
    if (callback) {
      callback();
    }
  });
  return {
    onCommand: function (c) {
      callback = c;
    },
    onContext: function () {},
    set label (val) {
      chrome.browserAction.setTitle({
        title: val
      });
    },
    set badge (val) {
      chrome.browserAction.setBadgeText({
        text: (val ? val : '') + ''
      });
    }
  };
})();

app.windows = {
  getCurrent: function (callback) {
    chrome.windows.getCurrent(callback);
  },
  focus: function (id) {
    chrome.windows.update(id, {'focused': true});
  },
  create: function (url, type, width, height, top, left, callback) {
    chrome.windows.create({
      'url': url,
      'type': type,
      'width': width,
      'height': height,
      'top': top,
      'left': left,
      'focused': true
    }, callback);
  },
  remove: function (callback) {
    chrome.windows.onRemoved.addListener(callback);
  }
};

app.timer = window;
app.parser = new window.DOMParser();
app.manifest = chrome.extension.getURL('');

app.options = {
  send: function (id, data) {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach(function (tab) {
        if (tab.url.indexOf('options/options.html') !== -1) {
          chrome.tabs.sendMessage(tab.id, {method: id, data: data}, function () {});
        }
      });
    });
  },
  receive: function (id, callback) {
    chrome.extension.onRequest.addListener(function (request, sender) {
      if (request.method === id && sender.tab && sender.tab.url.indexOf('options/options.html') !== -1) {
        callback(request.data);
      }
    });
  }
};

/* webRequest */
var urls =
  [
   '*://*.m.yahoo.com/*',
   '*://m.yahoo.com/*',
   '*://*.mail.yahoo.com/*',
   '*://mail.yahoo.com/*',
   '*://*.mg.mail.yahoo.com/*',
   '*://m.mg.mail.yahoo.com/*',
   '*://login.yahoo.com/*'
  ];

chrome.webRequest.onBeforeSendHeaders.addListener(
  function (info) {
    var headers = info.requestHeaders;
    if (info.tabId > -1 || info.type === 'xmlhttprequest') {  // from panel and not from background page
      return;
    }
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].name.toLowerCase() === 'user-agent') {
        headers[i].value =
          'Mozilla/5.0 (iPhone; CPU iPhone OS 8_0_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12A405 Safari/600.1.4';
      }
    }
    return {requestHeaders: headers};
  },
  {urls: urls}, ['blocking', 'requestHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    for (var i = 0; i < details.responseHeaders.length; ++i) {
      if (
        details.responseHeaders[i].name.toLowerCase() === 'x-frame-options' ||
        details.responseHeaders[i].name.toLowerCase() === 'frame-options'
      ) {
        details.responseHeaders.splice(i, 1);
        return {
          responseHeaders: details.responseHeaders
        };
      }
    }
  },
  {urls: urls}, ['blocking', 'responseHeaders']
);

// panel or webpage is requesting update, so check for badge updates
chrome.webRequest.onHeadersReceived.addListener(  // from panel
  function () {
    app.emit('update');
  },
  {
    urls: ['http://m.mg.mail.yahoo.com/hg/search/controller/controller.php?*', 'https://m.mg.mail.yahoo.com/hg/search/controller/controller.php?*']
  }, ['responseHeaders']
);
chrome.webRequest.onHeadersReceived.addListener(  // from Yahoo website
  function (info) {
    if (info.tabId > -1) {
      app.emit('update');
    }
  },
  {
    urls: ['https://*.mail.yahoo.com/ws/mail/v2.0/jsonrpc?*']
  }, ['responseHeaders']
);
