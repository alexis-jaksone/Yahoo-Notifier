// Load Firefox based resources
var self          = require("sdk/self"),
    data          = self.data,
    sp            = require("sdk/simple-prefs"),
    buttons       = require("sdk/ui/button/action"),
    Request       = require("sdk/request").Request,
    prefs         = sp.prefs,
    pageMod       = require("sdk/page-mod"),
    pageWorker    = require("sdk/page-worker"),
    tabs          = require("sdk/tabs"),
    tabsUtils     = require("sdk/tabs/utils"),
    timers        = require("sdk/timers"),
    loader        = require('@loader/options'),
    windowUtils   = require('sdk/window/utils'),
    contextMenu   = require("sdk/context-menu"),
    array         = require('sdk/util/array'),
    unload        = require("sdk/system/unload"),
    {Cc, Ci, Cu}  = require('chrome'),
    {on, off, once, emit} = require('sdk/event/core'),
    windows       = {
      get active () { // Chrome window
        return windowUtils.getMostRecentBrowserWindow()
      }
    },
    tbExtra       = require("./tbExtra"),
    config        = require("../config");

Cu.import("resource://gre/modules/Promise.jsm");

exports.Promise = Promise;

// Event Emitter
exports.on = on.bind(null, exports);
exports.once = once.bind(null, exports);
exports.emit = emit.bind(null, exports);
exports.removeListener = function removeListener (type, listener) {
  off(exports, type, listener);
};

//toolbar button
exports.button = (function () {
  var button = buttons.ActionButton({
    id: self.name,
    label: "Yahoo™ Notifier Pro",
    icon: {
      "16": "./icons/16.png",
      "32": "./icons/32.png"
    },
    onClick: function() {
      popup.show({
        width: config.popup.width,
        height: config.popup.height,
        position: button
      });
    }
  });
  tbExtra.setButton(button);
  return {
    onCommand: function (c) {
      onClick = c;
    },
    set label (val) {
      button.label = val;
    },
    set badge (val) {
      if (config.ui.badge) {
        tbExtra.setBadge(val);
      }
    }
  }
})();

var popup = require("sdk/panel").Panel({
  contentURL: data.url("content_script/panel.html"),
  contentScriptFile: [data.url("content_script/panel.js")],
  contentStyleFile: [data.url("content_script/inject.css")],
  contentScriptOptions: {base: loader.prefixURI + loader.name + "/"},
  contentScriptWhen: "start"
});
popup.on('show', function() {
  popup.port.emit('show', true);
});

exports.storage = {
  read: function (id) {
    return (prefs[id] || prefs[id] + "" == "false") ? (prefs[id] + "") : null;
  },
  write: function (id, data) {
    data = data + "";
    if (data === "true" || data === "false") {
      prefs[id] = data === "true" ? true : false;
    }
    else if (parseInt(data) + '' === data) {
      prefs[id] = parseInt(data);
    }
    else {
      prefs[id] = data + "";
    }
  }
}

exports.XMLHttpRequest = function () {
  return Cc['@mozilla.org/xmlextras/xmlhttprequest;1']
    .createInstance(Ci.nsIXMLHttpRequest);
};

exports.get = function (url, headers, data) {
  var d = new Promise.defer();
  Request({
    url: url,
    headers: headers || {},
    content: JSON.stringify(data),
    onComplete: function (response) {
      d.resolve(response.text);
    }
  })[data ? "post" : "get"]();
  return d.promise;
}

exports.popup = {
  send: function (id, data) {
    popup.port.emit(id, data);
  },
  receive: function (id, callback) {
    popup.port.on(id, callback);
  }
}

exports.content_script = {
  send: function (id, data, global) {
    workers.forEach(function (worker) {
      if (!global && worker.tab != tabs.activeTab) return;
      if (!worker) return;
      worker.port.emit(id, data);
    });
  },
  receive: function (id, callback) {
    content_script_arr.push([id, callback]);
  }
}

exports.tab = {
  open: function (url, inBackground, inCurrent) {
    if (inCurrent) {
      tabs.activeTab.url = url;
    }
    else {
      tabs.open({
        url: url,
        inBackground: typeof inBackground == 'undefined' ? false : inBackground
      });
    }
  },
  openOptions: function () {

  },
  list: function () {
    var temp = [];
    for each (var tab in tabs) {
      temp.push(tab);
    }
    return Promise.resolve(temp);
  }
}

exports.version = function () {
  return self.version;
}

exports.timer = timers;
exports.parser = Cc["@mozilla.org/xmlextras/domparser;1"].createInstance(Ci.nsIDOMParser);

exports.notification = (function () { // https://github.com/fwenzel/copy-shorturl/blob/master/lib/simple-notify.js
  return function (title, text) {
    try {
      let alertServ = Cc["@mozilla.org/alerts-service;1"].
                      getService(Ci.nsIAlertsService);
      alertServ.showAlertNotification(data.url("icon32.png"), title, text, null, null, null, "");
    }
    catch(e) {
      let browser = window.active.gBrowser,
          notificationBox = browser.getNotificationBox();

      notification = notificationBox.appendNotification(text, 'jetpack-notification-box',
          data.url("icon32.png"), notificationBox.PRIORITY_INFO_MEDIUM, []
      );
      timer.setTimeout(function() {
          notification.close();
      }, 5000);
    }
  }
})();

exports.play = function (url) {
  var worker = pageWorker.Page({
    contentScript: "var audio = new Audio('" + url + "'); audio.addEventListener('ended', function () {self.postMessage()}); audio.volume = 1; audio.play();",
    contentURL: data.url("firefox/sound.html"),
    onMessage: function(arr) {
      worker.destroy();
    }
  });
}

exports.options = (function () {
  var workers = [], options_arr = [];
  pageMod.PageMod({
    include: data.url("options/options.html"),
    contentScriptFile: data.url("options/options.js"),
    contentScriptWhen: "start",
    contentScriptOptions: {
      base: loader.prefixURI + loader.name + "/"
    },
    onAttach: function(worker) {
      array.add(workers, worker);
      worker.on('pageshow', (w) => array.add(workers, w));
      worker.on('pagehide', (w) => array.remove(workers, w));
      worker.on('detach', (w) => array.remove(workers, w));

      options_arr.forEach(function (arr) {
        worker.port.on(arr[0], arr[1]);
      });
    }
  });
  return {
    send: function (id, data) {
      workers.forEach(function (worker) {
        if (!worker || !worker.url) return;
        worker.port.emit(id, data);
      });
    },
    receive: (id, callback) => options_arr.push([id, callback])
  }
})();

sp.on("openOptions", function() {
  exports.tab.open(data.url("options/options.html"));
});
unload.when(function () {
  exports.tab.list().then(function (tabs) {
    tabs.forEach(function (tab) {
      if (tab.url === data.url("options/options.html")) {
        tab.close();
      }
    });
  });
});

/* http Request Observer */
var httpRequestObserver = {
  observe: function(subject, topic, data) {
    if (topic == "http-on-modify-request") {
      try {
        var httpChannel = subject.QueryInterface(Ci.nsIHttpChannel);
        var url = httpChannel.URI.spec;
        if (url.indexOf('m.yahoo.com') === -1 && url.indexOf('mail.yahoo.com') === -1 && url.indexOf('login.yahoo.com') === -1) {
          return;
        }
        var noteCB = httpChannel.notificationCallbacks ? httpChannel.notificationCallbacks : httpChannel.loadGroup.notificationCallbacks;
        if (noteCB) {
          var domWin = noteCB.getInterface(Ci.nsIDOMWindow);
          var chromeTab = tabsUtils.getTabForContentWindow(domWin);
          if (chromeTab) {  // update is requested from Yahoo webpage
            if (url.indexOf('.mail.yahoo.com/ws/mail/v2.0/jsonrpc') !== 0) {
              exports.emit('update');
            }
          }
          if (url.indexOf('m.yahoo.com/w/ygo-mail/message.bp') !== -1 || url.indexOf('m.yahoo.com/w/ygo-mail/folder.bp') !== -1) {
            exports.emit('update');
          }
          if (!chromeTab) { // when there is no Tab (chromeTab), the httpChannel is from Panel
            var topLevelUrl = httpChannel.URI.host;
            var urls =
            [
              "yahooapis",
              "s.yimg.com",
              "m.yahoo.com",
              "mail.yahoo.com",
              "beap.gemini.yahoo",
              "mg.mail.yahoo.com",
              "sqmIFwWga4FYBa"
            ];
            for (var i = 0; i < urls.length; i++) {
              if (topLevelUrl.indexOf(urls[i]) !== -1) {
                var value = 'Mozilla/5.0 (iPhone; CPU iPhone OS 8_0_2 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.0 Mobile/12A405 Safari/600.1.4';
                httpChannel.setRequestHeader("User-Agent", value, false);
                break;
              }
            }
          }
        }
      }
      catch (e) {}
    }
  },
  get observerService() {
    return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  },
  register: function() {
    this.observerService.addObserver(this, "http-on-modify-request", false);
  },
  unregister: function() {
    this.observerService.removeObserver(this, "http-on-modify-request");
  }
};
httpRequestObserver.register();
unload.when(function () {
  httpRequestObserver.unregister();
});
