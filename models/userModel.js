const mongo = require('./mongo.js');

async function findTrack(id) {
  const db = await mongo;
  return db.collection('tracks').findOne({id})
}

async function findUser(username) {
  const db = await mongo;
  return db.collection('users').findOne({username})
}

async function modifyUser(userId, object) {
  const db = await mongo;
  await db.collection('users').update(
    { username: userId },
    { $set: { ...object }
  });
  return 200;
}

function cleanDb(db) {
  var duplicates = [];
  return new Promise ((resolve, reject) => {
    db.collection('tracks').aggregate([
      { $group: {
        _id: { id: '$id'},
        dups: { '$addToSet': '$_id' },
        count: { '$sum': 1 }
      }},
      { $match: { 
        count: { '$gt': 1 }
      }}
    ],
    {allowDiskUse: true}
    )
    .forEach((doc) => {
        doc.dups.shift();
        doc.dups.forEach((dupId) => {
          duplicates.push(dupId);
        }
      )
    }, () => db.collection('tracks').remove({_id:{$in:duplicates}}, () => resolve('done!')));
  });
}

async function registerModel(user) {
  const db = await mongo;
  const simplePlaylists = await Promise.all(user.playlists.map(async playlist => {
    if (playlist) {
      const tracks = await Promise.all(playlist.tracks.map(async song => {
        const exists = await findTrack(song.id);
        if (!exists) {
          await db.collection('tracks').insertOne(song)
        }
        return song.id;
      }));
      return {
        ...playlist,
        tracks: tracks,
      }
    }
  }));
  await cleanDb(db);
  await db.collection('users').insertOne({
    username: user.username,
    name: user.name,
    email: user.email,
    picture: user.picture,
    playlists: simplePlaylists,
    refresh: user.refresh,
    token: user.token,
    adminOf: [],
  });
  return await findUser(user.username);
}

async function removeAdmin(user) {
  const db = await mongo;
  const user = await findUser(user.username);
  const lists = user.adminOf.filter(el => el !== user.id);
  await db.collection('users').update(
    { username: user.username },
    { $set: { adminOf: lists } });
  return 202;
}

async function userPlaylistModel(object) {
  const db = await mongo;
  await db.collection('users').update(
    { username: object.username },
    { $push: { adminOf: object.id } });
  return 201;
}

module.exports = { 
  findTrack,
  findUser,
  modifyUser,
  registerModel,
  removeAdmin,
  userPlaylistModel
}