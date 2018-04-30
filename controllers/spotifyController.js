//contains basic spotify setup
const spotify = require('../secrets/spotifyConf.js');
//pushes user through authentication and login process via spotify and returns all the users details.
const { getAuth } = require('../models/spotifyModel.js');

const scopes = ['user-read-private', 'user-read-email', 'playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-public', 'playlist-modify-private'];
const state = 'prov-state';

module.exports = {
  auth: async function (ctx) {
    ctx.redirect(spotify.createAuthorizeURL(scopes, state))
  },
  register: async function (ctx) {
    const authCode = ctx.request.body.code;
    const user = await getAuth(authCode);
    ctx.response.body = {
      name: user.name,
      username: user.username,
      picture: user.picture,
      playlists: user.adminOf,
    }
    ctx.status = 200;
  }
};