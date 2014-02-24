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
  var method = options.method;
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
          method: method, count: count, offset: offset + count,
          recourses: --recourses, output: output, completed: completed
        });
      } else {
        completed && completed(output);
      }
    }
  };
  
  rdio.call(method, {
    user:userKey, sort:"playCount", count:count, start:offset
  }, function(err, data) {
    var timeout = 0;
    resultCount = data.result.length;

    _.map(_.map(data.result, function(entry, i) {
      return {
        common: { name: entry.name },
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

var remoteFetch = function(file, userKey) {
  fetchRdioWithUserKey(userKey, {
    method: "getArtistsInCollection",
    count: 100,
    offset: 0,
    recourses: 3,
    completed: function(output) {
      var toWrite = _.compact(_.map(output, function(entry) {
        return entry.geocoded ? {
          artistName: entry.common.name,
          coordinates: [entry.geocoded.lng, entry.geocoded.lat],
          location: entry.echonest.artist.artist_location.location
        } : null;
      }));
      
      fs.writeFileSync(file, JSON.stringify(toWrite, null, 2));
    }
  });
};

//remoteFetch("public/data/scraped/robstenson.json", "s415316");
//remoteFetch("public/data/scraped/couch.json", "s1382");
remoteFetch("public/data/scraped/sayre.json", "s1584922");