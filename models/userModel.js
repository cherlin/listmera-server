const mongo = require('./mongo.js');

function findTrack(identifier) {
  return new Promise((resolve, reject) => {
    mongo.then(db => {
      db.collection('tracks')
        .find({id: identifier})
        .toArray((err, results) => {
          resolve(results);
          if (err) reject(err);
      });
    });
  });
}

async function findUser(id) {
  const db = await mongo;
  return new Promise((resolve, reject) => {
    db.collection('users')
      .find({username: id})
      .toArray((err, results) => {
        resolve(results);
        if (err) reject(err);
      });;
  });
}

async function loginModel(data) {
  const db = await mongo;
  return new Promise((resolve, reject) => {
    db.collection('users')
      .find({username: data.username})
      .toArray((err, results) => {
        resolve(results);
        if (err) reject(err);
      });;
  });
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

async function registerModel(object) {
  const db = await mongo;
  const simplePlaylists = await Promise.all(object.playlists.map(async playlist => {
    if (playlist) {
      const tracks = await Promise.all(playlist.tracks.map(async song => {
        const exists = await findTrack(song.id);
        if (!exists.length) {
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
    username: object.username,
    name: object.name,
    email: object.email,
    picture: object.picture,
    playlists: simplePlaylists,
    refresh: object.refresh,
    token: object.token,
    adminOf: [],
  });
  return await loginModel(object);
}

async function removeAdmin(object) {
  const db = await mongo;
  const user = await findUser(object.username);
  const lists = user[0].adminOf.filter(el => el !== object.id);
  await db.collection('users').update(
    { username: object.username },
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
  loginModel,
  modifyUser,
  registerModel,
  removeAdmin,
  userPlaylistModel
}