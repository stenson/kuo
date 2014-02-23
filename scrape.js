var _ = require("underscore");
var Rdio = require("./rdio/rdio");
var credentials = require("./credentials");
var fs = require("fs");
var http = require("http");
var clc = require("cli-color");
var country = require("country-data");
var util = require("./util/util");

var rdio = new Rdio([credentials.rdio.key, credentials.rdio.secret]);

var echonest = function(method, params, callback) {
  params.push(["api_key", credentials.echonest.key]);
  params.push(["format", "json"]);
  
  util.json.get("http://developer.echonest.com/api/v4/" + method, params, function(err, data, fullURL) {
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

var geocodeArtistLocation = function(artist, callback) {
  var location = util.obj.fetch(artist, "echonest.artist.artist_location");
  if (!location) return callback(artist);
  
  var countryRecord = country.lookup.countries({ name: location.country });
  if (countryRecord.length == 0) return callback(artist);
  
  util.json.get("http://services.gisgraphy.com//geocoding/geocode", [
    ["address", location.location],
    ["country", countryRecord[0].alpha2],
    ["format", "json"]
  ], function(err, data) {
    artist.geocoded = data && data.result[0];
    callback(artist);
  });
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
          count: count, offset: offset + count, recourses: --recourses, output: output, completed: completed
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
          geocodeArtistLocation(artist, function() {
            artistFetchedShouldRecord(artist);
          });
        });
      } else {
        artistFetchedShouldRecord(null);
      }
    });
  });
};

var remoteFetch = function(file) {
  fetchRdioWithUserKey("s415316", {
    count: 20,
    offset: 0,
    recourses: 0,
    completed: function(output) {
      fs.writeFileSync(file, JSON.stringify(output, null, 2));
    }
  });
};

remoteFetch("public/data/tracks-2.json");