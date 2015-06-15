'use strict';

/**** wrapper (start) ****/
var isFirefox = typeof require !== 'undefined';

if (isFirefox) {
  var app = require('./firefox/firefox');
  var config = require('./config');
}
/**** wrapper (end) ****/

/* welcome */
var version = config.welcome.version;
if (app.version() !== version) {
  app.timer.setTimeout(function () {
    app.tab.open(
      'http://add0n.com/fastest-yahoo.html?v=' + app.version() +
      (version ? '&p=' + version + '&type=upgrade' : '&type=install')
    );
    config.welcome.version = app.version();
  }, config.welcome.timeout);
}

/* email */
var email = (function () {
  var url;

  var server = function () {
    var fgSDwd = false;
    var d = app.Promise.defer();
    var req = new app.XMLHttpRequest();
    req.onreadystatechange = function () {
      if (req.responseURL && !fgSDwd) {
        d.resolve(req.responseURL);
        req.abort();
      }
    };
    req.open('GET', 'https://mail.yahoo.com?background=true', true);
    req.send();
    return d.promise;
  };

  function json () {
    return app.get(url, {
      'Accept': 'application/json, multipart/form-data',
      'Content-Type': 'application/json; charset=UTF-8'
    }, {
      'method': 'ListFolders',
      'params':[{
        'resetMessengerUnseen': true
      }]
    })
    .then(function (content) {
      if (content) {
        return JSON.parse(content);
      }
      else {
        throw Error('Response content is null');
      }
    });
  }

  function build () {
    return server().then(function (u) {
      url = u.split('.com')[0] + '.com/ws/mail/v2.0/jsonrpc?appid=YahooMailNeo&m=ListFolders&ymbucketid=exclusiveBkt';
      return json().then(function (json) {
        if (json && json.error && json.error.url) {
          var wssid = /wssid\=([^\&]+)/.exec(json.error.url);
          if (wssid && wssid.length) {
            url += '&wssid=' + wssid[1];
            return url;
          }
          else {
            throw Error('Cannot parse wssid from error response');
          }
        }
        else {
          throw Error('Cannot detect URL from jsonrpc error response');
        }
      });
    });
  }
  function count (json) {
    if (!json || !json.result || !json.result.folder) {
      return app.Promise.reject('Cannot detect json.result.folder object from server\'s response');
    }
    return json.result.folder
    .filter(function (f) {
      return f.folderInfo.fid === 'Inbox';
    })
    .reduce(function (p, c) {
      return p += parseInt(c.unread);
    }, 0);
  }

  return function () {
    if (url) {
      return json().then(count);
    }
    else {
      return build().then(json).then(count, function () {
        url = '';
      });
    }
  };
})();

var check = (function () {
  var last = 0, id;
  return function () {
    var now = (new Date()).getTime();
    if (now - last < 5000) {
      if (id) {
        app.timer.clearTimeout(id);
      }
      id = app.timer.setTimeout(check, 5000 + last - now);
      return;
    }
    last = now;
    if (id) {
      app.timer.clearTimeout(id);
    }
    id = app.timer.setTimeout(check, 1000 * config.interval.time, true);
    email().then(
      function (c) {
        app.button.badge = c;
      },
      function () {
      }
    );
  };
})();
app.on('update', check);
check();

app.popup.receive('check-notifications', check);

app.popup.receive('resize', function () {
  app.popup.send('resize', {
    width: config.popup.width,
    height: config.popup.height
  });
});

/* options */
app.options.receive('changed', function (o) {
  config.set(o.pref, o.value);
  app.options.send('set', {
    pref: o.pref,
    value: config.get(o.pref)
  });
});
app.options.receive('get', function (pref) {
  app.options.send('set', {
    pref: pref,
    value: config.get(pref)
  });
});
