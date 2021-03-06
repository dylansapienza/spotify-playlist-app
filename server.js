// require("dotenv").config({ path: __dirname + "/./.env" });
const mongoose = require("mongoose");
var express = require("express"); // Express web server framework
var request = require("request"); // "Request" library
var cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");
const User = require("./src/modules/User");
const Playlist = require("./src/modules/Playlist");
const P_Info = require("./src/modules/P_Info");
const UserData = require("./src/modules/UserData");
const bcrypt = require("bcrypt");
const apiCalls = require("./src/api/apicalls");
const Recommendation = require("./src/modules/Recommendation");
//Need to add flags to avoid deprication MONGODB

const PORT = process.env.PORT || 8888;

mongoose.set("useNewUrlParser", true);
mongoose.set("useUnifiedTopology", true);

mongoose.connect(
  "mongodb://dylansap:spotifyapp@spotifyapp-shard-00-00-eey1y.mongodb.net:27017,spotifyapp-shard-00-01-eey1y.mongodb.net:27017,spotifyapp-shard-00-02-eey1y.mongodb.net:27017/test?ssl=true&replicaSet=spotifyapp-shard-0&authSource=admin&retryWrites=true&w=majority",
  { dbName: "spotifyapp" }
);

console.log(mongoose.connection.readyState);

var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your secret
var redirect_uri = "https://linked-playlists.herokuapp.com/callback"; // Your redirect uri
/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function (length) {
  var text = "";
  var possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = "spotify_auth_state";

var app = express();

app
  .use(express.static(__dirname + "\\../public"))
  .use(cors())
  .use(cookieParser())
  .use(express.json());

app.get("/login", function (req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = "user-read-private user-read-email playlist-modify-public";
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state,
      })
  );
});

app.get("/callback", function (req, res) {
  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(
      "/#" +
        querystring.stringify({
          error: "state_mismatch",
        })
    );
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code",
      },
      headers: {
        Authorization:
          "Basic " +
          new Buffer(client_id + ":" + client_secret).toString("base64"),
      },
      json: true,
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token,
          refresh_token = body.refresh_token;
        console.log(body);

        var options = {
          url: "https://api.spotify.com/v1/me",
          headers: { Authorization: "Bearer " + access_token },
          json: true,
        };

        request.get(options, async function (error, response, body) {
          console.log(body);

          //Mongoose
          // const user = new User({
          //   _id: new mongoose.Types.ObjectId(),
          //   name: body.display_name,
          //   access_token: access_token,
          //   refresh_token: refresh_token,
          //   id: body.id,
          //   email: body.email,
          // });
          // user.save().then((result) => {
          //   console.log(result);
          // });

          let account_e = await UserData.exists({ spotify_id: body.id });

          if (!account_e) {
            var pp_data;

            if (body.images[0]) {
              pp_data = body.images[0].url;
            } else {
              pp_data = "";
            }

            const userdata = new UserData({
              _id: new mongoose.Types.ObjectId(),
              spotify_id: body.id,
              profile_picture: pp_data,
              username: "",
              password: "",
              email: "",
              fname: "",
              lname: "",
              access_token: access_token,
              refresh_token: refresh_token,
              email: body.email,
              playlists: [],
              friends: [],
            });
            userdata.save(function (err) {
              if (err) return console.log(err);
            });
          } else {
            res.redirect(
              "/?" +
                querystring.stringify({
                  error: "This Spotify ID Already Exists, Login",
                })
            );
            return;
          }

          // we can also pass the token to the browser to make requests from there
          res.redirect(
            "/accountinfo?" +
              querystring.stringify({
                id: body.id,
              })
          );
        });
      } else {
        res.redirect(
          "/#" +
            querystring.stringify({
              error: "invalid_token",
            })
        );
      }
    });
  }
});

app.post("/api/playlist/", async (req, res) => {
  const doc_id = req.body.token;
  const playlist_name = req.body.p_name;
  const playlist_description = req.body.p_desc;

  console.log(doc_id, playlist_name);
  //const passkey = req.body.passkey; For Future Auth

  const output = await apiCalls.createPlaylist(
    doc_id,
    playlist_name,
    playlist_description
  );

  console.log(output);

  res.send(output);
});
//Should probably send through a post request
app.post("/api/recommendation/", async function (req, res) {
  const host_id = req.body.host_id;
  const friend_id = req.body.friend_id;
  const comment = req.body.comment;
  const rating = req.body.rating;
  const song_id = req.body.song_id;
  const playlist_id = req.body.playlist_id;

  if (friend_id === "") {
    console.log(mongoose.connection.readyState);
    const output = await apiCalls.addSongToPlaylist(
      song_id,
      host_id,
      friend_id,
      playlist_id,
      comment,
      rating
    );

    console.log(output);

    res.send(output);
  } else {
    let doc = await UserData.findOne({ spotify_id: host_id });
    console.log(doc);
    const output = await apiCalls.addSongToPlaylist(
      song_id,
      await doc._id,
      friend_id,
      playlist_id,
      comment,
      rating
    );

    console.log(output);

    res.send(output);
  }
});

app.post("/api/getrecommendation", async function (req, res) {
  const trackuri = req.body.trackuri;
  const playlist_id = req.body.playlist_id;

  let doc = await Recommendation.findOne({
    track_id: trackuri,
    playlist_id: playlist_id,
  });

  console.log(doc);

  if (doc.friend_id === "") {
    res.send("400");
    return;
  }

  let doc2 = await UserData.findById(doc.friend_id);

  var recommendationinfo = {
    username: await doc2.username,
    rating: doc.rating,
    comment: doc.comment,
  };

  res.send({ recommendationinfo: recommendationinfo });
});

app.post("/accountcreation", async (req, res) => {
  //const p_info = JSON.parse(req.body);
  console.log(req.body);
  //req.body.spotify_id!
  const password = req.body.password;

  const hash = await bcrypt.hash(password, 10);

  UserData.findOneAndUpdate(
    { spotify_id: req.body.spotify_id },
    {
      username: req.body.username,
      fname: req.body.fname,
      lname: req.body.lname,
      email: req.body.email,
      password: hash,
    }
  ).exec(async function (err, userdata) {
    if (err) console.log(err);
    else {
      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
          user: "linkedplaylists@gmail.com", // generated ethereal user
          pass: "ronaldroy", // generated ethereal password
        },
      });

      // send mail with defined transport object
      let info = await transporter.sendMail({
        from: '"Linked Playlists" <linkedplaylists@gmail.com>', // sender address
        to: req.body.email, // list of receivers
        subject: "Linked Playlists Registration", // Subject line
        text:
          "Hello" +
          req.body.fname +
          ", Thanks for Creating an Account on Linked Playlists!", // plain text body
        html: "<b>Thanks! -a</b>", // html body
      });

      console.log("Message sent: %s", info.messageId);
      // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

      // Preview only available when sending through an Ethereal account
      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
      // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...

      console.log(userdata);
      res.send("/loginuser");
    }
  });

  // const p_info = new P_Info({
  //   _id: new mongoose.Types.ObjectId(),
  //   spotify_id: req.body.spotify_id,
  //   username: req.body.username,
  //   fname: req.body.fname,
  //   lname: req.body.lname,
  //   email: req.body.email,
  //   password: hash,
  // });
  // p_info.save().then((result) => {
  //   console.log(result);
  //   res.send("http://localhost:3000/login?n=y");
  // });
});

app.post("/logincred", async (req, res) => {
  UserData.findOne({ username: req.body.username })
    .exec()
    .then(async (doc) => {
      if (doc === null) {
        res.send("Invalid Username/Password");
        return;
      }
      console.log(doc);
      const query_hash = doc.password;

      const isLoggedIn = await bcrypt.compare(req.body.password, query_hash);
      console.log(isLoggedIn);
      if (isLoggedIn) {
        //Valid!
        //Respond with Login Session w/ Username
        //Redirect to homepage
        //Using Document.id as login cookie, should probably change this to something more secure
        res.send(doc.id);
      } else {
        //Invalid
        res.send("Invalid Username/Password");
        //try again
      }
    });
});

app.post("/api/getPlaylists", async (req, res) => {
  const user_token = req.body.user_token;
  var playlistInfo = [];
  var p_data;
  var refresh_token;
  var access_token;
  var doc_id;

  // if (req.body.username) {
  //   var username = req.body.username;
  //   console.log("USERNAME CALL:", username);
  //   await UserData.findOne({ username: username }, async function (
  //     err,
  //     userinfo
  //   ) {
  //     user_token = userinfo._id;
  // console.log("USER TOKEN RECEIVED: ", user_token);
  // await UserData.findById(user_token, async function (err, userdata) {
  //   p_data = userdata.playlists;
  //   refresh_token = userdata.refresh_token;
  //   access_token = userdata.access_token;
  //   doc_id = userdata._id;
  //   //console.log(refresh_token);
  // });

  //console.log("USER TOKEN RECEIVED: ", user_token);
  // await UserData.findById(user_token, async function (err, userdata) {
  //   p_data = userdata.playlists;
  //   refresh_token = userdata.refresh_token;
  //   access_token = userdata.access_token;
  //   doc_id = userdata._id;

  //   if (!p_data) {
  //     console.log("NULL ERROR");
  //   } else {
  //     var playlists = Array(Object.keys(p_data)).fill(0);
  //   }

  //   //console.log(p_data);
  //   //console.log(Object.keys(p_data).length);

  //   //var playlists = Array(Object.keys(p_data)).fill(0);

  //   for (let i = 0; i < Object.keys(p_data).length; i++) {
  //     //console.log(i, ":", JSON.parse(JSON.stringify(p_data[i].playlist_id)));
  //     let p = JSON.parse(JSON.stringify(p_data[i]));
  //     playlists[i] = await apiCalls.getPlaylistInfo(
  //       doc_id,
  //       p.playlist_id,
  //       p.ownership,
  //       access_token,
  //       refresh_token
  //     );
  //   }

  //   //console.log(playlists);
  //   res.send(playlists);
  // });
  // } else {
  //   user_token = req.body.user_token;
  // }
  //Query Cookie ID
  //console.log(user_token);

  console.log("UserTOKEN:" + user_token);

  await UserData.findById(user_token, async function (err, userdata) {
    p_data = userdata.playlists;
    refresh_token = userdata.refresh_token;
    access_token = userdata.access_token;
    doc_id = userdata._id;
    if (!p_data) {
      console.log("NULL ERROR");
    } else {
      var playlists = Array(Object.keys(p_data)).fill(0);
    }

    //console.log(p_data);
    //console.log(Object.keys(p_data).length);

    //var playlists = Array(Object.keys(p_data)).fill(0);

    for (let i = 0; i < Object.keys(p_data).length; i++) {
      //console.log(i, ":", JSON.parse(JSON.stringify(p_data[i].playlist_id)));
      let p = JSON.parse(JSON.stringify(p_data[i]));
      playlists[i] = await apiCalls.getPlaylistInfo(
        doc_id,
        p.playlist_id,
        p.ownership,
        access_token,
        refresh_token
      );
    }

    //console.log(playlists);
    res.send(playlists);

    //console.log(refresh_token);
  });

  //console.log(playlistInfo);

  //Return Playlist ID's to Update
  //API Call to Spotify for Info

  //Spotify Call Update The Data In DB

  //Return Array of Objects
  // Playlist Title
  // Image Link
  // Description

  //Return Track INFO? NO THANKS
});

app.post("/api/getuserplaylists", async (req, res) => {
  const username = req.body.username;
  var playlistInfo = [];
  var p_data;
  var refresh_token;
  var access_token;
  var doc_id;

  console.log("Fetching " + username + "'s Playlists");

  await UserData.findOne({ username: username }, async function (
    err,
    userdata
  ) {
    p_data = userdata.playlists;
    refresh_token = userdata.refresh_token;
    access_token = userdata.access_token;
    doc_id = userdata._id;
    if (!p_data) {
      console.log("NULL ERROR");
    } else {
      var playlists = Array(Object.keys(p_data)).fill(0);
    }

    //console.log(p_data);
    //console.log(Object.keys(p_data).length);

    //var playlists = Array(Object.keys(p_data)).fill(0);

    for (let i = 0; i < Object.keys(p_data).length; i++) {
      //console.log(i, ":", JSON.parse(JSON.stringify(p_data[i].playlist_id)));
      let p = JSON.parse(JSON.stringify(p_data[i]));
      playlists[i] = await apiCalls.getPlaylistInfo(
        doc_id,
        p.playlist_id,
        p.ownership,
        access_token,
        refresh_token
      );
    }

    //console.log(playlists);
    res.send(playlists);

    //console.log(refresh_token);
  });

  //console.log(playlistInfo);

  //Return Playlist ID's to Update
  //API Call to Spotify for Info

  //Spotify Call Update The Data In DB

  //Return Array of Objects
  // Playlist Title
  // Image Link
  // Description

  //Return Track INFO? NO THANKS
});

app.post("/api/getTracks", async function (req, res) {
  // var user_token;
  // if (req.body.username) {
  //   var username = req.body.username;
  //   await UserData.findOne({ spotify_id: username }, async function (
  //     err,
  //     userinfo
  //   ) {
  //     user_token = userinfo._id;
  //   });
  // } else {
  //   user_token = req.body.user_token;
  // }
  const user_token = req.body.user_token;

  const playlist_id = req.body.playlist_id;

  //console.log(playlist_id, user_token);

  var tracks = await apiCalls.getTracks(playlist_id, user_token);

  //console.log(tracks);

  res.send(tracks);
});

app.post("/api/tracksearch", async function (req, res) {
  const user_token = req.body.user_token;
  const track_name = req.body.track_name;
  const artist_name = req.body.artist_name;

  //Get Access and Refresh Token From User ID
  let doc = await UserData.findById(user_token);
  //Pass in track_name, artist_name, access_token, refresh_token
  var search_results = await apiCalls.trackSearch(
    track_name,
    artist_name,
    await doc.access_token,
    await doc.refresh_token
  );

  res.send({ search_results: search_results });
  console.log("sent!");
  // res.send({ search_results: await search_results });
  //Return JSON Object with Array of Tracks
});

app.post("/api/users", async function (req, res) {
  const searchquery = req.body.searchquery;

  UserData.find(
    { username: { $regex: ".*" + searchquery + ".*", $options: "i" } },
    { _id: 0, password: 0, access_token: 0, refresh_token: 0, spotify_id: 0 },
    function (err, users) {
      if (err) console.log(err);
      else {
        res.send(users);
      }
    }
  );
});

app.post("/api/checkrelation", async function (req, res) {
  var user_token = req.body.user_token;
  var p_owner = req.body.p_owner;
  var isFriend = 4;

  let doc = await UserData.findById(user_token);

  let doc2 = await UserData.findOne({ spotify_id: p_owner });

  if ((await doc.username) === (await doc2.username)) {
    res.send("1");
    return;
  }

  for (var i = 0; i < (await doc.friends.length); i++) {
    //throwing errors here!
    if (doc.friends[i].friend_id === doc2.username) {
      isFriend = doc.friends[i].status;
    }
  }

  console.log(isFriend);

  if (isFriend === 1) {
    res.send("2");
    return;
  }
  if (isFriend === 2 || isFriend === 0) {
    res.send("3");
    return;
  } else {
    res.send("4");
  }
});

app.post("/api/getfriends", async function (req, res) {
  const user_token = req.body.user_token;

  let doc = await UserData.findById(user_token);

  var friends = [];

  for (var i = 0; i < doc.friends.length; i++) {
    //throwing errors here!
    let frienddetail = await UserData.findOne({
      username: doc.friends[i].friend_id,
    });
    friends.push({
      username: await doc.friends[i].friend_id,
      status: await doc.friends[i].status,
      profile_picture: await frienddetail.profile_picture,
      fname: frienddetail.fname,
      lname: frienddetail.lname,
    });
  }

  res.send({ friends: friends });
});

app.post("/api/friendrequest", async function (req, res) {
  //Sender ID will allow us to use their token_id
  const sender_id = req.body.user_token;
  //For Reciever We will need to use a findOne query
  const reciever_id = req.body.username;

  console.log(sender_id, "is requesting", reciever_id, "to be friends");

  var addtosender = { friend_id: reciever_id, status: 2 };

  let doc = await UserData.findOneAndUpdate(
    { _id: sender_id },
    { $push: { friends: addtosender } }
  );

  console.log(doc.username);
  var addtoreciever = { friend_id: await doc.username, status: 0 };

  await UserData.findOneAndUpdate(
    { username: reciever_id },
    { $push: { friends: addtoreciever } }
  );

  res.send("Success!");
});

app.post("/api/frienddecline", async function (req, res) {});

app.post("/api/getFriend", async function (req, res) {
  const user_token = req.body.user_token;
  const friend_id = req.body.username;
  var isFriend = -1;

  console.log("Checking if Token:", user_token, "is Friends with ", friend_id);

  let doc = await UserData.findOne({ _id: user_token });

  if ((await doc.username) === friend_id) {
    res.send({ isFriend: 400 });
    return;
  }

  console.log(doc.friends);

  for (var i = 0; i < doc.friends.length; i++) {
    //throwing errors here!
    if (doc.friends[i].friend_id === friend_id) {
      isFriend = doc.friends[i].status;
    }
  }
  console.log(isFriend);
  res.send({ isFriend: isFriend });
});

app.post("/api/friendaccept", async function (req, res) {
  const user_id = req.body.user_token;
  const friend = req.body.username;

  let doc = await UserData.findOneAndUpdate(
    { _id: user_id, "friends.friend_id": friend },
    { $set: { "friends.$.status": 1 } }
  );

  console.log(await doc.username);

  UserData.findOneAndUpdate(
    { username: friend, "friends.friend_id": await doc.username },
    { $set: { "friends.$.status": 1 } },
    function (err, doc2) {
      if (err) {
        console.log(err);
      } else {
        console.log(doc2);
      }
    }
  );

  res.send("Success!");
});

app.get("/refresh_token", function (req, res) {
  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: "https://accounts.spotify.com/api/token",
    headers: {
      Authorization:
        "Basic " +
        new Buffer(client_id + ":" + client_secret).toString("base64"),
    },
    form: {
      grant_type: "refresh_token",
      refresh_token: refresh_token,
    },
    json: true,
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        access_token: access_token,
      });
    }
  });
});

if (process.env.NODE_ENV === "production") {
  app.use(
    express.static(path.join(__dirname, "/client/spotify-app-frontend/build"))
  );
  app.get("*", (req, res) => {
    res.sendFile(
      path.resolve(
        __dirname,
        "client",
        "spotify-app-frontend",
        "build",
        "index.html"
      )
    );
  });
}

console.log("Listening on", PORT);
app.listen(PORT);
