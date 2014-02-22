var _ = require("underscore");
var Rdio = require("./rdio/rdio");
var credentials = require("./credentials");
var fs = require("fs");
var http = require("http");
var clc = require("cli-color");
var country = require("country-data");

var appendRecordToHashAtKey = function(record, obj, key) {
  if (obj[key]) {
    obj[key].push(record);
  } else {
    obj[key] = [record];
  }
};

var fetch = function(obj, keypath) {
  var keys = keypath.split(".");
  return _.reduce(keys, function(acc, key) {
    return acc && acc[key] ? acc[key] : null;
  }, obj);
};

var rdio = new Rdio([credentials.rdio.key, credentials.rdio.secret]);

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

var echonest = function(method, params, callback) {
  params.push(["api_key", credentials.echonest.key]);
  params.push(["format", "json"]);
  
  get("http://developer.echonest.com/api/v4/" + method, params, function(err, data, fullURL) {
    callback(err, err ? data : data.response, fullURL);
  });
};

var lookupEchonestArtistProfile = function(artist, timeout, callback) {
  setTimeout(function() {
    echonest("artist/profile", [["id", artist.rosetta], ["bucket", "artist_location"]], function(err, json, url) {
      artist.echonest = json;
      console.log(">", artist.rdio.name);
      callback(artist);
    });
  }, timeout);
};

var fetchRdioWithUserKey = function(userKey, options) {
  var count = options.count || 20;
  var offset = options.offset || 0;
  var recourses = options.recourses || 0;
  var completed = options.completed || null;
  var output = options.output || {};
  var resultCount = 0;
  
  var artistFetchedShouldRecord = function(artist) {
    if (artist) {
      output[artist.rosetta] = artist;
    }
    
    if (--resultCount == 0) {
      if (recourses > 0) {
        fetchRdioWithUserKey(userKey, {
          count: count,
          offset: offset + count,
          recourses: --recourses,
          output: output,
          completed: completed
        });
      } else {
        completed && completed(output);
      }
    }
  };
  
  rdio.call("getTracksInCollection", {
    user:userKey, sort:"playCount", count:count, start:offset
  }, function(err, data) {
    var timeout = 0;
    resultCount = data.result.length;

    _.map(_.map(data.result, function(entry, i) {
      return {
        common: { name: entry.artist },
        rdio: entry,
        rosetta: "rdio-US:artist:" + entry.artistKey
      };
    }), function(artist, i) {
      if (!output[artist.rosetta]) {
        output[artist.rosetta] = 1;
        console.log("searching\t", clc.red(artist.rosetta), "\t", clc.green(artist.common.name));
        lookupEchonestArtistProfile(artist, timeout += 1000, function(artist) {
          var location = fetch(artist, "echonest.artist.artist_location");
          var countryRecord = country.lookup.countries({ name: location.country });
          if (countryRecord.length > 0) {
            get("http://services.gisgraphy.com//geocoding/geocode", [
              ["address", location.location],
              ["country", countryRecord[0].alpha2],
              ["format", "json"]
            ], function(err, data) {
              artist.geocoded = data && data.result[0];
              artistFetchedShouldRecord(artist);
            });
          } else {
            artistFetchedShouldRecord(artist);
          }
        });
      } else {
        artistFetchedShouldRecord(null);
      }
    });
  });
};

var localRead = function() {
  var countries = {};
  fs.readFile("data/artists.json", { encoding: "utf-8" }, function(err, data) {
    _.each(JSON.parse(data), function(artist) {
      var country = fetch(artist, "echonest.artist.artist_location.country");
      appendRecordToHashAtKey(fetch(artist, "common.name"), countries, country);
    });
    console.log(clc.yellow(JSON.stringify(countries, null, 2)));
  });
};

var localReadTracks = function(file) {
  fs.readFile(file, { encoding: "utf-8" }, function(err, data) {
    _.each(JSON.parse(data), function(item, i) {
      var location = fetch(item, "echonest.artist.artist_location");
      if (location) {
        var countryRecord = country.lookup.countries({ name: location.country });
        if (countryRecord.length > 0) {
          get("http://services.gisgraphy.com//geocoding/geocode", [
            ["address", location.location],
            ["country", countryRecord[0].alpha2],
            ["format", "json"]
          ], function(err, data) {
            if (data && data.result[0]) {
              var geocoded = data.result[0];
              console.log(JSON.stringify({
                artist: fetch(item, "echonest.artist.name"),
                geocoded: geocoded
              }, null, 2));
            }
          });
        }
      }
    });
  });
};

var remoteFetch = function() {
  fetchRdioWithUserKey("s415316", {
    count: 5,
    offset: 0,
    recourses: 0,
    completed: function(output) {
      fs.writeFileSync("data/tracks-1.json", JSON.stringify(output, null, 2));
      //localReadTracks("data/tracks-1.json");
    }
  });
};

remoteFetch();
//localRead();
//localReadTracks("data/tracks-1.json");
