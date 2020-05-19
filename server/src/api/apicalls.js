/*
    The home for all Spotify API Calls Defined
*/

//Required Modules
require("dotenv").config({ path: __dirname + "/./../../.env" });
const mongoose = require("mongoose");
const request = require("request");
const User = require("../modules/User");
const Playlist = require("../modules/Playlist");
mongoose.connect(
  "mongodb+srv://dylansap:spotifyapp@spotifyapp-eey1y.mongodb.net/test?retryWrites=true&w=majority",
  { dbName: "spotifyapp" }
);

module.exports = {
  createPlaylist: async function createPlaylist(queryemail) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        User.findOne({ email: queryemail })
          .exec()
          .then((doc) => {
            console.log(doc);
            const query_userid = doc.id;
            const query_token = doc.access_token;
            const query_name = doc.name;
            const query_refresh = doc.refresh_token;
            const playlist_name = query_name + "'s Recommended Playlist";
            const playlist_description = "Auto-Generated By SpotifyPlaylistApp";

            var headers = {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: "Bearer " + query_token,
            };

            var dataString =
              '{"name":"' +
              playlist_name +
              '","description":"' +
              playlist_description +
              '","public":true}';

            var options = {
              url:
                "https://api.spotify.com/v1/users/" +
                query_userid +
                "/playlists",
              method: "POST",
              headers: headers,
              body: dataString,
            };

            async function callback(error, response, body) {
              if (!error && response.statusCode == 201) {
                var plist_data = JSON.parse(body);
                console.log(plist_data.id);
                const playlist = new Playlist({
                  _id: new mongoose.Types.ObjectId(),
                  name: query_name,
                  playlist_id: plist_data.id,
                  id: query_userid,
                  email: queryemail,
                });

                playlist.save().then((result) => {
                  console.log(result);
                });

                resolve("sucesss!");
              } else {
                console.log(error);
                if (response.statusCode === 401) {
                  console.log("Authorization Token Expired or Invalid");
                  let result = await module.exports.refreshToken(queryemail);
                  console.log(result);
                  if (result === true) {
                    module.exports.createPlaylist(queryemail);
                  } else {
                    resolve("Could not refresh access token!");
                  }
                } else {
                  resolve("Great Failure:" + response.statusCode);
                }
              }
            }

            request(options, callback);
          })
          .catch((err) => {
            console.log(err);
          });
      }, 3000);
    });
  },

  refreshToken: async function refreshToken(query_refresh) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        //Get the refreshtoken from param
        //use refresh token to make post request to API
        var refresh_token = query_refresh;
        var authOptions = {
          url: "https://accounts.spotify.com/api/token",
          headers: {
            Authorization:
              "Basic " +
              new Buffer(
                process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET
              ).toString("base64"),
          },
          form: {
            grant_type: "refresh_token",
            refresh_token: refresh_token,
          },
          json: true,
        };

        request.post(authOptions, function (error, response, body) {
          if (!error && response.statusCode === 200) {
            console.log(body);
            var new_access_token = body.access_token;

            User.findOneAndUpdate(
              { refresh_token: query_refresh },
              { $set: { access_token: new_access_token } },
              { new: true },
              (err, doc) => {
                if (err) {
                  console.log(err);
                  resolve(false);
                } else {
                  console.log(doc);
                  resolve(true);
                }
              }
            );
          } else {
            console.log(response.statusCode);
            console.log(body);
            console.log(error);
            resolve(false);
          }
        });

        //Process the information sent back from API
        //Update user document with new access token / refresh token
        //resolve new access token
      }, 3000);
    });
  },

  addSongToPlaylist: async function refreshToken(song_id, playlist_id) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {}, 3000);
    });
  },
};
