var http = require("http");
var _ = require("underscore");

var appendRecordToHashAtKey = function(record, obj, key) {
  if (obj[key]) {
    obj[key].push(record);
  } else {
    obj[key] = [record];
  }
};

var fetch = function(obj, keypath, defaultValue) {
  var keys = keypath.split(".");
  var val = _.reduce(keys, function(acc, key) {
    return acc && acc[key] ? acc[key] : null;
  }, obj);
  return val || defaultValue;
};

var get = function(url, params, callback) {
  var queryString = _.map(params, function(pair, i) { return pair.join("="); }).join("&");
  var fullURL = url + "?" + queryString;
  
  http.get(fullURL, function(res) {
    res.setEncoding("utf8");
    var json = "";
    res.on("data", function(chunk) { json += chunk; });
    res.on("end", function() {
      var parsed;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        callback("messed up json", json, fullURL);
        return;
      }
      callback(null, parsed, fullURL);
    });
  }).on("error", function(err) {
    callback(err, null, fullURL);
  });
};

exports.obj = {
  appendRecordToHashAtKey: appendRecordToHashAtKey,
  fetch: fetch
};

exports.json = {
  get: get
};