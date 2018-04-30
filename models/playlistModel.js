const client = require('./redis.js');
const uuid = require('shortid');
const engine = require('../engine/engine.js');
const { audioFeatures } = require('./spotifyModel.js');
const { findTrack, findUser } = require('./userModel.js');

async function createPlaylist(newPlaylist, values) {
  const playlistId = uuid.generate();
  const trackId = uuid.generate();
  const bankId = uuid.generate();
  const collabId = uuid.generate();
  let playlist = {
    admin: newPlaylist.admin,
    name: newPlaylist.name,
    tracks: trackId,
    bank: bankId,
    collabs: collabId,
    ...values,
  };
  await client.hmset(`playlist:${playlistId}`, playlist);
  await client.sadd(`tracks:${bankId}`, newPlaylist.tracks);
  await client.sadd(`collabs:${collabId}`, newPlaylist.admin);
  await client.sadd('recent', playlistId);
  return playlistId;
}

async function createTrackList(tracks) {
  const trackId = uuid.generate();
  await client.sadd(`tracks:${trackId}`, tracks);
  await client.expireat(`tracks:${trackId}`, parseInt((+new Date)/1000) + 10);
  return trackId;
}

async function deletePlaylist(object) {
  await client.del(`playlist:${object.playlist}`);
  await client.del(`tracks:${object.bank}`);
  await client.del(`tracks:${object.tracks}`);
  await client.del(`collabs:${object.collabs}`);
  await client.srem('recent', object.playlist);
  return 'done';
}

async function getDisplayPlaylist(id, simple) {
  return new Promise((resolve, reject) => {
    const playlist = {};
    playlist.id = id;
    client.hgetall(`playlist:${id}`, async (err, details) => {
      if (err) reject(err);
      if (!details) resolve(null);
      playlist.adminId = details.admin;
      const user = await findUser(playlist.adminId);
      playlist.admin = user.name;
      playlist.name = details.name;
      if (details.dance) playlist.dance = 'Dance';
      if (details.energy) playlist.energy = 'Energetic';
      if (details.loud) playlist.loud = 'Loud';
      if (details.instrumental) playlist.instrumental = 'Instrumental';
      if (details.live) playlist.live = 'Live';
      if (details.mood === '1') playlist.mood = 'Happy';
      if (details.mood === '0') playlist.mood = 'Sad';
      if (details.major) playlist.major = 'Major';
      if (details.minor) playlist.minor = 'Minor';
      if (details.done) playlist.done = true;
      client.smembers(`tracks:${details.tracks}`, async (err, tracks) => {
        if (err) reject(err);
        playlist.length = tracks.length;
        playlist.tracks = await Promise.all(tracks.map(async el => await findTrack(el)));
        playlist.tracks = playlist.tracks.length ? playlist.tracks.reduce((prev, curr) => prev.concat(curr)) : [];
        playlist.cover = playlist.tracks.length ? playlist.tracks.reduce((acc,el) => {
          if (acc.length < 4) {
            acc.push({image: el.image, popularity: el.popularity});
            return acc.sort((a,b) => b.popularity - a.popularity);
          } else if (el.popularity > acc[3].popularity) {
            acc = [
              ...acc.slice(0,3),
              {image: el.image, popularity: el.popularity}
            ];
            return acc.sort((a,b) => b.popularity - a.popularity);
          } else return acc;  
        }, []).map(el => el.image) : undefined;
        client.smembers(`collabs:${details.collabs}`, async (err, users) => {
          if (err) reject(err);
          collabers = await Promise.all(users.map(async el => await findUser(el)));
          playlist.collabers = collabers.map(el => el.name);
          resolve(playlist);
        })
      })
    });
  });
}

async function getPlaylistDetails(id) {
  return new Promise((resolve, reject) => {
    const playlist = {};
    client.hgetall(`playlist:${id}`, async (err, details) => {
      playlist.adminId = details.admin;
      const user = await findUser(playlist.adminId);
      playlist.collabs = details.collabs;
      playlist.bank = details.bank;
      playlist.admin = user.name;
      playlist.name = details.name;
      playlist.trackId = details.tracks;
      playlist.strict = Number(details.strict);
      if (details.dance) playlist.dance = details.dance;
      if (details.energy) playlist.energy = details.energy;
      if (details.loud) playlist.loud = details.loud;
      if (details.instrumental) playlist.instrumental = details.instrumental;
      if (details.live) playlist.live = details.live;
      if (Number(details.mood)) playlist.mood = Number(details.mood);
      if (Number(details.mood) === 0) playlist.mood = Number(details.mood);
      if (details.major) playlist.major = details.major;
      if (details.minor) playlist.minor = details.minor;
      if (err) reject(err);
      client.smembers(`tracks:${details.tracks}`, async (err, reply) => {
        playlist.tracks = reply;
        resolve(playlist);
        if (err) reject(err);
      })
    });
  });
}

async function intersectTracks(playlist, collab, collaborator, refresh) {
  return new Promise(async (resolve, reject) => {
    client.sismember(`collabs:${playlist.collabs}`, collaborator, (err, results) => {
      if (err) reject(500);
      if (results) {
      } else {
        client.SINTER(`tracks:${playlist.bank}`, `tracks:${collab}`, async (err, intersect) => {
          let rejected = [];
          if (intersect.length) {
            const filtered = await audioFeatures(intersect, refresh);
            const matched = engine.match(filtered.body.audio_features, playlist);
            client.sadd(`tracks:${playlist.tracks}`, matched);
          } if (err) reject(500);
          client.sdiff(`tracks:${collab}`, `tracks:${playlist.bank}`, (err, diff) => {
            if (diff.length) client.sadd(`tracks:${playlist.bank}`, diff);
            client.sadd(`collabs:${playlist.collabs}`, collaborator);
            if (err) reject(500);
            resolve(200);
          });
        });
      }
    });
  });
}

async function recentPlaylists() {
  return new Promise((resolve, reject) => {
    client.smembers('recent', async (err, reply) => {
      if(err) reject(err);
      if(!reply.length) resolve({playlists: []});
      let playlists = await Promise.all(reply.map(async el => {
        return await getDisplayPlaylist(el, true);
      }));
      playlists = playlists.map(el => {
        if (el.tracks.length) {
          const coverImg = el.tracks.reduce((acc,el) => {
            if (acc.length < 4) {
              acc.push({image: el.image, popularity: el.popularity});
              return acc.sort((a,b) => b.popularity - a.popularity);
            } else if (el.popularity > acc[3].popularity) {
              acc = [
                ...acc.slice(0,3),
                {image: el.image, popularity: el.popularity}
              ];
              return acc.sort((a,b) => b.popularity - a.popularity);
            } else return acc;
          }, []).map(el => el.image);
          return {
            ...el,
            cover: coverImg,
          };
        } else {
          return el;
        }
      });
      resolve({playlists: playlists});
    })
  });
}

async function retrieveTrackList(id) {
  return new Promise((resolve, reject) => {
    client.hgetall(`playlist:${id}`, async (err, reply) => {
      resolve(reply);
      if (err) reject(err);
    });
  });
}

async function setExpiry(object) {
  await client.hmset(`playlist:${object.playlist}`, {done: 1});
  await client.expireat(`playlist:${object.playlist}`, parseInt((+new Date)/1000) + 3600);
  await client.expireat(`tracks:${object.bank}`, parseInt((+new Date)/1000) + 3600);
  await client.expireat(`tracks:${object.tracks}`, parseInt((+new Date)/1000) + 3600);
  await client.expireat(`collabs:${object.collabs}`, parseInt((+new Date)/1000) + 3600);
  await client.srem('recent', object.playlist, parseInt((+new Date)/1000) + 3600);
}

module.exports = {
  createPlaylist,
  createTrackList,
  deletePlaylist,
  getDisplayPlaylist,
  getPlaylistDetails,
  intersectTracks,
  recentPlaylists,
  retrieveTrackList,
  setExpiry
}