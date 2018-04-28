const engine = require('../engine/engine.js');
const { findUser, modifyUser } = require('../models/userModel.js');
const { getDisplayPlaylist } = require('../models/playlistModel.js');

module.exports = {
  get: async function (ctx) {
    const user = await findUser(ctx.headers.user);
    if (!user[0]) {
      ctx.status = 401;
      return;
    } else {
      user[0].adminOf = await Promise.all(user[0].adminOf.map(async el => await getDisplayPlaylist(el, true)));
      ctx.response.body = user[0];
      ctx.status = 200;
    }
  },
  modify: async function (ctx) {
    const object = JSON.parse(ctx.request.body);
    const username = object.username;
    delete object.username;
    ctx.status = await modifyUser(username, object);
  },
  refresh: async function (ctx) {
    const object = JSON.parse(ctx.request.body);
    const username = object.username;
  }
};