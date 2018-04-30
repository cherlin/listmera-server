const engine = require('../engine/engine.js');
const { findUser, modifyUser } = require('../models/userModel.js');
const { getDisplayPlaylist } = require('../models/playlistModel.js');

module.exports = {
  get: async function (ctx) {
    const user = await findUser(ctx.headers.user);
    if (!user) {
      ctx.status = 401;
      return;
    } else {
      user.adminOf = await Promise.all(user.adminOf.map(async el => await getDisplayPlaylist(el, true)));
      ctx.response.body = user;
      ctx.status = 200;
    }
  },
  modify: async function (ctx) {
    const object = ctx.request.body;
    const username = object.username;
    delete object.username;
    ctx.status = await modifyUser(username, object);
  },
  refresh: async function (ctx) {
    const object = ctx.request.body;
    const username = object.username;
  }
};